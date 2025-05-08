import * as crypto from 'crypto';
import * as path from 'path';

import * as vscode from 'vscode';

import { Api, Asset, AssetModifiedError, Branch, Project } from '../api';
import FileDecorationProvider from './file-decoration-provider';
import { LocalAsset } from '../common/asset';
import { ProjectPath } from '../utils/project-path';

let fileDecorationProvider: any;

const DEBUG = process.env.VSCODE_DEBUG_MODE === 'true';
const SEARCH_RESULT_MAX_LENGTH = 80;

type SearchResult = {
    uri: vscode.Uri;
    line: number;
    lineText: string;
};

class CloudStorageProvider implements vscode.FileSystemProvider {
    projects: LocalProject[] = [];

    userId: number | null = null;

    context: vscode.ExtensionContext;

    _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]>;

    typesReference: string;

    syncProjectsCalled: boolean;

    syncProjectsPromise: Promise<any> | null;

    projectDataProvider: any;

    api: Api;

    constructor(context: vscode.ExtensionContext, projectDataProvider: any) {
        this.projects = [];
        this.userId = null;

        this.context = context;
        this.api = new Api(context);
        this._onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

        const filePath = path.join(
            __dirname,
            '..',
            'node_modules',
            'playcanvas',
            'build/playcanvas.d.ts'
        );
        this.typesReference = `///<reference path="${filePath}" />;\n`;

        this.refresh();

        this.syncProjectsCalled = false;
        this.syncProjectsPromise = null;
        this.projectDataProvider = projectDataProvider;
    }

    get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
        if (DEBUG) console.log('playcanvas: onDidChangeFile');
        return this._onDidChangeFile.event;
    }

    isProjectPath(pathStr: string): boolean {
        return pathStr.split('/').length === 2;
    }

    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        if (DEBUG) console.log(`playcanvas: stat ${uri.path}`);

        if (
            uri.path.includes('.vscode') ||
            uri.path.includes('.git') ||
            uri.path.includes('.devcontainer') ||
            uri.path.includes('node_modules') ||
            uri.path.includes('pom.xml') ||
            uri.path.includes('AndroidManifest.xml')
        ) {
            throw vscode.FileSystemError.FileNotFound();
        }

        let project = this.getProject(uri.path);
        if (!project) {
            // if projects are not synced yet
            if (this.projects.length === 0) {
                if (DEBUG) console.log(`playcanvas: stat ${uri.path} no projects`);
                await this.ensureSyncProjects();
                project = this.getProject(uri.path);
            }
        }

        if (!project) {
            if (DEBUG) console.log(`playcanvas: stat ${uri.path} not found`);
            throw vscode.FileSystemError.FileNotFound();
        }

        if (this.isProjectPath(uri.path)) {
            const projectModified = new Date(project.modified).getTime();
            const projectCreated = new Date(project.created).getTime();
            return {
                type: vscode.FileType.Directory,
                // permissions: 0,
                size: 0,
                ctime: projectCreated,
                mtime: projectModified
            };
        }

        const asset = this.lookup(uri);
        if (!asset) {
            if (DEBUG) console.log(`playcanvas: stat ${uri.path} not found`);
            throw vscode.FileSystemError.FileNotFound();
        }

        const modified = new Date(asset.modifiedAt).getTime();
        const created = new Date(asset.createdAt).getTime();

        if (asset.type === 'folder') {
            return {
                type: vscode.FileType.Directory,
                // permissions: 0,
                size: 0,
                ctime: created,
                mtime: modified
            };
        }

        return {
            type: vscode.FileType.File,
            // permissions: 0,
            size: asset.file.size,
            ctime: created,
            mtime: modified
        };
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        if (DEBUG) console.log(`playcanvas: readFile ${uri.path}`);

        if (
            uri.path.includes('.vscode') ||
            uri.path.includes('.git') ||
            uri.path.includes('.devcontainer')
        ) {
            throw vscode.FileSystemError.FileNotFound();
        }

        let project = this.getProject(uri.path);
        if (!project) {
            // if projects are not synced yet
            if (this.projects.length === 0) {
                if (DEBUG) console.log(`playcanvas: stat ${uri.path} no projects`);
                await this.ensureSyncProjects();
                project = this.getProject(uri.path);
            }
        }

        if (!project) {
            throw vscode.FileSystemError.FileNotFound();
        }

        const asset = this.lookup(uri);
        if (!asset) {
            throw vscode.FileSystemError.FileNotFound();
        }

        if (asset && asset.type === 'folder') {
            return new Uint8Array();
        }

        if (!asset.content) {
            asset.content = await this.fetchFileContent(asset, project.branchId);
        }

        if (asset.content === null) {
            throw vscode.FileSystemError.FileNotFound();
        }

        const config = vscode.workspace.getConfiguration('playcanvas');

        if (
            config.get('usePlaycanvasTypes') &&
            (asset.file.filename.endsWith('.js') ||
                asset.file.filename.endsWith('.mjs'))
        ) {
            return new TextEncoder().encode(this.typesReference + asset.content);
        }

        return new TextEncoder().encode(asset.content);
    }

    reconstructFileTree(pathStr: string): void {
        const parts = pathStr.split('/');
        const project = this.getProjectByName(parts[1]);

        if (!project || parts.length === 0) {
            console.warn(`playcanvas: reconstructFileTree ${pathStr} not found`);
            return;
        }

        let files = project.files;
        for (let i = 2; i < parts.length - 1; ++i) {
            const folder = files?.get(parts[i]);
            if (!folder) {
                // Note that it's possible for project.files to be undefined
                throw new Error(`Failed to find folder ${parts[i]}`);
            }
            files = folder.files;
        }
    }

    addFile(pathStr: string, asset: LocalAsset): void {
        const parts = pathStr.split('/');
        const project = this.getProjectByName(parts[1]);

        if (!project || parts.length === 0) {
            throw new Error(`Failed to find the project for ${pathStr}`);
        }

        this.reconstructFileTree(pathStr);

        if (project.files) {
            project.files.set(parts[parts.length - 1], asset);
        } else {
            throw new Error(`Failed to find files for project ${project.name}`);
        }
    }

    removeFile(pathStr: string): void {
        this.reconstructFileTree(pathStr);
    }

    async checkAssetSynced(uri: vscode.Uri, newContent: string) {
        const assetPath = new ProjectPath(uri.path, this);
        const localAsset = assetPath.localAsset;
        const serverAsset = await assetPath.getServerAsset();

        if (DEBUG) {
            console.log(`playcanvas: writeFile ${uri.path}\nlocalAsset:`, localAsset);
            console.log(
                `playcanvas: writeFile ${uri.path}\nserverAsset:`,
                serverAsset
            );
        }

        // Important to know if modifiedAt matches, because PUT calls will fail if not matching
        // This makes the assumption that only the server updates modifiedAt
        const isAssetSynced = serverAsset.modifiedAt === localAsset.modifiedAt;

        // Calculate file content hashes to determine if we need to stop
        // the user from pushing new changes.
        const remoteHash = serverAsset.file.hash;
        // This makes the assumption that only the server updates asset.file.hash
        const previousSyncHash = localAsset.file.hash;
        // Hash of our "new" file changes
        const localHash = crypto.createHash('md5').update(newContent).digest('hex');
        // File is "synced" if one of these is true:
        //              A) Our last sync matches remote
        //              B) Our current file matches the remote file
        //
        const isContentSynced =
            remoteHash === previousSyncHash || localHash === remoteHash;

        if (DEBUG) {
            console.log(
                `playcanvas: writeFile ${uri.path}\nremoteHash: ${remoteHash}\npreviousSyncHash: ${previousSyncHash}\nlocalHash: ${localHash}`);
            console.log(
                `playcanvas: writeFile ${uri.path}\nisContentSynced: ${isContentSynced}\nisAssetSynced: ${isAssetSynced}`
            );
        }

        return {
            isAssetSynced,
            isContentSynced,
            serverAsset,
            localAsset
        };
    }

    async writeFile(
        uri: vscode.Uri,
        content: Uint8Array,
        options: { create: boolean; overwrite: boolean }
    ): Promise<void> {
        if (DEBUG) console.log(`playcanvas: writeFile ${uri.path}`);

        const project = this.getProject(uri.path);
        let asset = this.lookup(uri);

        if (!project) {
            throw new Error(`Failed to find the project for ${uri.path}`);
        }

        if (!asset) {
            if (!options.create) {
                throw vscode.FileSystemError.FileNotFound();
            }

            const folderPath = path.dirname(uri.path);
            const folderUri = vscode.Uri.parse(
                `playcanvas:${path.dirname(uri.path)}`
            );

            // Construct the new Uri using the folder path and new name
            try {
                const root = this.isProjectPath(folderPath);
                const folderData = root ? null : this.lookup(folderUri);
                const name = uri.path.split('/').pop();

                if (!name) {
                    throw new Error(`Failed to get the name for ${uri.path}`);
                }

                // Run operation
                await this.api.createAsset(
                    project.id,
                    name,
                    {
                        folderId: folderData?.id,
                        branchId: project.branchId
                    }
                );

                // Re-sync local project data
                await this.refreshProject(project);
            } catch (error: any) {
                vscode.window.showErrorMessage(
                    `Failed to create a file: ${error.message}`
                );
            }
        } else {
            let strContent = new TextDecoder().decode(content);

            // Remove reference line before saving
            const config = vscode.workspace.getConfiguration('playcanvas');

            if (
                config.get('usePlaycanvasTypes') &&
                (asset.file.filename.endsWith('.js') ||
                    asset.file.filename.endsWith('.mjs'))
            ) {
                if (strContent.startsWith(this.typesReference)) {
                    strContent = strContent.substring(this.typesReference.length);
                    content = Buffer.from(strContent);
                }
            }

            // Check if the file asset is synced with the server
            const {
                isContentSynced, // Does file content match the server?
                isAssetSynced, // Does asset metadata match the server?
                serverAsset
            } = await this.checkAssetSynced(uri, strContent);

            if (!isContentSynced) {
                if (DEBUG) {
                    console.log(
                        `playcanvas: writeFile ${uri.path} - Latest file changes on the server have not been pulled yet.`
                    );
                }
                throw AssetModifiedError;
            }

            // We must handle a difference in metadata because the PUT will fail
            if (!isAssetSynced) {
                if (DEBUG) {
                    console.log(
                        `playcanvas: writeFile ${uri.path} - asset modified on server, but file content is synced. Pulling new metadata from server...`
                    );
                }

                asset = {
                    ...asset,
                    // Overwrite local metadata with server metadata
                    // Note: This method only merges the top-level properties
                    ...serverAsset,
                    // Add new file contents (since asset.content is from the previous update)
                    content: strContent
                };
            }

            // Update server asset
            const updatedAsset = await this.api.uploadFile(
                asset.id,
                asset.file.filename,
                asset.modifiedAt,
                strContent,
                project.branchId
            );
            if (DEBUG) {
                console.log('playcanvas: writeFile updatedAsset:', updatedAsset);
            }

            // Pull in new metadata from the server, and add the new file contents
            asset = {
                ...asset,
                // Overwrite local metadata with server metadata
                // Note: This method only merges the top-level properties
                ...updatedAsset,
                // Add new file contents (since asset.content is from the previous update)
                content: strContent
            };

            // Update local state
            if (project.files) {
                project.files.set(this.getFilename(asset), asset);
            } else {
                throw new Error(`Project ${project.name} has no files`);
            }

            if (DEBUG) {
                console.log('playcanvas: local asset updated to:', this.lookup(uri));
            }
        }
    }

    watch(uri: vscode.Uri): vscode.Disposable {
        // ignore, fires for all changes...
        return new vscode.Disposable(() => {});
    }

    isWritableFileSystem(scheme: string): boolean {
        return true;
    }

    async rename(oldUri: vscode.Uri, newUri: vscode.Uri): Promise<void> {
        const assetPath = new ProjectPath(oldUri.path, this);
        const newName = newUri.path.split('/').pop() ?? assetPath.path;
        const newParentFolder = this.lookup(
            vscode.Uri.parse(`playcanvas:${path.dirname(newUri.path)}`)
        );

        if (DEBUG) {
            console.log(`playcanvas: rename ${oldUri.path}`);
        }

        const serverAsset = await this.api.renameAsset(
            assetPath.localAsset.id,
            newName,
            {
                folderId: newParentFolder?.id,
                branchId: assetPath.project.branchId
            }
        );

        assetPath.localAsset.modifiedAt = serverAsset.modifiedAt;

        await this.refreshProject(assetPath.project);
    }

    getProject(pathStr: string): LocalProject | undefined {
        const assetPath = new ProjectPath(pathStr, this);

        return assetPath.project;
    }

    getProjectUri(project: LocalProject): vscode.Uri {
        return vscode.Uri.parse(`playcanvas:/${project.name}`);
    }

    getProjectByName(name: string): LocalProject | undefined {
        if (!name) {
            return;
        }

        const projectBranch = name.split(':');

        return this.projects.find(p => p.name === projectBranch[0]);
    }

    getBranchByFolderName(folderName: string): string {
        const projectBranch = folderName.split(':');
        return projectBranch[1] ? projectBranch[1] : 'main';
    }

    getProjectById(id: number): LocalProject | undefined {
        return this.projects.find(p => p.id === id);
    }

    async copy(sourceUri: vscode.Uri, targetUri: vscode.Uri): Promise<void> {
        console.log(`playcanvas: copy ${sourceUri.path}`);

        const asset = this.lookup(sourceUri);
        const folderUri = vscode.Uri.parse(
            `playcanvas:${path.dirname(targetUri.path)}`
        );
        const folderData = this.lookup(folderUri);
        const sourceProject = this.getProject(sourceUri.path);
        const targetProject = this.getProject(targetUri.path);
        const folderId = folderData?.id ?? null;

        // Validation
        if (!asset) {
            throw new Error(`Failed to find the asset for ${sourceUri.path}`);
        }
        if (!sourceProject) {
            throw new Error(`Failed to find the source project for ${sourceUri.path}`);
        }
        if (!targetProject) {
            throw new Error(`Failed to find the target project for ${targetUri.path}`);
        }
        if (sourceProject.id === targetProject.id) {
            throw new Error(
                `Cannot copy asset to the same project ${sourceProject.name}`
            );
        }

        // Run operation
        await this.api.copyAsset(
            sourceProject.id,
            asset.id,
            targetProject.id,
            folderId,
            {
                sourceProjectBranchId: sourceProject.branchId,
                targetProjectBranchId: targetProject.branchId
            }
        );

        // Re-sync project
        await this.refreshProject(targetProject);
    }

    async delete(assetUri: vscode.Uri): Promise<void> {
        const assetPath = new ProjectPath(assetUri.path, this);

        if (DEBUG) {
            console.log(`playcanvas: delete ${assetUri.path}`);
        }

        await this.api.deleteAsset(assetPath.localAsset.id, assetPath.project?.branchId);

        // Re-sync local project data
        await this.refreshProject(assetPath.project);
    }

    async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const dirPath = new ProjectPath(uri.path, this);

        if (DEBUG) {
            console.log(`playcanvas: readDirectory ${uri.path}`);
        }

        if (!dirPath.project) {
            throw new Error(`Failed to find the project for ${uri.path}`);
        }

        // const project = this.getProject(uri.path);
        await this.fetchAssets(dirPath.project);

        const fileMap = dirPath.isProjectPath ? dirPath.project.files : dirPath.folder?.files ?? new Map();
        const folderFiles = [...fileMap?.values() ?? []];

        console.log(`playcanvas: readDirectory return files ${folderFiles.length}`);
        return folderFiles.map((asset: LocalAsset) => [
            this.getFilename(asset),
            asset.type === 'folder' ? vscode.FileType.Directory : vscode.FileType.File
        ]);
    }

    async createDirectory(uri: vscode.Uri): Promise<void> {
        const project = this.getProject(uri.path);
        const asset = this.lookup(uri);

        if (DEBUG) {
            console.log(`playcanvas: createDirectory ${uri.path}`);
        }

        if (!project) {
            throw new Error(`Failed to find the project for ${uri.path}`);
        }

        if (!asset) {
            const folderPath = path.dirname(uri.path);
            const folderUri = vscode.Uri.parse(`${folderPath}`);

            // Construct the new Uri using the folder path and new name
            try {
                const root = this.isProjectPath(folderPath);
                const folderData = root ? null : this.lookup(folderUri);
                const name = uri.path.split('/').pop();

                if (!name) {
                    throw new Error(`Failed to get the name for ${uri.path}`);
                }

                await this.api.createAsset(
                    project.id,
                    name,
                    {
                        branchId: project.branchId,
                        folderId: folderData?.id,
                        type: 'folder'
                    }
                );
                await this.refreshProject(project);
            } catch (error: any) {
                vscode.window.showErrorMessage(
                    `Failed to create a folder: ${error.message}`
                );
            }
        }
    }

    async fetchUserId(): Promise<void> {
        this.userId = await this.api.fetchUserId();
    }

    async fetchProjects(skipCaching?: boolean): Promise<LocalProject[]> {
        if (!this.userId) {
            this.userId = await this.api.fetchUserId();
        }
        console.log('playcanvas: fetchProjects');

        // preserve branch selection
        const branchSelection = new Map();
        this.projects.forEach((p) => {
            if (p.branchId) {
                branchSelection.set(p.id, p.branchId);
            }
        });

        const serverProjects: Project[] = await this.api.fetchProjects(this.userId);
        const localProjects: LocalProject[] = serverProjects.map((project: Project) => ({
            ...project,
            // Add a new property to the project object
            branchId: branchSelection.get(project?.id) ?? undefined
        }));

        // Note that this step does not add .files or .branches to the local projects

        if (!skipCaching) {
            this.projects = localProjects;
        }

        return localProjects;
    }

    setProjects(projects: LocalProject[]): void {
        this.projects = projects;
    }

    // Never used
    // async fetchProject(id: number): Promise<LocalProject> {
    //     console.log('playcanvas: fetchProject');
    //     return await this.api.fetchProject(id);
    // }
    //

    async fetchBranches(project: LocalProject): Promise<Branch[]> {
        console.log(`playcanvas: fetchBranches ${project.name}`);

        const branches = await this.api.fetchBranches(project.id) ?? [];

        if (project) {
            project.branches = branches;
        }

        return branches;
    }

    async getProjectBranchName(project: LocalProject): Promise<string> {
        if (!project.branchId) {
            return 'main';
        }
        const branches = await this.fetchBranches(project);
        const branch = branches.find(b => b.id === project.branchId);
        return branch ? branch.name : '';
    }

    async initializeProject(
        project: LocalProject,
        branch: string
    ): Promise<void> {
        if (branch && branch !== 'main') {
            await this.fetchBranches(project);
            this.switchBranch(project, branch);
        }
        await this.fetchAssets(project);
    }

    switchBranch(project: LocalProject, branchName: string): void {
        const branch = project.branches?.find(b => b.name === branchName);

        if (branch) {
            project.branchId = branch.id;
        } else {
            console.error(`playcanvas: switchBranch ${project.name} branch ${branchName} not found`);
            throw new Error(`Branch ${branchName} not found`);
        }
    }

    getFilename(asset: LocalAsset): string {
        return asset.file ? asset.file.filename : asset.name;
    }

    getPath(
        projectName: string,
        asset: LocalAsset,
        fileMap: Map<string, LocalAsset>
    ): string {
        if (asset.path) {
            return asset.path;
        }

        const filename = this.getFilename(asset);

        if (asset.parent) {
            const parent = fileMap.get(asset.parent.localAsset.id);

            if (parent) {
                asset.path = `${this.getPath(projectName, parent, fileMap)}/${filename}`;

                if (!parent.files) {
                    parent.files = new Map();
                }

                parent.files.set(filename, asset);
            }
        } else {
            asset.path = `${projectName}/${filename}`;
        }

        return asset.path;
    }

    buildPaths(projectName: string, files: Asset[]): void {
        console.log(`playcanvas: buildPaths ${projectName}`);
        const fileMap: Map<number, LocalAsset> = new Map();

        for (const file of files) {
            const localAsset = new LocalAsset(file, file.name);
            fileMap.set(file.id, {
                ...file,
                files: file.type === 'folder' ? new Map<string, LocalAsset>() : undefined
            });
            // if (file.type === 'folder') {
            //     file.files = new Map();
            // }
        }

        for (const file of files) {
            this.getPath(projectName, file, fileMap);
        }
    }

    async fetchAssets(project: LocalProject): Promise<Map<string, LocalAsset>> {
        if (!project.files) {
            console.log(
                `playcanvas: fetchAssets ${project.name}, branch: ${project.branchId}`
            );
            const serverAssets = await this.api.fetchAssets(project.id, project.branchId);

            // Check again to avoid race condition
            if (!project.files) {
                project.files = new Map();

                for (const file of serverAssets) {
                    if (!file.parent) {
                        project.files.set(this.getFilename(file), file);
                    }
                }

                this.buildPaths(project.name, serverAssets);
            }
        }

        return project.files;
    }

    fetchFileContent(asset: LocalAsset, branchId?: string): Promise<string> {
        console.log(`playcanvas: fetchFileContent ${asset.name}`);
        return this.api.fetchFileContent(asset.id, asset.file.filename, branchId);
    }

    lookup(uri: vscode.Uri): LocalAsset | undefined {
        const parts = uri.path.split('/');
        const project = this.getProjectByName(parts[1]);
        if (!project || parts.length === 0) {
            return null;
        }

        let files = project.files;
        if (!files) {
            return null;
        }
        for (let i = 2; i < parts.length - 1; ++i) {
            const folder = files.get(parts[i]);
            if (!folder) {
                return null;
            }
            files = folder.files;
        }
        return files.get(parts[parts.length - 1]);
    }

    refresh(clearProjects: boolean = true): void {
        this.api = new Api(this.context);

        if (clearProjects) {
            this.projects = [];
        } else {
            this.projects.forEach((p) => {
                delete p.files;
                delete p.branches;
                delete p.branchId;
            });
        }
    }

    refreshUri(uri: vscode.Uri): void {
        console.log(`refreshUri ${uri.path}`);
        // Fire the event to signal that a file has been changed.
        // VS Code will call your readDirectory and other methods to update its view.
        this._onDidChangeFile.fire([
            { type: vscode.FileChangeType.Changed, uri: uri }
        ]);
    }

    async refreshProject(project: LocalProject): Promise<void> {
        console.log(`refreshProject${project.name}`);
        delete project.files;
        await this.fetchAssets(project);
    }

    async pullLatest(pathStr: string): Promise<void> {
        const project = this.getProject(pathStr);

        if (DEBUG) {
            console.log(`playcanvas: pullLatest() - ${pathStr}`);
        }

        if (!project) {
            throw new Error(`Failed to find the project for ${pathStr}`);
        }

        await this.refreshProject(project);
    }

    ensureSyncProjects(): Promise<any> {
        if (!this.syncProjectsCalled) {
            this.syncProjectsCalled = true;
            this.syncProjectsPromise = this.syncProjects();
        }

        return this.syncProjectsPromise!;
    }

    async syncProjects(): Promise<void> {
        console.log('syncProjects');
        try {
            const token = await this.context.secrets.get('playcanvas.accessToken');

            if (token) {
                await this.fetchUserId();
                await this.fetchProjects();

                // preload projects
                const promises = [];
                const folders = vscode.workspace.workspaceFolders;
                if (folders) {
                    for (const folder of folders) {
                        if (folder.uri.scheme.startsWith('playcanvas')) {
                            const project = this.getProjectByName(folder.name);
                            if (project) {
                                const branch = this.projectDataProvider.getWorkspaceData(
                                    folder.uri.path
                                ).branch;
                                promises.push(this.initializeProject(project, branch));
                            }
                        }
                    }
                }
                await Promise.all(promises);
            }

            fileDecorationProvider = new FileDecorationProvider(
                this.context,
                this.projectDataProvider,
                this
            );
            vscode.window.registerFileDecorationProvider(fileDecorationProvider);

            this.projectDataProvider.refresh();
        } catch (err) {
            console.error('error during activation:', err);
            throw err;
        }
    }


    async searchDirectory(dir: vscode.Uri, pattern: string, results: SearchResult[] = []): Promise<void> {
        const config = vscode.workspace.getConfiguration('playcanvas');
        const files = await this.readDirectory(dir);
        const regex = new RegExp(pattern, 'i');
        const maxSearchResults: number = config.get('maxSearchResults') ?? 1000;

        for await (const file of files) {
            const newPath = `${dir.path}/${file[0]}`;
            const filePath = dir.with({ path: newPath });

            if (file[1] === vscode.FileType.Directory) {
                await this.searchDirectory(filePath, pattern, results);
            } else {
                const content = await this.readFile(filePath);

                // decode content to string
                const decoder = new TextDecoder();
                const contentString = decoder.decode(content);

                const lines = contentString.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (regex.test(lines[i])) {
                        results.push({
                            uri: filePath,
                            line: i + 1,
                            lineText:
                                lines[i].length > SEARCH_RESULT_MAX_LENGTH ?
                                    `${lines[i].substring(0, SEARCH_RESULT_MAX_LENGTH)}...` :
                                    lines[i]
                        });
                    }

                    if (results.length >= maxSearchResults) {
                        return;
                    }
                }
            }
        }
    }

    async searchFiles(pattern: string, folder?: vscode.Uri): Promise<any[]> {
        const results: SearchResult[] = [];

        try {

            if (folder) {
                // search in folder
                await this.searchDirectory(folder, pattern, results);
            } else {
                // global search
                const folders = vscode.workspace.workspaceFolders;

                if (folders) {
                    for await (const folder of folders) {
                        if (folder.uri.scheme.startsWith('playcanvas')) {
                            await this.searchDirectory(folder.uri, pattern, results);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('error during search:', err);
            throw err;
        }
        return results;
    }

    getToken(): Promise<string> {
        return this.api.getToken();
    }
}

export default CloudStorageProvider;
