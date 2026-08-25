import type { Types } from 'mongoose';

export interface ITelegramPost {
    channelId: number;
    messageId: number;
    text: string;
    publishedAt: Date;
    mediaUrls: string[];
    // Optional on create (Mongoose defaults it to null) — every existing
    // TelegramPostRepository.create() call site is unaffected by this field.
    summary?: string | null;
}

export interface ITelegramPostDocument extends ITelegramPost {
    _id: Types.ObjectId;
    summary: string | null;
}
