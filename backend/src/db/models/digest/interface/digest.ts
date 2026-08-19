import type { DigestArticle } from '../../../../modules/digest/interfaces/index.js';

export interface IDigest {
    generatedAt: Date;
    articles: DigestArticle[];
}
