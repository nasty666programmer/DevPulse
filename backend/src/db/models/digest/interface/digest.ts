import type { Types } from 'mongoose';
import type { DigestArticle } from '../../../../modules/digest/interfaces/index.js';

export interface IDigest {
    userId: Types.ObjectId;
    generatedAt: Date;
    articles: DigestArticle[];
}
