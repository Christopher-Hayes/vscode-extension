import { globals as editor, Rest, Assets, Asset } from '@playcanvas/editor-api';
import { Blob } from 'fetch-blob';
import * as vscode from 'vscode';

import { LegacyApiProvider } from './legacy-api-provider';
import { getAssetType } from '../utils/asset-type';

export const API_URL = 'https://playcanvas.com/api';
export const HOME_URL = 'https://playcanvas.com';

export const UserNotAuthenticatedError = new Error(
    'User not authenticated.'
);

export interface RestUser {
    id: number;
    username: string;
    full_name: string;
    created_at: string;
    plan_type: string;
}

export interface RestProject {
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
export interface RestBranch {
    id: string;
    name: string;
}

export interface RestAsset {
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

// Not ideal, but only way to get param types on Rest API
type ProjectBranchesOptions = Parameters<typeof editor.rest.projects.projectBranches>[0];
type AssetGetFileOptions = Parameters<typeof editor.rest.assets.assetGetFile>[2];
type AssetUpdateData = Parameters<typeof editor.rest.assets.assetUpdate>[1];
type AssetPasteData = Parameters<typeof editor.rest.assets.assetPaste>[0];

export class EditorApiProvider {
    private _context: vscode.ExtensionContext;

    private _legacyApi: LegacyApiProvider;

    private _editor = editor;

    private _rest: Rest = editor.rest;

    private _assets: Assets = new Assets();

    user: RestUser | null = null;

    constructor(context: vscode.ExtensionContext, options: {
        projectId?: number,
        branchId?: string,
        accessToken?: string;
    } = {}) {
        // VSCode API - extension context
        this._context = context;

        // Editor API - Globals
        this._editor.apiUrl = API_URL;
        this._editor.projectId = options.projectId ?? -1;
        this._editor.branchId = options.branchId ?? 'main';
        this._editor.homeUrl = HOME_URL;
        this._editor.accessToken = options.accessToken ?? '';
        // TODO: intelligently detect whether ESM or legacy scripts are used
        this._editor.hasLegacyScripts = true;

        // Editor API - Assets API
        this._editor.assets = this._assets;

        // Override this._editor.confirmFn to use the VSCode API
        this._editor.confirmFn = async (text: string, options: { yesText?: string; noText?: boolean; noDismiss?: boolean } = {}): Promise<boolean> => {
            const yes = options.yesText || 'Yes';
            const buttons = [yes];
            if (options.noText) {
                buttons.push('No');
            }
            const result = await vscode.window.showInformationMessage(text, { modal: !!options.noDismiss }, ...buttons);
            return result === yes;
        };

        // At the moment, we need legacy support for fetching the user ID
        // But, adding this to the editor-api has an issue: https://github.com/playcanvas/editor-api/issues/92
        this._legacyApi = new LegacyApiProvider(context, this);
    }

    async fetchUserId(): Promise<number> {
        this.user = await this._legacyApi.fetchUser();

        return this.user.id;
    }

    fetchProjects(view: string = ''): Promise<RestProject[]> {
        if (!this.user) {
            throw UserNotAuthenticatedError;
        }

        return this._rest.users.userProjects(this.user.id, view).promisify() as Promise<RestProject[]>;
    }

    fetchBranches(options: ProjectBranchesOptions = {}): Promise<Array<RestBranch>> {
        return this._rest.projects.projectBranches(options).promisify() as Promise<Array<RestBranch>>;
    }

    fetchAssets(view: string = ''): Promise<RestAsset[]> {
        return this._rest.projects.projectAssets(view).promisify() as Promise<RestAsset[]>;
    }

    fetchFileContent(id: string, fileName: string, options: AssetGetFileOptions = {}): Promise<string> {
        return this._rest.assets.assetGetFile(id, fileName, options).promisify() as Promise<string>;
    }

    renameAsset(
        id: string,
        newName: string,
        options: {
            folderId?: number;
        } = {}
    ): Promise<RestAsset> {
        const newAssetData: AssetUpdateData = {
            name: newName,
            parent: options.folderId?.toString() ?? 'null'
        };

        return this._rest.assets.assetUpdate(id, newAssetData).promisify() as Promise<RestAsset>;
    }

    copyAsset(
        sourceProjectId: number,
        assetId: number,
        targetProjectId: number,
        // editor-api does not use folderId, but the legacy API does
        // folderId: number | null,
        options: {
            sourceProjectBranchId?: string;
            targetProjectBranchId?: string;
        } = {}
    ): Promise<RestAsset> {
        const assetData: AssetPasteData = {
            projectId: sourceProjectId,
            branchId: options.sourceProjectBranchId ?? this._editor.branchId,
            assets: [assetId.toString()],
            targetProjectId: targetProjectId.toString(),
            targetBranchId: options.targetProjectBranchId ?? this._editor.branchId,
            keepFolderStructure: true
        };

        return this._rest.assets.assetPaste(assetData).promisify() as Promise<RestAsset>;
    }

