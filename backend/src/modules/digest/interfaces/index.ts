import type { Category } from '../../categorization/interfaces/index.js';

export interface DigestArticle {
    id: string;
    title: string;
    content: string;
    date: Date;
    category: Category;
    url: string | null;
    source: string | null;
}

export interface DigestData {
    date: Date;
    articles: DigestArticle[];
}

export interface IDigestRepository {
    upsertByDate(date: Date, articles: DigestArticle[]): Promise<void>;
    getLatest(): Promise<DigestData | null>;
}

export interface IDigestGenerator {
    generateDigest(date?: Date): Promise<void>;
}

export interface IDigestReader {
    getLatestDigest(): Promise<DigestData | null>;
}
