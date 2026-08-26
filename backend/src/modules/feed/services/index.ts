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

    async getItem(userId: string) {
        const feedItem = await this.feedItemRepository.getOne(userId);

        return feedItem;
    }

    // Dev/debug helper (GET /feed/fetch-item) — fetches the first configured
    // source live and saves one item under the calling user, same as a real
    // collection run would for them.
    async fetchFeedItems(userId: string) {
        const feedItems = await this.rssCollectorService.fetchFeed(config.feedSources[0]);
        const firstItem = feedItems[0];

        if (firstItem?.link) {
            const parsedArticle = await this.htmlParserService.parseArticle(firstItem.link);

            if (parsedArticle) {
                await this.saveFeedItem(parsedArticle, userId);
            }
        }

        return firstItem;
    }

    async fetchAllFeeds() {
        const feeds = config.feedSources.map((url) => this.rssCollectorService.fetchFeed(url));

        return await Promise.allSettled(feeds);
    }

    async listItems(userId: string, limit: number, category?: Category) {
        const items = await this.feedItemRepository.getAll(userId, limit, category);

        return items.map(mapPopulatedFeedItem);
    }

    // Throws FeedItemNotFoundError, FeedItemNotSummarizableError, or lets
    // SummarizerTimeoutError/SummarizerUnavailableError from the summarizer
    // propagate — the controller maps each to its HTTP status.
    async summarizeItem(userId: string, id: string): Promise<string> {
        if (!Types.ObjectId.isValid(id)) {
            throw new FeedItemNotFoundError();
        }

        const item = await this.feedItemRepository.findById(id, userId);

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

    async saveFeedItem(article: ParsedArticle, userId: string) {
        let rawArticle = await this.rawArticleRepository.findByUrl(article.url);

        if (!rawArticle) {
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
                    rawArticle = await this.rawArticleRepository.findByUrl(article.url);
                } else {
                    throw error;
                }
            }
        }

        if (!rawArticle) {
            return;
        }

        const feedItem = {
            title: rawArticle.title,
            content: article.content,
            date: article.publishedAt,
            rawArticleId: rawArticle._id,
            userId: new Types.ObjectId(userId),
            category: this.categorizationService.categorize({
                title: rawArticle.title,
                content: article.content,
            }),
        };

        try {
            await this.feedItemRepository.create(feedItem);
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                // This user already has a feedItem for this (shared) rawArticle.
                return;
            }

            throw error;
        }
    }
}
