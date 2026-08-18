export interface FeedItem {
    title?: string;
    link?: string;
    description?: string;
    pubDate?: string;
    contentSnippet?: string;
    content?: string;
    'content:encoded'?: string;
    [key: string]: unknown;
}

export interface ExtractedArticle {
    title: string | null;
    textContent: string;
    contentHtml: string;
    excerpt: string | null;
    siteName: string | null;
    length: number;
}

export interface ProcessedFeedItem extends FeedItem {
    fullText: string;
    cleanHtml: string;
    extractionStatus: ExtractionStatus;
    extractionError?: string;
}

export interface ExtractArticleOptions {
    timeoutMs?: number;
    userAgent?: string;
    retryOnNetworkError?: boolean;
}

export interface ProcessFeedItemsOptions extends ExtractArticleOptions {
    concurrency?: number;
    delayMinMs?: number;
    delayMaxMs?: number;
    onError?: (url: string | undefined, error: unknown) => void;
}

export type ExtractionStatus = 'ok' | 'fallback' | 'blocked' | 'error';

export interface ParsedArticle {
    title: string | null;
    description: string | null;
    content: string;
    url: string;
    publishedAt: Date;
    source: string;
}

export interface IHtmlParserService {
    parseArticle(url: string): Promise<ParsedArticle | null>;
}