    createAsset(
        name: string,
        options: {
            folderId?: number;
            branchId?: string;
            type?: string;
        } = {}
    ): Promise<Asset> {
        let folder;

        if (options.folderId) {
            folder = this._assets.get(options.folderId) ?? undefined;
        }

        if (!options.type) {
            options.type = getAssetType(name);
        }

        // Based on what functions are on the Assets API
        // https://api.playcanvas.com/editor/classes/Assets.html
        switch (options.type) {
            case 'script':
                return this._assets.createScript({
                    filename: name,
                    folder
                });
            case 'folder':
                return this._assets.createFolder({
                    name,
                    folder
                });
            case 'css':
                return this._assets.createCss({
                    name,
                    folder
                });
            case 'json':
                return this._assets.createJson({
                    name,
                    folder
                });
            case 'html':
                return this._assets.createHtml({
                    name,
                    folder
                });
            case 'shader':
                return this._assets.createShader({
                    name,
                    folder
                });
            case 'text':
                return this._assets.createText({
                    name,
                    folder
                });
            default:
                // Revert to the REST API for unspecified types
                return this._rest.assets.assetCreate({
                    name,
                    type: options.type,
                    parent: options.folderId?.toString() ?? 'null'
                }).promisify() as Promise<Asset>;
        }
    }

    deleteAsset(id: number): Promise<void> {
        const asset = this._assets.get(id);

        if (!asset) {
            throw new Error(`Cannot delete. Asset with id ${id} not found.`);
        }

        return this._assets.delete([asset]);
    }

    uploadFile(
        id: string,
        filename: string,
        modifiedAt: string,
        data: Buffer | string,
        options: { branchId?: string } = {}
    ): Promise<Asset> {
        // Convert Buffer or string to Blob
        const blob = typeof data === 'string' ?
            new Blob([data], { type: 'text/plain' }) :
            new Blob([data], { type: 'application/octet-stream' });

        const uploadArgs = {
            id: Number(id),
            filename,
            file: blob
        };

        return this._assets.upload(uploadArgs);
    }

    get editor() {
        return this._editor;
    }

    set branchId(branchId: string) {
        this._editor.branchId = branchId;
    }

    get branchId() {
        return this._editor.branchId;
    }

    set projectId(projectId: number) {
        this._editor.projectId = projectId;
    }

    get projectId() {
        return this._editor.projectId;
    }

    set accessToken(accessToken: string) {
        this._editor.accessToken = accessToken;

        // Update secret storage
        // Note: this is an async operation, but we don't need to wait for it
        this._context.secrets.store('playcanvas.accessToken', accessToken);

        // Legacy - ensure the access token is no longer stored in plain text in settings
        const config = vscode.workspace.getConfiguration('playcanvas');
        config.update(
            'accessToken',
            undefined,
            vscode.ConfigurationTarget.Global
        );
    }

    get accessToken() {
        return this._editor.accessToken;
    }

    async fetchAccessToken(): Promise<string> {
        // clear token from plain text storage
        const config = vscode.workspace.getConfiguration('playcanvas');
        const accessToken = config.get<string>('accessToken');
        if (accessToken && accessToken !== '') {
            // TODO: Making a secret storage provider would be a good idea
            await this._context.secrets.store('playcanvas.accessToken', accessToken);
            config.update(
                'accessToken',
                undefined,
                vscode.ConfigurationTarget.Global
            );
        }

        // get a secret
        let token = await this._context.secrets.get('playcanvas.accessToken');
        if (!token) {
            token = await vscode.window.showInputBox({
                prompt:
                    'Please set your PlayCanvas Access Token. Generate an access token on your [account page](https://playcanvas.com/account)',
                placeHolder: 'Input your access token here.',
                ignoreFocusOut: true
            });

            if (!token) {
                throw new Error('Unauthorized');
            }

            await this._context.secrets.store('playcanvas.accessToken', token);

            // Test access token
            try {
                await this.fetchUserId();
            } catch (error) {
                throw new Error(
                    'Invalid access token. Please check your token and try again.'
                );
            }
        }
        return token;
    }

    set homeUrl(homeUrl: string) {
        this._editor.homeUrl = homeUrl;
    }

    get homeUrl() {
        return this._editor.homeUrl;
    }

    set apiUrl(apiUrl: string) {
        this._editor.apiUrl = apiUrl;
    }

    get apiUrl() {
        return this._editor.apiUrl;
    }

    set hasLegacyScripts(hasLegacyScripts: boolean) {
        this._editor.hasLegacyScripts = hasLegacyScripts;
    }

    get hasLegacyScripts() {
        return this._editor.hasLegacyScripts;
    }
}
