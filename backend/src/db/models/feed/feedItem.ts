import { Schema, model } from 'mongoose';
import type { IFeedItem } from './interface/feedItem.js';

const CATEGORIES = ['Node.js', 'Docker', 'AWS', 'DevOps', 'AI', 'Прочее'] as const;

const feedItemSchema = new Schema<IFeedItem>({
    title: { type: String, required: true },
    content: { type: String, required: true },
    date: { type: Date, required: true, index: true },
    rawArticleId: { type: Schema.Types.ObjectId, ref: 'RawArticle', required: true },
    category: { type: String, required: true, enum: CATEGORIES },
});

export default model<IFeedItem>('FeedItem', feedItemSchema);
