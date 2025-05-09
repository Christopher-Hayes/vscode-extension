import { RestAsset } from '../providers/editor-api-provider';

export class LocalAsset implements RestAsset {
    id: number;

    modifiedAt: string;

    createdAt: string;

    state: 'ready' | 'processing' | 'error';

    name: string;

    type: string;

    scope: { type: 'project' | string; id: number; };

    source: boolean;

    sourceId: boolean;

    tags: string[];

    preload: boolean;

    file: { hash: string; filename: string; size: number; url: string; };

    parent: number;

    // Note: Files only appears on folder assets
    // eslint-disable-next-line no-use-before-define
    files: Map<string, LocalAsset>;

    // path: string;

    constructor(asset: RestAsset) {
        this.id = asset.id;
        this.modifiedAt = asset.modifiedAt;
        this.createdAt = asset.createdAt;
        this.state = asset.state;
        this.name = asset.name;
        this.type = asset.type;
        this.scope = asset.scope;
        this.source = asset.source;
        this.sourceId = asset.sourceId;
        this.tags = asset.tags;
        this.preload = asset.preload;
        this.file = asset.file;
        this.parent = asset.parent;

        this.files = new Map<string, LocalAsset>();
        // this.path = LocalAsset.buildPathFromAsset(this);
    }

    // static buildPathFromAsset(asset: LocalAsset): string {
    //     const filename = this.getFilename(asset);

    //     if (asset.parent) {
    //         const parent = fileMap.get(asset.parent.localAsset.id);

    //         if (parent) {
    //             asset.path = `${this.getPath(projectName, parent, fileMap)}/${filename}`;

    //             if (!parent.files) {
    //                 parent.files = new Map();
    //             }

    //             parent.files.set(filename, asset);
    //         }
    //     } else {
    //         asset.path = `${projectName}/${filename}`;
    //     }

    //     return asset.path;
    // }

    static getFilename(asset: LocalAsset): string {
        return asset.file ? asset.file.filename : asset.name;
    }
}
