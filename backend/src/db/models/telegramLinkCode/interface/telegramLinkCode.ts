import type { Types } from 'mongoose';

export interface ITelegramLinkCode {
    userId: Types.ObjectId;
    code: string;
    expiresAt: Date;
    createdAt: Date;
}

export interface ITelegramLinkCodeDocument extends ITelegramLinkCode {
    _id: Types.ObjectId;
}
