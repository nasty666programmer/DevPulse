import type { DigestArticle, DigestData } from '../../../../modules/digest/interfaces/index.js';

export interface IDigestRepository {
    save(articles: DigestArticle[]): Promise<DigestData>;
    getLatest(): Promise<DigestData | null>;
}
