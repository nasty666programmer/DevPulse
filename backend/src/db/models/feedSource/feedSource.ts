import { Schema, model } from 'mongoose';
import type { IFeedSource } from './interface/feedSource.js';

const feedSourceSchema = new Schema<IFeedSource>({
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    url: { type: String, required: true },
    addedAt: { type: Date, required: true },
});

// A user can't add the same URL twice — cheap guard against duplicate
// collection work for the same source under full per-user isolation.
feedSourceSchema.index({ userId: 1, url: 1 }, { unique: true });

export default model<IFeedSource>('FeedSource', feedSourceSchema);
