import type { DigestArticle } from '../../../../modules/digest/interfaces/index.js';

export interface IDigest {
    date: Date;
    articles: DigestArticle[];
}
