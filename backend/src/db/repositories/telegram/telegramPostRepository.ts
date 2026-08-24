import TelegramPostModel from '../../models/telegram/telegramPost.js';
import type {
    ITelegramPost,
    ITelegramPostDocument,
} from '../../models/telegram/interface/telegramPost.js';
import type { ITelegramPostRepository } from './interface/telegramPostRepository.js';

export default class TelegramPostRepository implements ITelegramPostRepository {
    async create(post: ITelegramPost): Promise<ITelegramPostDocument> {
        return TelegramPostModel.create(post);
    }

    async findRecent(limit: number): Promise<ITelegramPostDocument[]> {
        return TelegramPostModel.find().sort({ publishedAt: -1 }).limit(limit);
    }

    // One capped query per channel rather than a single global query — a
    // quiet channel would otherwise get crowded out of a shared limit by a
    // more active one on the same page.
    async findRecentByChannelIds(
        channelIds: number[],
        limitPerChannel: number
    ): Promise<ITelegramPostDocument[]> {
        const groups = await Promise.all(
            channelIds.map((channelId) =>
                TelegramPostModel.find({ channelId }).sort({ publishedAt: -1 }).limit(limitPerChannel)
            )
        );

        return groups.flat();
    }
}
