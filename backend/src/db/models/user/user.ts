import { Schema, model } from 'mongoose';
import type { IUser } from './interface/user.js';

const userSchema = new Schema<IUser>({
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    avatarUrl: { type: String, default: null },
    createdAt: { type: Date, required: true },
    lastLoginAt: { type: Date, required: true },
    // No `default: null` — Mongoose would then write it on every document,
    // and a unique index over an always-present null collides on the second
    // unlinked user. Sparse only excludes documents where the field is
    // truly absent, which "no default" gives us.
    telegramUserId: { type: Number, unique: true, sparse: true },
});

export default model<IUser>('User', userSchema);
