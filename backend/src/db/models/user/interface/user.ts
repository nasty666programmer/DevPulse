import type { Types } from 'mongoose';

export interface IUser {
    googleId: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    createdAt: Date;
    lastLoginAt: Date;
    // Set once the user links their Telegram account via a one-time code sent
    // to the bot (modules/telegramLink). Absent (not null) until then — see
    // the sparse unique index on the schema.
    telegramUserId?: number | null;
}

export interface IUserDocument extends IUser {
    _id: Types.ObjectId;
}
