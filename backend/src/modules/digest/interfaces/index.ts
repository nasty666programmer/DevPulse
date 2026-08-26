import type { Category } from '../../categorization/interfaces/index.js';

export interface DigestArticle {
    id: string;
    title: string;
    content: string;
    date: Date;
    category: Category;
    url: string | null;
    source: string | null;
    summary: string | null;
}

export interface DigestData {
    generatedAt: Date;
    articles: DigestArticle[];
}

export interface IDigestRepository {
    save(userId: string, articles: DigestArticle[]): Promise<DigestData>;
    getLatest(userId: string): Promise<DigestData | null>;
}

export interface IDigestGenerator {
    generateDigest(userId: string): Promise<DigestData>;
}

export interface IDigestReader {
    getLatestDigest(userId: string): Promise<DigestData | null>;
}
