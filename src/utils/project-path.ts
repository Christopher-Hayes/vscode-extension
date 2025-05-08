import { Asset } from '../api';
import { LocalAsset } from '../common/asset';
import { LocalProject } from '../common/project';
import CloudStorageProvider from '../providers/cloud-storage-provider';

export const ProjectNotFoundError = new Error('Project not found');
export const AssetNotFoundError = new Error('Asset not found');

/**
 * PlayCanvas uses string paths in 3 different ways:
 * 1. To reference an asset on the project.
 * 2. To get the project that an asset belongs to.
 * 3. To directly reference the project itself.
 * This is possible because the first path of an asset path refers to the project.
 *
 * ProjectPath provides a streamlined API to cater to all 3 use cases.
 */
export class ProjectPath {
    private _pathStr: string;

    parts: string[] = [];

    project!: LocalProject;

    isProjectPath: boolean = false;

    isFolder: boolean = false;

    sessionStorage: CloudStorageProvider;

    constructor(pathStr: string, sessionStorage: CloudStorageProvider) {
        this.sessionStorage = sessionStorage;
        this.path = this._pathStr = pathStr;
    }

    set path(path: string) {
        this._pathStr = path;
        this.parts = this._pathStr.split('/');

        switch (this.parts.length) {
            case 0: case 1:
                console.error(`Project not found on ${this._pathStr}`);
                throw ProjectNotFoundError;
            case 2: {
                const project = this.sessionStorage.getProjectByName(this.parts[1]);

                // This path only references the project itself.
                this.isProjectPath = true;
                this.isFolder = false;

                if (project) {
                    this.project = project;
                } else {
                    console.error(`Project not found on ${this.parts[1]}`);
                    throw ProjectNotFoundError;
                }
                break;
            }
            default: {
                const project = this.sessionStorage.getProjectByName(this.parts[1]);

                // This path references an asset on a project.
                this.isProjectPath = false;

                if (project) {
                    this.project = project;
                } else {
                    console.error(`Project not found on ${this.parts[1]}`);
                    throw ProjectNotFoundError;
                }

                // Ensure this asset is correctly linked in the project file tree.
                this.sessionStorage.reconstructFileTree(this._pathStr);

                const localAsset = this.localAsset;
                this.isFolder = localAsset ? localAsset.type === 'folder' : false;
            }
        }
    }

    get path() {
        return this._pathStr;
    }

    get localAsset(): LocalAsset {
        if (this.isProjectPath) {
            console.error(`Path ${this._pathStr} does not contain path to asset.`);
            throw new Error('Project path does not contain path to asset.');
        }

        const asset = this.project.files?.get(this.parts[this.parts.length - 1]);

        if (asset) {
            return asset;
        }

        console.error(`Asset not found for path ${this._pathStr}`);
        throw AssetNotFoundError;
    }

    async getServerAsset(): Promise<Asset> {
        const serverAsset = await this.sessionStorage.api.fetchAsset(
            this.localAsset.id,
            {
                branchId: this.project.branchId
            }
        );

        if (serverAsset) {
            return serverAsset;
        }

        console.error(`Server asset not found for path ${this._pathStr}`);
        throw AssetNotFoundError;
    }

    // If this is a folder asset, the asset is returned. Otherwise, returns the parent asset.
    get folder(): LocalAsset {
        if (this.isProjectPath) {
            console.error(`Path ${this._pathStr} does not contain path to a folder asset.`);
            throw AssetNotFoundError;
        }

        if (this.isFolder) {
            return this.localAsset;
        }

        return this.parent;
    }

    get parent(): LocalAsset {
        if (this.isProjectPath) {
            console.error(`Path ${this._pathStr} does not contain path to asset.`);
            throw new Error('Project path does not contain path to asset.');
        }

        // Just return undefined for the root asset.
        if (this.parts.length < 2) {
            console.error(`Path ${this._pathStr} does not have a parent.`);
            throw AssetNotFoundError;
        }

        const parentPath = this.parts.slice(0, this.parts.length - 1).join('/');
        const parentAsset = this.project.files?.get(parentPath);

        if (parentAsset) {
            return parentAsset;
        }

        console.error(`Parent asset not found for path ${this._pathStr}`);
        throw AssetNotFoundError;
    }
}
