import type { DigestArticle, DigestData } from '../../../../modules/digest/interfaces/index.js';

export interface IDigestRepository {
    upsertByDate(date: Date, articles: DigestArticle[]): Promise<void>;
    getLatest(): Promise<DigestData | null>;
}
