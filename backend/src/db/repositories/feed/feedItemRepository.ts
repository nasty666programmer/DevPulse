import FeedItemModel from '../../models/feed/feedItem.js';
import type {
    IFeedItem,
    IFeedItemDocument,
    IPopulatedFeedItem,
} from '../../models/feed/interface/feedItem.js';
import type { Category } from '../../../modules/categorization/interfaces/index.js';
import type { IFeedItemRepository } from './interface/feedItemRepository.js';

export default class FeedItemRepository implements IFeedItemRepository {
    async create(data: IFeedItem): Promise<IFeedItemDocument> {
        return await FeedItemModel.create(data);
    }

    async getOne(userId: string): Promise<IFeedItemDocument | null> {
        return await FeedItemModel.findOne({ userId });
    }

    async getAll(userId: string, limit: number, category?: Category): Promise<IPopulatedFeedItem[]> {
        const filter = category ? { userId, category } : { userId };

        const items = await FeedItemModel.find(filter)
            .sort({ date: -1 })
            .limit(limit)
            .populate('rawArticleId')
            .lean();

        // Mongoose's lean()+populate() typing doesn't reflect the populated shape, so we assert it here.
        return items as unknown as IPopulatedFeedItem[];
    }

    async getRecentByCategory(userId: string, category: Category, limit: number): Promise<IPopulatedFeedItem[]> {
        const items = await FeedItemModel.find({ userId, category })
            .sort({ date: -1 })
            .limit(limit)
            .populate('rawArticleId')
            .lean();

        // Mongoose's lean()+populate() typing doesn't reflect the populated shape, so we assert it here.
        return items as unknown as IPopulatedFeedItem[];
    }

    async findById(id: string, userId: string): Promise<IFeedItemDocument | null> {
        return await FeedItemModel.findOne({ _id: id, userId });
    }

    async distinctCategoriesForUser(userId: string): Promise<Category[]> {
        return await FeedItemModel.distinct('category', { userId });
    }

    async setSummary(id: string, summary: string): Promise<void> {
        await FeedItemModel.updateOne({ _id: id }, { $set: { summary } });
    }
}
