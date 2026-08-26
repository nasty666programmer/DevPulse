import type { DigestArticle, DigestData } from '../../../../modules/digest/interfaces/index.js';

export interface IDigestRepository {
    save(userId: string, articles: DigestArticle[]): Promise<DigestData>;
    getLatest(userId: string): Promise<DigestData | null>;
}
