import TelegramChannelModel from '../../models/telegram/telegramChannel.js';
import type {
    ITelegramChannel,
    ITelegramChannelDocument,
} from '../../models/telegram/interface/telegramChannel.js';
import type { ITelegramChannelRepository } from './interface/telegramChannelRepository.js';

export default class TelegramChannelRepository implements ITelegramChannelRepository {
    async upsertByUserAndChannelId(channel: ITelegramChannel): Promise<ITelegramChannelDocument> {
        const updated = await TelegramChannelModel.findOneAndUpdate(
            { userId: channel.userId, channelId: channel.channelId },
            { $set: channel },
            { upsert: true, new: true }
        );

        // findOneAndUpdate with upsert:true, new:true always resolves a document.
        return updated as ITelegramChannelDocument;
    }

    async findAllWithUsername(): Promise<ITelegramChannelDocument[]> {
        return TelegramChannelModel.find({ username: { $ne: null } });
    }

    async findAllForUser(userId: string): Promise<ITelegramChannelDocument[]> {
        return TelegramChannelModel.find({ userId }).sort({ addedAt: -1 });
    }

    // Same order as findAllForUser (most recently added first) — a stable
    // ordering is what makes "page 2 of my channels" mean the same thing
    // every time, instead of reshuffling as new posts come in.
    async findPageForUser(userId: string, offset: number, limit: number): Promise<ITelegramChannelDocument[]> {
        return TelegramChannelModel.find({ userId }).sort({ addedAt: -1 }).skip(offset).limit(limit);
    }

    async countForUser(userId: string): Promise<number> {
        return TelegramChannelModel.countDocuments({ userId });
    }
}
