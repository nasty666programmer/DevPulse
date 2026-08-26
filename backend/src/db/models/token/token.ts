import { Schema, model } from 'mongoose';
import type { IToken } from './interface/token.js';

const tokenSchema = new Schema<IToken>({
    token: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
});

export default model<IToken>('Token', tokenSchema);
