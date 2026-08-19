import { Schema, model } from 'mongoose';
import type { ITelegramChannel } from './interface/telegramChannel.js';

const telegramChannelSchema = new Schema<ITelegramChannel>({
    channelId: { type: Number, required: true, unique: true },
    username: { type: String, default: null },
    title: { type: String, required: true },
    addedAt: { type: Date, required: true },
});

export default model<ITelegramChannel>('TelegramChannel', telegramChannelSchema);
