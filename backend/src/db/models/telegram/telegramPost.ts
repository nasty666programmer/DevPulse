import { Schema, model } from 'mongoose';
import type { ITelegramPost } from './interface/telegramPost.js';

const telegramPostSchema = new Schema<ITelegramPost>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channelId: { type: Number, required: true },
    messageId: { type: Number, required: true },
    text: { type: String, default: '' },
    publishedAt: { type: Date, required: true },
    mediaUrls: { type: [String], default: [] },
    summary: { type: String, default: null },
});

// Dedup key: the same (user, channel, message) triple is never stored twice,
// even if the collector re-scrapes a page that still contains an
// already-saved post. Per-user, not global — two users who each registered
// the same channel get their own copies of its posts.
telegramPostSchema.index({ userId: 1, channelId: 1, messageId: 1 }, { unique: true });

export default model<ITelegramPost>('TelegramPost', telegramPostSchema);
