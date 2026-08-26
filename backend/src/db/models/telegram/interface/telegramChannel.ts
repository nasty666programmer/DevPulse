import type { Types } from 'mongoose';

export interface ITelegramChannel {
    userId: Types.ObjectId;
    channelId: number;
    username: string | null;
    title: string;
    addedAt: Date;
}

export interface ITelegramChannelDocument extends ITelegramChannel {
    _id: Types.ObjectId;
}
