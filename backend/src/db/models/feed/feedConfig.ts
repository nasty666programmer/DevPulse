import { Schema, model } from 'mongoose';
import type { IFeedConfig } from './interface/feedConfig.js';

const feedConfigSchema = new Schema<IFeedConfig>({
    contentSelector: { type: String },
});

export default model<IFeedConfig>('FeedConfig', feedConfigSchema);
