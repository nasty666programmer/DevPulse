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
    generatedAt: Date;
    articles: DigestArticle[];
}

export interface IDigestRepository {
    save(articles: DigestArticle[]): Promise<DigestData>;
    getLatest(): Promise<DigestData | null>;
}

export interface IDigestGenerator {
    generateDigest(): Promise<DigestData>;
}

export interface IDigestReader {
    getLatestDigest(): Promise<DigestData | null>;
}
