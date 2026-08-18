import RawArticleRepository from '../../../db/repositories/feed/rawArticleRepository.js';
import { extractArticle } from './extractArticle.js';
import type { IHtmlParserService, ParsedArticle } from '../interfaces/index.js';

export default class HtmlParserServices implements IHtmlParserService {
    private readonly rawArticleRepository: RawArticleRepository;

    constructor({ rawArticleRepository }: { rawArticleRepository: RawArticleRepository }) {
        this.rawArticleRepository = rawArticleRepository;
    }

    async parseArticle(url: string): Promise<ParsedArticle | null> {
        const article = await extractArticle(url);

        if (!article) {
            return null;
        }

        return {
            title: article.title,
            description: article.excerpt,
            content: article.textContent,
            url,
            publishedAt: new Date(),
            source: new URL(url).hostname,
        };
    }
}
