export function getAssetType(fileName: string): string {
    const ext = fileName.split('.').pop();
    if (!ext) {
        return 'unknown';
    }

    /**
     * Based these references:
     * Asset types: https://api.playcanvas.com/engine-v1/classes/Asset.html#constructor
     * Asset extension mapping: https://developer.playcanvas.com/user-manual/assets/types/
     */
    switch (ext.toLowerCase()) {
        case 'js': case 'mjs': case 'ts':
            return 'script';
        case 'css':
            return 'css';
        case 'json':
            return 'json';
        case 'html':
            return 'html';
        case 'glsl': case 'vert': case 'frag':
            return 'shader';
        case 'txt':
        case 'md':
            return 'text';
        case 'png': case 'jpg': case 'jpeg': case 'webp': case 'avif':
        case 'gif': case 'svg':
            return 'texture';
        case 'ttf': case 'otf': case 'woff': case 'woff2':
            return 'font';
        default:
            return 'text';
    }
}
