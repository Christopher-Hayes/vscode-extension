import * as vscode from "vscode";

class PlayCanvasFileDecorationProvider
  implements vscode.FileDecorationProvider
{
  context: vscode.ExtensionContext;
  projectDataProvider: any;
  cloudStorageProvider: any;

  constructor(
    context: vscode.ExtensionContext,
    projectDataProvider: any,
    cloudStorageProvider: any
  ) {
    this.context = context;
    this.projectDataProvider = projectDataProvider;
    this.cloudStorageProvider = cloudStorageProvider;
  }

  provideFileDecoration(
    uri: vscode.Uri,
    token: vscode.CancellationToken
  ): vscode.FileDecoration | undefined {
    const project = this.cloudStorageProvider.getProject(uri.path);
    if (project) {
      console.log("provideFileDecoration found", uri);
      const projectUri = this.cloudStorageProvider.getProjectUri(project);
      const data = this.projectDataProvider.getWorkspaceData(projectUri.path);
      if (data) {
        return {
          tooltip: data.branch,
          badge: "💡",
        };
      }
    } else {
      console.log("provideFileDecoration", uri);
    }
    return undefined;
  }
}

export default PlayCanvasFileDecorationProvider;
