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

// Singleton — a snapshot of "the current digest", not a per-day archive. Always
// exactly one document, replaced wholesale on every regeneration (either the
// automatic one after RSS collection, or the manual "Обновить дайджест" button).
// See DigestRepository.save.
const digestSchema = new Schema<IDigest>({
    generatedAt: { type: Date, required: true },
    articles: { type: [digestArticleSchema], default: [] },
});

export default model<IDigest>('Digest', digestSchema);
