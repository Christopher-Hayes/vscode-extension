import { Asset } from '../api';
import { LocalProject } from './project';

export class LocalAsset implements Asset {
    // Note: Files only appears on folder assets
    // eslint-disable-next-line no-use-before-define
    files: Map<string, LocalAsset>;

    path: string;

    constructor(asset: Asset, project: LocalProject) {
        super(asset.name, asset.type);

        this.files = new Map<string, LocalAsset>();
        this.path = path;
    }

    static buildPathFromAsset(asset: Asset): string {
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

    static getFilename(asset: Asset): string {
        return asset.file ? asset.file.filename : asset.name;
    }
}
