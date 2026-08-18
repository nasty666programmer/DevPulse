import type {
    IFeedItem,
    IFeedItemDocument,
    IPopulatedFeedItem,
} from '../../../models/feed/interface/feedItem.js';

export interface IFeedItemCreator {
    create(data: IFeedItem): Promise<IFeedItemDocument>;
}

export interface IFeedItemRepository extends IFeedItemCreator {
    getOne(): Promise<IFeedItemDocument | null>;
    getAll(limit: number): Promise<IPopulatedFeedItem[]>;
    getByDate(date: Date): Promise<IPopulatedFeedItem[]>;
}
