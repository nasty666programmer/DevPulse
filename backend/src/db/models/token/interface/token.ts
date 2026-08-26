import type { Types } from 'mongoose';

export interface IToken {
    token: string;
    userId: Types.ObjectId;
    expiresAt: Date;
    createdAt: Date;
}

export interface ITokenDocument extends IToken {
    _id: Types.ObjectId;
}
