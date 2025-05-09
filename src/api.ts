// import FormData from 'form-data';
// import fetch, { Response } from 'node-fetch';
// import * as vscode from 'vscode';

// import Script from './script';


// const API_HOST = 'https://playcanvas.com/api';

// export const AssetModifiedError = new Error(
//     'Asset was modified, please pull the latest version'
// );

export interface ApiErrorResponse {
    message: string;
    code: number;
    error?: string;
    details?: string;
}

export interface Project {
    access_level: string;
    created: string;
    description: string;
    fork_count: number;
    id: number;
    locked: boolean;
    modified: string;
    name: string;
    new_owner: string | null;
    owner: string;
    owner_id: number;
    permissions: {
        admin: string[];
        write: string[];
        read: string[];
    };
    plays: number;
    primary_app: number;
    primary_app_url: string;
    private: boolean;
    size: {
        total: number;
        code: number;
        apps: number;
        assets: number;
        checkpoints: number;
    };
    starred: number;
    thumbnails: { s: string; m: string; l: string; xl: string };
    views: number;
    // Based on testing, branchId is not always returned
    branchId?: string;
}

// TODO: Understand what properties are returned by the Branch API
export interface Branch {
    id: string;
    name: string;
}

export interface Asset {
    id: number;
    modifiedAt: string;
    createdAt: string;
    state: 'ready' | 'processing' | 'error';
    name: string;
    type: 'cubemap' | 'folder' | 'font' | 'material' | 'script' | 'texture' | string;
    scope: {
        type: 'project' | string;
        id: number
    };
    source: boolean;
    sourceId: boolean;
    tags: string[];
    preload: boolean;
    file: { hash: string; filename: string; size: number; url: string };
    parent: number;
}

// export class Api {
//
// context: vscode.ExtensionContext;
//
// constructor(context: vscode.ExtensionContext) {
//     this.context = context;
// }
//

// async getToken(): Promise<string> {
//     // clear token from plain text storage
//     const config = vscode.workspace.getConfiguration('playcanvas');
//     const accessToken = config.get<string>('accessToken');
//     if (accessToken && accessToken !== '') {
//         await this.context.secrets.store('playcanvas.accessToken', accessToken);
//         config.update(
//             'accessToken',
//             undefined,
//             vscode.ConfigurationTarget.Global
//         );
//     }

//     // get a secret
//     let token = await this.context.secrets.get('playcanvas.accessToken');
//     if (!token) {
//         token = await vscode.window.showInputBox({
//             prompt:
//                 'Please set your PlayCanvas Access Token. Generate an access token on your [account page](https://playcanvas.com/account)',
//             placeHolder: 'Input your access token here.',
//             ignoreFocusOut: true
//         });

//         if (!token) {
//             throw new Error('Unauthorized');
//         }

//         await this.context.secrets.store('playcanvas.accessToken', token);

//         // Test access token
//         try {
//             await this.fetchUserId();
//         } catch (error) {
//             throw new Error(
//                 'Invalid access token. Please check your token and try again.'
//             );
//         }
//     }
//     return token;
// }

// async apiCall(
//     url: string,
//     method: string = 'GET',
//     body: any = null,
//     headers: Record<string, string> = {}
// ): Promise<Response> {
//     try {
//         // ensure token exists
//         const token = await this.getToken();
//         if (!token) {
//             throw new Error('Unauthorized');
//         }

//         const params: any = {
//             method: method,
//             headers: {
//                 Authorization: `Bearer ${token}`
//             }
//         };
//         if (body) {
//             params.body = body;
//         } else {
//             params.headers['Content-Type'] = 'application/json';
//         }
//         for (const header in headers) {
//             if (headers.hasOwnProperty(header)) {
//                 params.headers[header] = headers[header];
//             }
//         }

//         const response: Response = await fetch(url, params);

//         if (!response.ok) {
//             const contentType = response.headers.get('content-type');

