import type {
    ITelegramPost,
    ITelegramPostDocument,
} from '../../../models/telegram/interface/telegramPost.js';

export interface ITelegramPostRepository {
    create(post: ITelegramPost): Promise<ITelegramPostDocument>;
    findRecent(userId: string, limit: number): Promise<ITelegramPostDocument[]>;
    findRecentByChannelIds(
        userId: string,
        channelIds: number[],
        limitPerChannel: number
    ): Promise<ITelegramPostDocument[]>;
    findById(id: string, userId: string): Promise<ITelegramPostDocument | null>;
    setSummary(id: string, summary: string): Promise<void>;
}
