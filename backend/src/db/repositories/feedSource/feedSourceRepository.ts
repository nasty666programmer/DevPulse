import { Types } from 'mongoose';
import FeedSourceModel from '../../models/feedSource/feedSource.js';
import type { IFeedSource, IFeedSourceDocument } from '../../models/feedSource/interface/feedSource.js';
import type { IFeedSourceRepository } from './interface/feedSourceRepository.js';

export default class FeedSourceRepository implements IFeedSourceRepository {
    async create(data: IFeedSource): Promise<IFeedSourceDocument> {
        return await FeedSourceModel.create(data);
    }

    async findByUser(userId: string): Promise<IFeedSourceDocument[]> {
        return await FeedSourceModel.find({ userId }).sort({ addedAt: -1 });
    }

    async findAll(): Promise<IFeedSourceDocument[]> {
        return await FeedSourceModel.find();
    }

    async deleteByIdForUser(id: string, userId: string): Promise<boolean> {
        if (!Types.ObjectId.isValid(id)) {
            return false;
        }

        const result = await FeedSourceModel.deleteOne({ _id: id, userId });

        return result.deletedCount > 0;
    }
}
