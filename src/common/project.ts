export interface LocalProject extends Project {
    files?: Map<number, LocalAsset>;
    branches?: Branch[];
    branchId?: string;
}
