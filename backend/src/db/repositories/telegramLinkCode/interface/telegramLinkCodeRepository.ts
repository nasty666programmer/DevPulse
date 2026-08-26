import type {
    ITelegramLinkCode,
    ITelegramLinkCodeDocument,
} from '../../../models/telegramLinkCode/interface/telegramLinkCode.js';

export interface ITelegramLinkCodeRepository {
    create(data: ITelegramLinkCode): Promise<ITelegramLinkCodeDocument>;
    findByCode(code: string): Promise<ITelegramLinkCodeDocument | null>;
    deleteByCode(code: string): Promise<void>;
    // Called before issuing a fresh code so a user never has more than one
    // outstanding code at a time.
    deleteByUser(userId: string): Promise<void>;
}
