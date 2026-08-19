import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { Types } from 'mongoose';

vi.mock('../../../modules/config/index.js', () => ({
    default: {
        feedSources: ['https://source-a.example/rss', 'https://source-b.example/rss'],
        rssCronSchedule: '0 * * * *',
        rssFetchConcurrency: 3,
        port: 3000,
        defaultItemsLimit: 20,
        feedsPageSize: 5,
    },
}));

import FeedService from '../../../modules/feed/services/index.js';
import type { IFeedFetcher } from '../../../modules/rss/interfaces/index.js';
import type { IHtmlParserService } from '../../../modules/parsers/interfaces/index.js';
import type { IFeedItemRepository } from '../../../db/repositories/feed/interface/feedItemRepository.js';
import type { IRawArticleCreator } from '../../../db/repositories/feed/interface/rawArticleRepository.js';
import type { ICategorizationService } from '../../../modules/categorization/interfaces/index.js';

describe('FeedService', () => {
    let rssCollectorService: { fetchFeed: Mock<IFeedFetcher['fetchFeed']> };
    let htmlParserService: { parseArticle: Mock<IHtmlParserService['parseArticle']> };
    let feedItemRepository: {
        getOne: Mock<IFeedItemRepository['getOne']>;
        create: Mock<IFeedItemRepository['create']>;
        getAll: Mock<IFeedItemRepository['getAll']>;
        getByDate: Mock<IFeedItemRepository['getByDate']>;
    };
    let rawArticleRepository: { create: Mock<IRawArticleCreator['create']> };
    let categorizationService: { categorize: Mock<ICategorizationService['categorize']> };
    let feedService: FeedService;

    beforeEach(() => {
        rssCollectorService = { fetchFeed: vi.fn<IFeedFetcher['fetchFeed']>() };
        htmlParserService = { parseArticle: vi.fn<IHtmlParserService['parseArticle']>() };
        feedItemRepository = {
            getOne: vi.fn<IFeedItemRepository['getOne']>(),
            create: vi.fn<IFeedItemRepository['create']>(),
            getAll: vi.fn<IFeedItemRepository['getAll']>(),
            getByDate: vi.fn<IFeedItemRepository['getByDate']>(),
        };
        rawArticleRepository = { create: vi.fn<IRawArticleCreator['create']>() };
        categorizationService = {
            categorize: vi.fn<ICategorizationService['categorize']>().mockReturnValue('Прочее'),
        };

        feedService = new FeedService({
            rssCollectorService,
            htmlParserService,
            feedItemRepository,
            rawArticleRepository,
            categorizationService,
        });
    });

    it('returns the stored feed item', async () => {
        const storedItem = {
            _id: new Types.ObjectId(),
            title: 'Stored post',
            content: 'Stored content',
            date: new Date('2026-07-01'),
            rawArticleId: new Types.ObjectId(),
            category: 'Прочее' as const,
        };
        feedItemRepository.getOne.mockResolvedValue(storedItem);

        const result = await feedService.getItem();

        expect(feedItemRepository.getOne).toHaveBeenCalled();
        expect(result).toEqual(storedItem);
    });

    it('fetches the first configured feed, parses the first item, saves it and returns it', async () => {
        const feedItems = [
            { link: 'https://reddit.com/post-1' },
            { link: 'https://reddit.com/post-2' },
            { link: 'https://reddit.com/post-3' },
        ];
        const parsedArticle = {
            title: 'Post 1',
            description: 'excerpt',
            url: 'https://reddit.com/post-1',
            content: 'full text',
            publishedAt: new Date('2026-07-01'),
            source: 'reddit.com',
        };
        const rawArticle = { _id: new Types.ObjectId(), ...parsedArticle };
        const savedFeedItem = {
            _id: new Types.ObjectId(),
            title: rawArticle.title,
            content: rawArticle.content,
            date: parsedArticle.publishedAt,
            rawArticleId: rawArticle._id,
            category: 'Прочее' as const,
        };

        rssCollectorService.fetchFeed.mockResolvedValue(feedItems);
        htmlParserService.parseArticle.mockResolvedValue(parsedArticle);
        rawArticleRepository.create.mockResolvedValue(rawArticle);
        feedItemRepository.create.mockResolvedValue(savedFeedItem);

        const result = await feedService.fetchFeedItems();

        expect(rssCollectorService.fetchFeed).toHaveBeenCalledWith('https://source-a.example/rss');
        expect(htmlParserService.parseArticle).toHaveBeenCalledWith(feedItems[0].link);
        expect(rawArticleRepository.create).toHaveBeenCalledWith({
            title: parsedArticle.title,
            url: parsedArticle.url,
            content: parsedArticle.content,
            publishedAt: parsedArticle.publishedAt,
            source: parsedArticle.source,
        });
        expect(categorizationService.categorize).toHaveBeenCalledWith({
            title: rawArticle.title,
            content: parsedArticle.content,
        });
        expect(feedItemRepository.create).toHaveBeenCalledWith({
            title: rawArticle.title,
            content: parsedArticle.content,
            date: parsedArticle.publishedAt,
            rawArticleId: rawArticle._id,
            category: 'Прочее',
        });
        expect(result).toEqual(feedItems[0]);
    });

    it('fetches all configured feed urls and settles every result', async () => {
        rssCollectorService.fetchFeed
            .mockResolvedValueOnce([])
            .mockRejectedValueOnce(new Error('network error'));

        const results = await feedService.fetchAllFeeds();

        expect(rssCollectorService.fetchFeed).toHaveBeenCalledTimes(2);
        expect(rssCollectorService.fetchFeed).toHaveBeenNthCalledWith(1, 'https://source-a.example/rss');
        expect(rssCollectorService.fetchFeed).toHaveBeenNthCalledWith(2, 'https://source-b.example/rss');
        expect(results).toEqual([
            { status: 'fulfilled', value: [] },
            { status: 'rejected', reason: new Error('network error') },
        ]);
    });

});
