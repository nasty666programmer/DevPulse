import type {
    ITelegramChannel,
    ITelegramChannelDocument,
} from '../../../models/telegram/interface/telegramChannel.js';

export interface ITelegramChannelRepository {
    upsertByChannelId(channel: ITelegramChannel): Promise<ITelegramChannelDocument>;
    findAllWithUsername(): Promise<ITelegramChannelDocument[]>;
    findAll(): Promise<ITelegramChannelDocument[]>;
    findPage(offset: number, limit: number): Promise<ITelegramChannelDocument[]>;
    count(): Promise<number>;
}
