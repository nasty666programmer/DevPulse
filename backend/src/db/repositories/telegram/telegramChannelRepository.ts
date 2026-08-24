import TelegramChannelModel from '../../models/telegram/telegramChannel.js';
import type {
    ITelegramChannel,
    ITelegramChannelDocument,
} from '../../models/telegram/interface/telegramChannel.js';
import type { ITelegramChannelRepository } from './interface/telegramChannelRepository.js';

export default class TelegramChannelRepository implements ITelegramChannelRepository {
    async upsertByChannelId(channel: ITelegramChannel): Promise<ITelegramChannelDocument> {
        const updated = await TelegramChannelModel.findOneAndUpdate(
            { channelId: channel.channelId },
            { $set: channel },
            { upsert: true, new: true }
        );

        // findOneAndUpdate with upsert:true, new:true always resolves a document.
        return updated as ITelegramChannelDocument;
    }

    async findAllWithUsername(): Promise<ITelegramChannelDocument[]> {
        return TelegramChannelModel.find({ username: { $ne: null } });
    }

    async findAll(): Promise<ITelegramChannelDocument[]> {
        return TelegramChannelModel.find().sort({ addedAt: -1 });
    }

    // Same order as findAll (most recently added first) — a stable ordering
    // is what makes "page 2 of my channels" mean the same thing every time,
    // instead of reshuffling as new posts come in.
    async findPage(offset: number, limit: number): Promise<ITelegramChannelDocument[]> {
        return TelegramChannelModel.find().sort({ addedAt: -1 }).skip(offset).limit(limit);
    }

    async count(): Promise<number> {
        return TelegramChannelModel.countDocuments();
    }
}
