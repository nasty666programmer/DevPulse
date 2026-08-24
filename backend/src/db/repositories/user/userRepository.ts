import UserModel from '../../models/user/user.js';
import type { IUserDocument } from '../../models/user/interface/user.js';
import type { IGoogleProfile } from '../../../providers/google/interface/googleAuthProvider.js';
import type { IUserRepository } from './interface/userRepository.js';

export default class UserRepository implements IUserRepository {
    async findById(id: string): Promise<IUserDocument | null> {
        return UserModel.findById(id);
    }

    async upsertFromGoogle(profile: IGoogleProfile): Promise<IUserDocument> {
        const now = new Date();

        const user = await UserModel.findOneAndUpdate(
            { googleId: profile.googleId },
            {
                $set: {
                    email: profile.email,
                    name: profile.name,
                    avatarUrl: profile.avatarUrl,
                    lastLoginAt: now,
                },
                $setOnInsert: { googleId: profile.googleId, createdAt: now },
            },
            { upsert: true, new: true }
        );

        return user as IUserDocument;
    }
}
