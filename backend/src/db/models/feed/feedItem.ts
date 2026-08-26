import { Schema, model } from 'mongoose';
import { ALL_CATEGORIES } from '../../../modules/categorization/interfaces/index.js';
import type { IFeedItem } from './interface/feedItem.js';

const feedItemSchema = new Schema<IFeedItem>({
    title: { type: String, required: true },
    content: { type: String, required: true },
    date: { type: Date, required: true, index: true },
    rawArticleId: { type: Schema.Types.ObjectId, ref: 'RawArticle', required: true },
    category: { type: String, required: true, enum: ALL_CATEGORIES, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    summary: { type: String, default: null },
});

// rawArticle content is shared/deduped by URL (see RawArticle's own unique
// index on url), but each user gets their own feedItem row for it — this is
// the actual per-user isolation boundary. A duplicate-key error here means
// "this user already has this article," not "the article doesn't exist yet."
feedItemSchema.index({ userId: 1, rawArticleId: 1 }, { unique: true });

export default model<IFeedItem>('FeedItem', feedItemSchema);
