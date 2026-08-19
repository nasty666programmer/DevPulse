import type {
    ITelegramPost,
    ITelegramPostDocument,
} from '../../../models/telegram/interface/telegramPost.js';

export interface ITelegramPostRepository {
    create(post: ITelegramPost): Promise<ITelegramPostDocument>;
}
