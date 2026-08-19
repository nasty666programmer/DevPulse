import type {
    IFeedItem,
    IFeedItemDocument,
    IPopulatedFeedItem,
} from '../../../models/feed/interface/feedItem.js';

export interface IFeedItemCreator {
    create(data: IFeedItem): Promise<IFeedItemDocument>;
}

export interface IFeedItemDateReader {
    getByDate(date: Date): Promise<IPopulatedFeedItem[]>;
}

export interface IFeedItemRepository extends IFeedItemCreator, IFeedItemDateReader {
    getOne(): Promise<IFeedItemDocument | null>;
    getAll(limit: number): Promise<IPopulatedFeedItem[]>;
}
