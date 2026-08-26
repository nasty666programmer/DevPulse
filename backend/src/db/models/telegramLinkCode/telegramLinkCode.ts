import { Schema, model } from 'mongoose';
import type { ITelegramLinkCode } from './interface/telegramLinkCode.js';

const telegramLinkCodeSchema = new Schema<ITelegramLinkCode>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    code: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
});

export default model<ITelegramLinkCode>('TelegramLinkCode', telegramLinkCodeSchema);
