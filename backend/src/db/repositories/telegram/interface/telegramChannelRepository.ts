import type { ITelegramChannel, ITelegramChannelDocument } from '../../../models/telegram/interface/telegramChannel.js';

export interface ITelegramChannelRepository {
    upsertByChannelId(channel: ITelegramChannel): Promise<ITelegramChannelDocument>;
}
