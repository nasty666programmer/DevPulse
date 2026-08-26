import { Schema, model } from 'mongoose';
import type { ITelegramChannel } from './interface/telegramChannel.js';

const telegramChannelSchema = new Schema<ITelegramChannel>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channelId: { type: Number, required: true },
    username: { type: String, default: null },
    title: { type: String, required: true },
    addedAt: { type: Date, required: true },
});

// Two users can each register the same underlying Telegram channel — their
// own copy, per the full per-user isolation decision (each gets their own
// posts collected too, no shared dedup across users).
telegramChannelSchema.index({ userId: 1, channelId: 1 }, { unique: true });

export default model<ITelegramChannel>('TelegramChannel', telegramChannelSchema);
