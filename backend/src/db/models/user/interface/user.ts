import type { Types } from 'mongoose';

export interface IUser {
    googleId: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    createdAt: Date;
    lastLoginAt: Date;
}

export interface IUserDocument extends IUser {
    _id: Types.ObjectId;
}