//             if (contentType && contentType.includes('application/json')) {
//                 const res = await response.json();
//                 throw new Error(res.error ? res.error : 'apiCall failed');
//             } else {
//                 const text = await response.text();
//                 throw new Error(
//                     `[${response.status}] ${response.statusText}: ${text}`
//                 );
//             }
//         }

//         return response;
//     } catch (error: any) {
//         if (error.message.includes('Unauthorized')) {
//             await this.context.secrets.delete('playcanvas.accessToken');
//             throw new Error('Unauthorized. Please try again.');
//         } else if (error.message.includes(AssetModifiedError.message)) {
//             throw AssetModifiedError;
//         }

//         console.error('API call failed:', error);
//         throw error;
//     }
// }

// async fetchUserId(): Promise<number> {
//     const response = await this.apiCall(`${API_HOST}/id`);
//     const asset = await response.json();
//     if (asset && typeof asset.id === 'number') {
//         return asset.id;
//     }
//     throw new Error('Invalid response from /id endpoint');
// }

// async fetchProjects(userId: number): Promise<Project[]> {
//     const response = await this.apiCall(`${API_HOST}/users/${userId}/projects`);
//     const asset = await response.json();
//     if (asset && Array.isArray(asset.result)) {
//         console.log('Fetched projects:', asset.result);
//         return asset.result;
//     }
//     throw new Error('Invalid response from /users/{userId}/projects endpoint');
// }

// Never used.
// async fetchProject(id: number): Promise<Project> {
//     const response = await this.apiCall(`${API_HOST}/projects/${id}`);
//     const res = await response.json();
//
//     if (res && typeof res === 'object') {
//         console.log('Fetched project:', res);
//         return res;
//     }
//
//     throw new Error('Invalid response from /projects/{id} endpoint');
// }
//

// async fetchBranches(projectId: number): Promise<Array<Branch>> {
//     const response = await this.apiCall(
//         `${API_HOST}/projects/${projectId}/branches`
//     );
//     const res = await response.json();

//     if (res && Array.isArray(res.result)) {
//         console.log('Fetched branches:', res.result);

//         return res.result;
//     }

//     throw new Error(
//         'Invalid response from /projects/{projectId}/branches endpoint'
//     );
// }

// async fetchAssets(projectId: number, branchId?: string): Promise<Asset[]> {
//     const url =
//         `${API_HOST}/projects/${projectId}/assets?view=extension&limit=10000${
//             branchId ? `&branchId=${branchId}` : ''}`;
//     const response = await this.apiCall(url);
//     const res = await response.json();

//     if (res && Array.isArray(res.result)) {
//         return res.result;
//     }

//     throw new Error(
//         'Invalid response from /projects/{projectId}/assets endpoint'
//     );
// }

// async fetchAsset(
//     assetId: number,
//     options: {
//         branchId?: string
//     } = {}
// ): Promise<Asset> {
//     const url =
//         `${API_HOST}/assets/${assetId}${
//             options.branchId ? `?branchId=${options.branchId}` : ''}`;
//     const asset = await (await this.apiCall(url)).json();
//     if (asset && typeof asset.id === 'number') {
//         return asset;
//     }
//     throw new Error('Invalid response from /assets/{assetId} endpoint');
// }

// async fetchFileContent(
//     id: number,
//     fileName: string,
//     branchId?: string
// ): Promise<string> {
//     const url =
//         `${API_HOST}/assets/${id}/file/${fileName}${
//             branchId ? `?branchId=${branchId}` : ''}`;
//     const response = await this.apiCall(url);
//     const res = await response.text();
//     return res;
// }

// async renameAsset(
//     id: number,
//     newName: string,
//     options: {
//         folderId?: number,
//         branchId?: string
//     } = {}
// ): Promise<Asset> {
//     const url = `${API_HOST}/assets/${id}`;
//     const form = new FormData();
//     form.append('name', newName);
//     form.append('parent', options.folderId?.toString() ?? 'null');
//     if (options.branchId) {
//         form.append('branchId', options.branchId);
//     }

