import { Schema, model } from 'mongoose';
import type { IUser } from './interface/user.js';

const userSchema = new Schema<IUser>({
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    avatarUrl: { type: String, default: null },
    createdAt: { type: Date, required: true },
    lastLoginAt: { type: Date, required: true },
});

export default model<IUser>('User', userSchema);
