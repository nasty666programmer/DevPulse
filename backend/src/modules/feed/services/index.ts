import { Types } from 'mongoose';
import type { IFeedItemRepository } from '../../../db/repositories/feed/interface/feedItemRepository.js';
import type { IRawArticleRepository } from '../../../db/repositories/feed/interface/rawArticleRepository.js';
import type { IHtmlParserService, ParsedArticle } from '../../parsers/interfaces/index.js';
import type { IFeedFetcher } from '../../rss/interfaces/index.js';
import type { Category, ICategorizationService } from '../../categorization/interfaces/index.js';
import type { ISummarizerService } from '../../summarizer/interfaces/index.js';
import { isSummarizable } from '../../summarizer/interfaces/index.js';
import config from '../../config/index.js';
import { mapPopulatedFeedItem } from '../mappers.js';
import { isDuplicateKeyError } from '../../../common/utils.js';
import { FeedItemNotFoundError, FeedItemNotSummarizableError } from '../errors.js';

export default class FeedService {
    private readonly rssCollectorService: IFeedFetcher;
    private readonly htmlParserService: IHtmlParserService;
    private readonly feedItemRepository: IFeedItemRepository;
    private readonly rawArticleRepository: IRawArticleRepository;
    private readonly categorizationService: ICategorizationService;
    private readonly summarizerService: ISummarizerService;

    constructor({
        rssCollectorService,
        htmlParserService,
        feedItemRepository,
        rawArticleRepository,
        categorizationService,
        summarizerService,
    }: {
        rssCollectorService: IFeedFetcher;
        htmlParserService: IHtmlParserService;
        feedItemRepository: IFeedItemRepository;
        rawArticleRepository: IRawArticleRepository;
        categorizationService: ICategorizationService;
        summarizerService: ISummarizerService;
    }) {
        this.rssCollectorService = rssCollectorService;
        this.htmlParserService = htmlParserService;
        this.feedItemRepository = feedItemRepository;
        this.rawArticleRepository = rawArticleRepository;
        this.categorizationService = categorizationService;
        this.summarizerService = summarizerService;
    }

    async getItem() {
        const feedItem = await this.feedItemRepository.getOne();

        return feedItem;
    }

    async fetchFeedItems() {
        const feedItems = await this.rssCollectorService.fetchFeed(config.feedSources[0]);
        const firstItem = feedItems[0];

        if (firstItem?.link) {
            const parsedArticle = await this.htmlParserService.parseArticle(firstItem.link);

            if (parsedArticle) {
                await this.saveFeedItem(parsedArticle);
            }
        }

        return firstItem;
    }

    async fetchAllFeeds() {
        const feeds = config.feedSources.map((url) => this.rssCollectorService.fetchFeed(url));

        return await Promise.allSettled(feeds);
    }

    async listItems(limit: number, category?: Category) {
        const items = await this.feedItemRepository.getAll(limit, category);

        return items.map(mapPopulatedFeedItem);
    }

    // Throws FeedItemNotFoundError, FeedItemNotSummarizableError, or lets
    // SummarizerTimeoutError/SummarizerUnavailableError from the summarizer
    // propagate — the controller maps each to its HTTP status.
    async summarizeItem(id: string): Promise<string> {
        if (!Types.ObjectId.isValid(id)) {
            throw new FeedItemNotFoundError();
        }

        const item = await this.feedItemRepository.findById(id);

        if (!item) {
            throw new FeedItemNotFoundError();
        }

        if (item.summary) {
            return item.summary;
        }

        if (!isSummarizable(item.content)) {
            throw new FeedItemNotSummarizableError();
        }

        const summary = await this.summarizerService.summarize(item.content);

        await this.feedItemRepository.setSummary(item._id.toString(), summary);

        return summary;
    }

    async saveFeedItem(article: ParsedArticle) {
        const existing = await this.rawArticleRepository.findByUrl(article.url);

        if (existing) {
            return;
        }

        let rawArticle;

        try {
            rawArticle = await this.rawArticleRepository.create({
                title: article.title ?? 'Untitled',
                url: article.url,
                content: article.content,
                publishedAt: article.publishedAt,
                source: article.source,
            });
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                // Lost a race with another concurrent save inserting the same url.
                return;
            }

            throw error;
        }

        const feedItem = {
            title: rawArticle.title,
            content: article.content,
            date: article.publishedAt,
            rawArticleId: rawArticle._id,
            category: this.categorizationService.categorize({
                title: rawArticle.title,
                content: article.content,
            }),
        };

        await this.feedItemRepository.create(feedItem);
    }
}
