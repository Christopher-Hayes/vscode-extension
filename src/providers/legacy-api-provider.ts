import fetch, { Response } from 'node-fetch';
import * as vscode from 'vscode';

import { API_URL, EditorApiProvider, RestUser } from './editor-api-provider';

export const AssetModifiedError = new Error(
    'Asset was modified, please pull the latest version'
);

export interface ApiErrorResponse {
    message: string;
    code: number;
    error?: string;
    details?: string;
}

// For operations that `@playcanvas/editor-api` does not yet support
export class LegacyApiProvider {
    private _context: vscode.ExtensionContext;

    private _editorApiProvider: EditorApiProvider;

    constructor(context: vscode.ExtensionContext, editorApiProvider: EditorApiProvider) {
        this._context = context;
        this._editorApiProvider = editorApiProvider;
    }

    async apiCall(
        url: string,
        method: string = 'GET',
        body: any = null,
        headers: Record<string, string> = {}
    ): Promise<Response> {
        try {
            // ensure token exists
            const token = await this._editorApiProvider.fetchAccessToken();
            if (!token) {
                throw new Error('Unauthorized');
            }

            const params: any = {
                method: method,
                headers: {
                    Authorization: `Bearer ${token}`
                }
            };
            if (body) {
                params.body = body;
            } else {
                params.headers['Content-Type'] = 'application/json';
            }
            for (const header in headers) {
                if (headers.hasOwnProperty(header)) {
                    params.headers[header] = headers[header];
                }
            }

            const response: Response = await fetch(url, params);

            if (!response.ok) {
                const contentType = response.headers.get('content-type');

                if (contentType && contentType.includes('application/json')) {
                    const res = await response.json();
                    throw new Error(res.error ? res.error : 'apiCall failed');
                } else {
                    const text = await response.text();
                    throw new Error(
                        `[${response.status}] ${response.statusText}: ${text}`
                    );
                }
            }

            return response;
        } catch (error: any) {
            if (error.message.includes('Unauthorized')) {
                await this._context.secrets.delete('playcanvas.accessToken');
                throw new Error('Unauthorized. Please try again.');
            } else if (error.message.includes(AssetModifiedError.message)) {
                throw AssetModifiedError;
            }

            console.error('API call failed:', error);
            throw error;
        }
    }

    async fetchUser(): Promise<RestUser> {
        const response = await this.apiCall(`${API_URL}/id`);
        const user = await response.json();

        if (user && typeof user.id === 'number') {
            return user as RestUser;
        }

        throw new Error('Invalid response from /id endpoint');
    }

    async fetchUserId(): Promise<number> {
        const user = await this.fetchUser();

        return user.id;
    }
}
