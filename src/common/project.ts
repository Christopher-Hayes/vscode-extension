import { LocalAsset } from './asset';
import { RestBranch, RestProject } from '../providers/editor-api-provider';

export interface LocalProject extends RestProject {
    files?: Map<number, LocalAsset>;
    branches?: RestBranch[];
    branchId?: string;
}
