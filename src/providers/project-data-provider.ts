import * as vscode from 'vscode';

class WorkspaceItem extends vscode.TreeItem {
    folder: vscode.WorkspaceFolder;

    constructor(folder: vscode.WorkspaceFolder, data: any) {
        super(folder.name, vscode.TreeItemCollapsibleState.None);
        this.folder = folder;
        this.description = data;
        this.contextValue = 'workspaceItem';
    }
}

class ProjectDataProvider implements vscode.TreeDataProvider<WorkspaceItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<
        WorkspaceItem | undefined | void
    >;

    readonly onDidChangeTreeData: vscode.Event<WorkspaceItem | undefined | void>;

    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this._onDidChangeTreeData = new vscode.EventEmitter<
            WorkspaceItem | undefined | void
        >();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.context = context;
    }

    getTreeItem(element: WorkspaceItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: WorkspaceItem): Promise<WorkspaceItem[]> {
        if (!element) {
            const workspaceFolders = vscode.workspace.workspaceFolders;

            if (workspaceFolders) {
                return Promise.resolve(
                    workspaceFolders.map(
                        folder => new WorkspaceItem(folder, this.getWorkspaceData(folder))
                    )
                );
            }
        }

        return Promise.resolve([]);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setWorkspaceData(folder: vscode.WorkspaceFolder | string, data: any): void {
        const key = typeof folder === 'string' ? folder : folder.uri.path;
        const workspaceData =
            this.context.workspaceState.get<Record<string, any>>('workspaceData') ||
            {};
        workspaceData[key] = data;
        this.context.workspaceState.update('workspaceData', workspaceData);
        this.refresh();
    }

    getWorkspaceData(folder: vscode.WorkspaceFolder | string): any {
        const key = typeof folder === 'string' ? folder : folder.uri.path;
        const workspaceData =
            this.context.workspaceState.get<Record<string, any>>('workspaceData') ||
            {};
        return workspaceData[key] || '';
    }
}

export default ProjectDataProvider;
