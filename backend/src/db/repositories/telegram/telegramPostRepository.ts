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
}
