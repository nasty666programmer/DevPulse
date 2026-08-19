import { Schema, model } from 'mongoose';
import type { ITelegramPost } from './interface/telegramPost.js';

const telegramPostSchema = new Schema<ITelegramPost>({
    channelId: { type: Number, required: true },
    messageId: { type: Number, required: true },
    text: { type: String, default: '' },
    publishedAt: { type: Date, required: true },
    mediaUrls: { type: [String], default: [] },
});

// Dedup key: the same channel/message pair is never stored twice, even if
// the collector re-scrapes a page that still contains an already-saved post.
telegramPostSchema.index({ channelId: 1, messageId: 1 }, { unique: true });

export default model<ITelegramPost>('TelegramPost', telegramPostSchema);
