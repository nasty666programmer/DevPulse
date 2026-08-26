import type { Types } from 'mongoose';

export interface IFeedSource {
    userId: Types.ObjectId;
    url: string;
    addedAt: Date;
}

export interface IFeedSourceDocument extends IFeedSource {
    _id: Types.ObjectId;
}
