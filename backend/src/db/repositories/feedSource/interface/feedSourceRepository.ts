import type { IFeedSource, IFeedSourceDocument } from '../../../models/feedSource/interface/feedSource.js';

// Every (user, source) pair across every user — what the RSS collector
// iterates each tick. Not user-scoped, unlike everything else here. Split
// out so RssCollectorServices can depend on just this, not the full
// repository — same reasoning as IFeedItemCreator/IFeedItemCategoryReader.
export interface IFeedSourceLister {
    findAll(): Promise<IFeedSourceDocument[]>;
}

export interface IFeedSourceRepository extends IFeedSourceLister {
    create(data: IFeedSource): Promise<IFeedSourceDocument>;
    findByUser(userId: string): Promise<IFeedSourceDocument[]>;
    deleteByIdForUser(id: string, userId: string): Promise<boolean>;
}
