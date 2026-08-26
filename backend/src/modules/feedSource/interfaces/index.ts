import type { IFeedSourceDocument } from '../../../db/models/feedSource/interface/feedSource.js';

export interface IFeedSourceService {
    add(userId: string, url: string): Promise<IFeedSourceDocument>;
    list(userId: string): Promise<IFeedSourceDocument[]>;
    remove(userId: string, id: string): Promise<void>;
}
