export interface DigestArticle {
    title: string;
    url: string | null;
    source: string | null;
}

export interface DigestData {
    date: Date;
    articles: DigestArticle[];
}

export interface IDigestArticleSource {
    listItemsByDate(date: Date): Promise<DigestArticle[]>;
}

export interface IDigestGenerator {
    generateDigest(date?: Date): Promise<void>;
}
