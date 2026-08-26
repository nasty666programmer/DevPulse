import type { Types } from 'mongoose';
import type { Category } from '../../../../modules/categorization/interfaces/index.js';
import type { IRawArticle } from './rawArticle.js';

export interface IFeedItem {
    title: string;
    content: string;
    date: Date;
    rawArticleId: Types.ObjectId;
    category: Category;
    userId: Types.ObjectId;
    // Optional on create (Mongoose defaults it to null) — every existing
    // FeedItemRepository.create() call site is unaffected by this field.
    summary?: string | null;
}

export interface IFeedItemDocument extends IFeedItem {
    _id: Types.ObjectId;
}

/** Shape returned by FeedItemRepository.getAll(), which populates rawArticleId. */
export interface IPopulatedFeedItem extends Omit<IFeedItem, 'rawArticleId'> {
    _id: Types.ObjectId;
    rawArticleId: (IRawArticle & { _id: Types.ObjectId }) | null;
}
