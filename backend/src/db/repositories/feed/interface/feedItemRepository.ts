import type {
    IFeedItem,
    IFeedItemDocument,
    IPopulatedFeedItem,
} from '../../../models/feed/interface/feedItem.js';
import type { Category } from '../../../../modules/categorization/interfaces/index.js';

export interface IFeedItemCreator {
    create(data: IFeedItem): Promise<IFeedItemDocument>;
}

export interface IFeedItemCategoryReader {
    getRecentByCategory(category: Category, limit: number): Promise<IPopulatedFeedItem[]>;
}

export interface IFeedItemRepository extends IFeedItemCreator, IFeedItemCategoryReader {
    getOne(): Promise<IFeedItemDocument | null>;
    getAll(limit: number, category?: Category): Promise<IPopulatedFeedItem[]>;
}
