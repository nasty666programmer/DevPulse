import TelegramPostModel from '../../models/telegram/telegramPost.js';
import type {
    ITelegramPost,
    ITelegramPostDocument,
} from '../../models/telegram/interface/telegramPost.js';
import type { ITelegramPostRepository } from './interface/telegramPostRepository.js';

export default class TelegramPostRepository implements ITelegramPostRepository {
    async create(post: ITelegramPost): Promise<ITelegramPostDocument> {
        return await TelegramPostModel.create(post);
    }

    async findRecent(userId: string, limit: number): Promise<ITelegramPostDocument[]> {
        return await TelegramPostModel.find({ userId }).sort({ publishedAt: -1 }).limit(limit);
    }

    // One capped query per channel rather than a single global query — a
    // quiet channel would otherwise get crowded out of a shared limit by a
    // more active one on the same page.
    async findRecentByChannelIds(
        userId: string,
        channelIds: number[],
        limitPerChannel: number
    ): Promise<ITelegramPostDocument[]> {
        const groups = await Promise.all(
            channelIds.map((channelId) =>
                TelegramPostModel.find({ userId, channelId })
                    .sort({ publishedAt: -1 })
                    .limit(limitPerChannel)
            )
        );

        return groups.flat();
    }

    async findById(id: string, userId: string): Promise<ITelegramPostDocument | null> {
        return await TelegramPostModel.findOne({ _id: id, userId });
    }

    async setSummary(id: string, summary: string): Promise<void> {
        await TelegramPostModel.updateOne({ _id: id }, { $set: { summary } });
    }
}
