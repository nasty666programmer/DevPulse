import type { IUserDocument } from '../../../models/user/interface/user.js';
import type { IGoogleProfile } from '../../../../providers/google/interface/googleAuthProvider.js';

export interface IUserRepository {
    findById(id: string): Promise<IUserDocument | null>;
    upsertFromGoogle(profile: IGoogleProfile): Promise<IUserDocument>;
    findByTelegramUserId(telegramUserId: number): Promise<IUserDocument | null>;
    setTelegramUserId(userId: string, telegramUserId: number): Promise<void>;
}
