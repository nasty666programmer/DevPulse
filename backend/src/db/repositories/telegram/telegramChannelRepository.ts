import TelegramChannelModel from '../../models/telegram/telegramChannel.js';
import type { ITelegramChannel, ITelegramChannelDocument } from '../../models/telegram/interface/telegramChannel.js';
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
}
