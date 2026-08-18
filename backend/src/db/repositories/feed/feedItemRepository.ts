import FeedItemModel from '../../models/feed/feedItem.js';
import type {
    IFeedItem,
    IFeedItemDocument,
    IPopulatedFeedItem,
} from '../../models/feed/interface/feedItem.js';
import type { IFeedItemRepository } from './interface/feedItemRepository.js';

export default class FeedItemRepository implements IFeedItemRepository {
    async create(data: IFeedItem): Promise<IFeedItemDocument> {
        return FeedItemModel.create(data);
    }

    async getOne(): Promise<IFeedItemDocument | null> {
        return FeedItemModel.findOne();
    }

    async getAll(limit: number): Promise<IPopulatedFeedItem[]> {
        const items = await FeedItemModel.find()
            .sort({ date: -1 })
            .limit(limit)
            .populate('rawArticleId')
            .lean();

        // Mongoose's lean()+populate() typing doesn't reflect the populated shape, so we assert it here.
        return items as unknown as IPopulatedFeedItem[];
    }

    async getByDate(date: Date): Promise<IPopulatedFeedItem[]> {
        const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        const items = await FeedItemModel.find({ date: { $gte: startOfDay, $lt: endOfDay } })
            .sort({ date: -1 })
            .populate('rawArticleId')
            .lean();

        // Mongoose's lean()+populate() typing doesn't reflect the populated shape, so we assert it here.
        return items as unknown as IPopulatedFeedItem[];
    }
}
