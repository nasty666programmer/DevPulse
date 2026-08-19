import { Schema, model } from 'mongoose';
import { ALL_CATEGORIES } from '../../../modules/categorization/interfaces/index.js';
import type { IFeedItem } from './interface/feedItem.js';

const feedItemSchema = new Schema<IFeedItem>({
    title: { type: String, required: true },
    content: { type: String, required: true },
    date: { type: Date, required: true, index: true },
    rawArticleId: { type: Schema.Types.ObjectId, ref: 'RawArticle', required: true },
    category: { type: String, required: true, enum: ALL_CATEGORIES, index: true },
});

export default model<IFeedItem>('FeedItem', feedItemSchema);
