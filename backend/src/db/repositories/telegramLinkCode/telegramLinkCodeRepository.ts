import TelegramLinkCodeModel from '../../models/telegramLinkCode/telegramLinkCode.js';
import type {
    ITelegramLinkCode,
    ITelegramLinkCodeDocument,
} from '../../models/telegramLinkCode/interface/telegramLinkCode.js';
import type { ITelegramLinkCodeRepository } from './interface/telegramLinkCodeRepository.js';

export default class TelegramLinkCodeRepository implements ITelegramLinkCodeRepository {
    async create(data: ITelegramLinkCode): Promise<ITelegramLinkCodeDocument> {
        return await TelegramLinkCodeModel.create(data);
    }

    async findByCode(code: string): Promise<ITelegramLinkCodeDocument | null> {
        return await TelegramLinkCodeModel.findOne({ code });
    }

    async deleteByCode(code: string): Promise<void> {
        await TelegramLinkCodeModel.deleteOne({ code });
    }

    async deleteByUser(userId: string): Promise<void> {
        await TelegramLinkCodeModel.deleteMany({ userId });
    }
}
