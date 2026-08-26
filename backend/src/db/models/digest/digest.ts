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
        summary: { type: String, default: null },
    },
    { _id: false }
);

// One per user — a snapshot of "the current digest" for that user, not a
// per-day archive. Replaced wholesale on every regeneration for that user
// (either the automatic one after RSS collection, or the manual "Обновить
// дайджест" button). See DigestRepository.save.
const digestSchema = new Schema<IDigest>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    generatedAt: { type: Date, required: true },
    articles: { type: [digestArticleSchema], default: [] },
});

export default model<IDigest>('Digest', digestSchema);
