import type {
    ITelegramPost,
    ITelegramPostDocument,
} from '../../../models/telegram/interface/telegramPost.js';

export interface ITelegramPostRepository {
    create(post: ITelegramPost): Promise<ITelegramPostDocument>;
    findRecent(limit: number): Promise<ITelegramPostDocument[]>;
    findRecentByChannelIds(
        channelIds: number[],
        limitPerChannel: number
    ): Promise<ITelegramPostDocument[]>;
}
