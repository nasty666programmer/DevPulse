import type { Types } from 'mongoose';

export interface IRawArticle {
    title: string;
    url: string;
    content: string;
    publishedAt: Date;
    source: string;
}

export interface IRawArticleDocument extends IRawArticle {
    _id: Types.ObjectId;
}