//     const response = await this.apiCall(url, 'PUT', form);
//     if (!response.ok) {
//         const res: ApiErrorResponse = await response.json();
//         throw new Error(res.error);
//     }

//     const asset: Asset = await response.json();
//     return asset;
// }

// async copyAsset(
//     sourceProjectId: number,
//     assetId: number,
//     targetProjectId: number,
//     folderId: number | null,
//     options: {
//         sourceProjectBranchId?: string,
//         targetProjectBranchId?: string,
//     } = {}
// ): Promise<Asset> {
//     const url = `${API_HOST}/assets/paste`;
//     const body: any = {
//         projectId: sourceProjectId,
//         assets: [assetId],
//         targetProjectId: targetProjectId,
//         targetFolderId: folderId
//     };

//     if (options.sourceProjectBranchId) {
//         body.branchId = options.sourceProjectBranchId;
//     }

//     if (options.targetProjectBranchId) {
//         body.targetBranchId = options.targetProjectBranchId;
//     }

//     const response = await this.apiCall(url, 'POST', JSON.stringify(body), {
//         'Content-Type': 'application/json'
//     });
//     if (!response.ok) {
//         const res: ApiErrorResponse = await response.json();
//         throw new Error(res.error);
//     }

//     const asset: Asset = await response.json();
//     return asset;
// }

// async createAsset(
//     projectId: number,
//     name: string,
//     options: {
//         folderId?: number,
//         branchId?: string,
//         type?: string
//     } = {}
// ): Promise<Asset> {
//     const url = `${API_HOST}/assets/`;

//     const ext = name.split('.').pop();
//     const asset =
//         ext === 'js' ?
//             Script.create({ filename: name }) :
//             {
//                 contentType: 'text/plain',
//                 content: '',
//                 filename: name,
//                 preload: false
//             };

//     const form = new FormData();
//     if (options.type !== 'folder') {
//         form.append('file', asset.content, {
//             filename: asset.filename,
//             contentType: asset.contentType
//         });
//     }

//     form.append('preload', asset.preload ? 'true' : 'false');
//     form.append('projectId', projectId.toString());
//     form.append('name', name);

//     if (options.type) {
//         form.append('type', options.type);
//     }

//     if (options.folderId) {
//         form.append('parent', options.folderId.toString());
//     }

//     if (options.branchId) {
//         form.append('branchId', options.branchId);
//     }

//     const response = await this.apiCall(url, 'POST', form);
//     if (!response.ok) {
//         const res: ApiErrorResponse = await response.json();
//         console.error('file upload failed:', res.error);
//         throw new Error(res.error);
//     }

//     return await response.json();
// }

// async deleteAsset(id: number, branchId?: string): Promise<string> {
//     const url =
//         `${API_HOST}/assets/${id}${branchId ? `?branchId=${branchId}` : ''}`;
//     const response = await this.apiCall(url, 'DELETE');
//     const res = await response.text();
//     return res;
// }

// async uploadFile(
//     id: number,
//     filename: string,
//     modifiedAt: string,
//     data: Buffer | string,
//     branchId?: string
// ): Promise<Asset> {
//     const url = `${API_HOST}/assets/${id}`;

//     const form = new FormData();
//     form.append('file', data, {
//         filename: filename,
//         contentType: 'text/plain'
//     });

//     form.append('baseModificationTime', modifiedAt);

//     if (branchId) {
//         form.append('branchId', branchId);
//     }

//     try {
//         const response = await this.apiCall(url, 'PUT', form);

//         if (!response.ok) {
//             const res: ApiErrorResponse = await response.json();

//             if (res.message && res.message.includes(AssetModifiedError.message)) {
//                 throw AssetModifiedError;
//             }

//             throw new Error(res.error);
//         }

//         const asset: Asset = await response.json();

//         return asset;
//     } catch (error: any) {
//         switch (error) {
//             case AssetModifiedError:
//                 throw AssetModifiedError;
//             default:
//                 console.error('file upload failed:', error);
//                 throw error;
//         }
//     }
// }
// }
