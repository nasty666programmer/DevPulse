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
    getRecentByCategory(userId: string, category: Category, limit: number): Promise<IPopulatedFeedItem[]>;
}

export interface IFeedItemRepository extends IFeedItemCreator, IFeedItemCategoryReader {
    getOne(userId: string): Promise<IFeedItemDocument | null>;
    getAll(userId: string, limit: number, category?: Category): Promise<IPopulatedFeedItem[]>;
    findById(id: string, userId: string): Promise<IFeedItemDocument | null>;
    setSummary(id: string, summary: string): Promise<void>;
}
