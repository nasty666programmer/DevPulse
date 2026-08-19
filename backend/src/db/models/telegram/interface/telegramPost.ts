import type { Types } from 'mongoose';

export interface ITelegramPost {
    channelId: number;
    messageId: number;
    text: string;
    publishedAt: Date;
    mediaUrls: string[];
}

export interface ITelegramPostDocument extends ITelegramPost {
    _id: Types.ObjectId;
}
