import { Schema, model } from 'mongoose';
import type { IRawArticle } from './interface/rawArticle.js';

const rawArticleSchema = new Schema<IRawArticle>({
    title: { type: String, required: true },
    url: { type: String, required: true, unique: true },
    content: { type: String, required: true },
    publishedAt: { type: Date, required: true, index: true },
    source: { type: String, required: true },
});

export default model<IRawArticle>('RawArticle', rawArticleSchema);
