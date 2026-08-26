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
import type { IRawArticleRepository } from '../../../db/repositories/feed/interface/rawArticleRepository.js';
import type { ICategorizationService } from '../../../modules/categorization/interfaces/index.js';
import type { ISummarizerService } from '../../../modules/summarizer/interfaces/index.js';
import { FeedItemNotFoundError, FeedItemNotSummarizableError } from '../../../modules/feed/errors.js';
import { SummarizerTimeoutError } from '../../../providers/summarizer/errors.js';

const USER_ID = new Types.ObjectId().toString();

describe('FeedService', () => {
    let rssCollectorService: { fetchFeed: Mock<IFeedFetcher['fetchFeed']> };
    let htmlParserService: { parseArticle: Mock<IHtmlParserService['parseArticle']> };
    let feedItemRepository: {
        getOne: Mock<IFeedItemRepository['getOne']>;
        create: Mock<IFeedItemRepository['create']>;
        getAll: Mock<IFeedItemRepository['getAll']>;
        getRecentByCategory: Mock<IFeedItemRepository['getRecentByCategory']>;
        findById: Mock<IFeedItemRepository['findById']>;
        setSummary: Mock<IFeedItemRepository['setSummary']>;
    };
    let rawArticleRepository: {
        create: Mock<IRawArticleRepository['create']>;
        findByUrl: Mock<IRawArticleRepository['findByUrl']>;
    };
    let categorizationService: { categorize: Mock<ICategorizationService['categorize']> };
    let summarizerService: { summarize: Mock<ISummarizerService['summarize']> };
    let feedService: FeedService;

    beforeEach(() => {
        rssCollectorService = { fetchFeed: vi.fn<IFeedFetcher['fetchFeed']>() };
        htmlParserService = { parseArticle: vi.fn<IHtmlParserService['parseArticle']>() };
        feedItemRepository = {
            getOne: vi.fn<IFeedItemRepository['getOne']>(),
            create: vi.fn<IFeedItemRepository['create']>(),
            getAll: vi.fn<IFeedItemRepository['getAll']>(),
            getRecentByCategory: vi.fn<IFeedItemRepository['getRecentByCategory']>(),
            findById: vi.fn<IFeedItemRepository['findById']>(),
            setSummary: vi.fn<IFeedItemRepository['setSummary']>(),
        };
        rawArticleRepository = {
            create: vi.fn<IRawArticleRepository['create']>(),
            findByUrl: vi.fn<IRawArticleRepository['findByUrl']>().mockResolvedValue(null),
        };
        categorizationService = {
            categorize: vi.fn<ICategorizationService['categorize']>().mockReturnValue('Прочее'),
        };
        summarizerService = { summarize: vi.fn<ISummarizerService['summarize']>() };

        feedService = new FeedService({
            rssCollectorService,
            htmlParserService,
            feedItemRepository,
            rawArticleRepository,
            categorizationService,
            summarizerService,
        });
    });

    it('returns the stored feed item for the given user', async () => {
        const storedItem = {
            _id: new Types.ObjectId(),
            title: 'Stored post',
            content: 'Stored content',
            date: new Date('2026-07-01'),
            rawArticleId: new Types.ObjectId(),
            category: 'Прочее' as const,
            userId: new Types.ObjectId(USER_ID),
            summary: null,
        };
        feedItemRepository.getOne.mockResolvedValue(storedItem);

        const result = await feedService.getItem(USER_ID);

        expect(feedItemRepository.getOne).toHaveBeenCalledWith(USER_ID);
        expect(result).toEqual(storedItem);
    });

    it('fetches the first configured feed, parses the first item, saves it under the user and returns it', async () => {
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
            userId: new Types.ObjectId(USER_ID),
            summary: null,
        };

        rssCollectorService.fetchFeed.mockResolvedValue(feedItems);
        htmlParserService.parseArticle.mockResolvedValue(parsedArticle);
        rawArticleRepository.create.mockResolvedValue(rawArticle);
        feedItemRepository.create.mockResolvedValue(savedFeedItem);

        const result = await feedService.fetchFeedItems(USER_ID);

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
            userId: new Types.ObjectId(USER_ID),
            category: 'Прочее',
        });
        expect(result).toEqual(feedItems[0]);
    });

    it('reuses an already-stored rawArticle (shared cache) but still creates a feedItem for this user', async () => {
        const feedItems = [{ link: 'https://reddit.com/post-1' }];
        const parsedArticle = {
            title: 'Post 1',
            description: 'excerpt',
            url: 'https://reddit.com/post-1',
            content: 'full text',
            publishedAt: new Date('2026-07-01'),
            source: 'reddit.com',
        };
        const existingRawArticle = { _id: new Types.ObjectId(), ...parsedArticle };

        rssCollectorService.fetchFeed.mockResolvedValue(feedItems);
        htmlParserService.parseArticle.mockResolvedValue(parsedArticle);
        rawArticleRepository.findByUrl.mockResolvedValue(existingRawArticle);

        await expect(feedService.fetchFeedItems(USER_ID)).resolves.toEqual(feedItems[0]);

        expect(rawArticleRepository.create).not.toHaveBeenCalled();
        expect(feedItemRepository.create).toHaveBeenCalledWith({
            title: existingRawArticle.title,
            content: parsedArticle.content,
            date: parsedArticle.publishedAt,
            rawArticleId: existingRawArticle._id,
            userId: new Types.ObjectId(USER_ID),
            category: 'Прочее',
        });
    });

    it('does not throw when this user already has a feedItem for the rawArticle', async () => {
        const feedItems = [{ link: 'https://reddit.com/post-1' }];
        const parsedArticle = {
            title: 'Post 1',
            description: 'excerpt',
            url: 'https://reddit.com/post-1',
            content: 'full text',
            publishedAt: new Date('2026-07-01'),
            source: 'reddit.com',
        };
        const existingRawArticle = { _id: new Types.ObjectId(), ...parsedArticle };

        rssCollectorService.fetchFeed.mockResolvedValue(feedItems);
        htmlParserService.parseArticle.mockResolvedValue(parsedArticle);
        rawArticleRepository.findByUrl.mockResolvedValue(existingRawArticle);
        feedItemRepository.create.mockRejectedValue(
            Object.assign(new Error('E11000 duplicate key error'), { code: 11000 })
        );

        await expect(feedService.fetchFeedItems(USER_ID)).resolves.toEqual(feedItems[0]);
    });

    it('recovers the rawArticle and still saves a feedItem when creating it loses a duplicate-URL race', async () => {
        const feedItems = [{ link: 'https://reddit.com/post-1' }];
        const parsedArticle = {
            title: 'Post 1',
            description: 'excerpt',
            url: 'https://reddit.com/post-1',
            content: 'full text',
            publishedAt: new Date('2026-07-01'),
            source: 'reddit.com',
        };
        const recoveredRawArticle = { _id: new Types.ObjectId(), ...parsedArticle };

        rssCollectorService.fetchFeed.mockResolvedValue(feedItems);
        htmlParserService.parseArticle.mockResolvedValue(parsedArticle);
        rawArticleRepository.findByUrl
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(recoveredRawArticle);
        rawArticleRepository.create.mockRejectedValue(
            Object.assign(new Error('E11000 duplicate key error'), { code: 11000 })
        );

        await expect(feedService.fetchFeedItems(USER_ID)).resolves.toEqual(feedItems[0]);

        expect(feedItemRepository.create).toHaveBeenCalledWith({
            title: recoveredRawArticle.title,
            content: parsedArticle.content,
            date: parsedArticle.publishedAt,
            rawArticleId: recoveredRawArticle._id,
            userId: new Types.ObjectId(USER_ID),
            category: 'Прочее',
        });
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

    describe('listItems', () => {
        it('lists items without a category filter, scoped to the user', async () => {
            feedItemRepository.getAll.mockResolvedValue([]);

            await feedService.listItems(USER_ID, 20);

            expect(feedItemRepository.getAll).toHaveBeenCalledWith(USER_ID, 20, undefined);
        });

        it('passes the category filter through to the repository', async () => {
            feedItemRepository.getAll.mockResolvedValue([]);

            await feedService.listItems(USER_ID, 20, 'Docker');

            expect(feedItemRepository.getAll).toHaveBeenCalledWith(USER_ID, 20, 'Docker');
        });

        it('maps populated feed items to the flat DTO shape', async () => {
            const rawArticleId = new Types.ObjectId();
            feedItemRepository.getAll.mockResolvedValue([
                {
                    _id: new Types.ObjectId(),
                    title: 'Post',
                    content: 'Body',
                    date: new Date('2026-08-18'),
                    category: 'Docker',
                    userId: new Types.ObjectId(USER_ID),
                    summary: null,
                    rawArticleId: {
                        _id: rawArticleId,
                        title: 'Post',
                        url: 'https://example.com/post',
                        content: 'Body',
                        publishedAt: new Date('2026-08-18'),
                        source: 'example.com',
                    },
                },
            ]);

            const items = await feedService.listItems(USER_ID, 20);

            expect(items).toEqual([
                {
                    id: expect.any(String),
                    title: 'Post',
                    content: 'Body',
                    date: new Date('2026-08-18'),
                    category: 'Docker',
                    url: 'https://example.com/post',
                    source: 'example.com',
                    summary: null,
                },
            ]);
        });
    });

    describe('summarizeItem', () => {
        const objectId = new Types.ObjectId();
        const id = objectId.toString();
        const longContent = 'a'.repeat(250);

        function feedItemDocument(overrides: Partial<{ content: string; summary: string | null }> = {}) {
            return {
                _id: objectId,
                title: 'Post',
                content: longContent,
                date: new Date('2026-08-18'),
                rawArticleId: new Types.ObjectId(),
                category: 'Прочее' as const,
                userId: new Types.ObjectId(USER_ID),
                summary: null,
                ...overrides,
            };
        }

        it('throws FeedItemNotFoundError for a malformed id, without querying the repository', async () => {
            await expect(feedService.summarizeItem(USER_ID, 'not-a-valid-id')).rejects.toThrow(
                FeedItemNotFoundError
            );

            expect(feedItemRepository.findById).not.toHaveBeenCalled();
        });

        it('throws FeedItemNotFoundError when the item does not exist (or belongs to another user)', async () => {
            feedItemRepository.findById.mockResolvedValue(null);

            await expect(feedService.summarizeItem(USER_ID, id)).rejects.toThrow(FeedItemNotFoundError);
            expect(feedItemRepository.findById).toHaveBeenCalledWith(id, USER_ID);
            expect(summarizerService.summarize).not.toHaveBeenCalled();
        });

        it('returns the cached summary without calling the summarizer', async () => {
            feedItemRepository.findById.mockResolvedValue(feedItemDocument({ summary: 'Already summarized.' }));

            await expect(feedService.summarizeItem(USER_ID, id)).resolves.toBe('Already summarized.');
            expect(summarizerService.summarize).not.toHaveBeenCalled();
        });

        it('throws FeedItemNotSummarizableError without calling the summarizer when content is too short', async () => {
            feedItemRepository.findById.mockResolvedValue(feedItemDocument({ content: 'too short' }));

            await expect(feedService.summarizeItem(USER_ID, id)).rejects.toThrow(FeedItemNotSummarizableError);
            expect(summarizerService.summarize).not.toHaveBeenCalled();
        });

        it('summarizes, persists, and returns the summary on a cache miss', async () => {
            feedItemRepository.findById.mockResolvedValue(feedItemDocument());
            summarizerService.summarize.mockResolvedValue('Fresh summary.');

            await expect(feedService.summarizeItem(USER_ID, id)).resolves.toBe('Fresh summary.');
            expect(summarizerService.summarize).toHaveBeenCalledWith(longContent);
            expect(feedItemRepository.setSummary).toHaveBeenCalledWith(id, 'Fresh summary.');
        });

        it('propagates summarizer errors without persisting anything', async () => {
            feedItemRepository.findById.mockResolvedValue(feedItemDocument());
            const error = new SummarizerTimeoutError();
            summarizerService.summarize.mockRejectedValue(error);

            await expect(feedService.summarizeItem(USER_ID, id)).rejects.toThrow(error);
            expect(feedItemRepository.setSummary).not.toHaveBeenCalled();
        });
    });
});
