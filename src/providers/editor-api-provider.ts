import { globals as editor, Rest } from '@playcanvas/editor-api';
import * as vscode from 'vscode';

const API_URL = 'https://playcanvas.com/api';
const HOME_URL = 'https://playcanvas.com';

export class EditorApiProvider {
    private _context: vscode.ExtensionContext;

    private _editor = editor;

    private _rest: Rest = editor.rest;

    constructor(context: vscode.ExtensionContext, options: {
        projectId?: number,
        branchId?: string,
        accessToken?: string;
    } = {}) {
        this._context = context;

        this._editor.apiUrl = API_URL;
        this._editor.projectId = options.projectId ?? -1;
        this._editor.branchId = options.branchId ?? 'main';
        this._editor.homeUrl = HOME_URL;
        this._editor.accessToken = options.accessToken ?? '';
        // TODO: intelligently detect whether ESM or legacy scripts are used
        this._editor.hasLegacyScripts = true;

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

    async fetchAccessToken() {
        // clear token from plain text storage
        const config = vscode.workspace.getConfiguration('playcanvas');
        const accessToken = config.get<string>('accessToken');

        if (accessToken && accessToken !== '') {
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

        this._editor.accessToken = token;
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
