import type {
    ITelegramChannel,
    ITelegramChannelDocument,
} from '../../../models/telegram/interface/telegramChannel.js';

export interface ITelegramChannelRepository {
    upsertByUserAndChannelId(channel: ITelegramChannel): Promise<ITelegramChannelDocument>;
    // Unscoped — every channel across every user, regardless of owner. Only
    // the collector uses this (it needs to visit every registered channel).
    findAllWithUsername(): Promise<ITelegramChannelDocument[]>;
    findAllForUser(userId: string): Promise<ITelegramChannelDocument[]>;
    findPageForUser(userId: string, offset: number, limit: number): Promise<ITelegramChannelDocument[]>;
    countForUser(userId: string): Promise<number>;
}
