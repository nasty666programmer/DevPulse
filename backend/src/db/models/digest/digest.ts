import { Schema, model } from 'mongoose';
import type { IDigest } from './interface/digest.js';

const digestArticleSchema = new Schema(
    {
        id: { type: String, required: true },
        title: { type: String, required: true },
        content: { type: String, required: true },
        date: { type: Date, required: true },
        category: { type: String, required: true },
        url: { type: String, default: null },
        source: { type: String, default: null },
    },
    { _id: false }
);

// One document per calendar day — regenerated (upserted) every time RSS collection
// runs, rather than on a separate schedule. See DigestRepository.upsertByDate.
const digestSchema = new Schema<IDigest>({
    date: { type: Date, required: true, unique: true, index: true },
    articles: { type: [digestArticleSchema], default: [] },
});

export default model<IDigest>('Digest', digestSchema);
