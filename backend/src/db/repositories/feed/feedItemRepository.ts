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
        return (await FeedItemModel.create(data)) as unknown as IFeedItemDocument;
    }

    async getOne(): Promise<IFeedItemDocument | null> {
        return (await FeedItemModel.findOne()) as unknown as IFeedItemDocument | null;
    }

    async getAll(limit: number, category?: Category): Promise<IPopulatedFeedItem[]> {
        const filter = category ? { category } : {};

        const items = await FeedItemModel.find(filter)
            .sort({ date: -1 })
            .limit(limit)
            .populate('rawArticleId')
            .lean();

        // Mongoose's lean()+populate() typing doesn't reflect the populated shape, so we assert it here.
        return items as unknown as IPopulatedFeedItem[];
    }

    async getRecentByCategory(category: Category, limit: number): Promise<IPopulatedFeedItem[]> {
        const items = await FeedItemModel.find({ category })
            .sort({ date: -1 })
            .limit(limit)
            .populate('rawArticleId')
            .lean();

        // Mongoose's lean()+populate() typing doesn't reflect the populated shape, so we assert it here.
        return items as unknown as IPopulatedFeedItem[];
    }

    async findById(id: string): Promise<IFeedItemDocument | null> {
        return (await FeedItemModel.findById(id)) as unknown as IFeedItemDocument | null;
    }

    async setSummary(id: string, summary: string): Promise<void> {
        await FeedItemModel.updateOne({ _id: id }, { $set: { summary } });
    }
}
