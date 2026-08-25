import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { Types } from 'mongoose';

const { processFeedItemsMock } = vi.hoisted(() => ({
    processFeedItemsMock: vi.fn(),
}));

vi.mock('../../../modules/parsers/services/processFeedItems.js', () => ({
    processFeedItems: processFeedItemsMock,
}));

vi.mock('../../../modules/config/index.js', () => ({
    default: {
        feedSources: ['https://source-a.example/rss', 'https://source-b.example/rss'],
        rssCronSchedule: '0 * * * *',
    },
}));

import RssCollectorServices from '../../../modules/rss/services/index.js';
import type { IRawArticleRepository } from '../../../db/repositories/feed/interface/rawArticleRepository.js';
import type { IFeedItemCreator } from '../../../db/repositories/feed/interface/feedItemRepository.js';
import type { ICategorizationService } from '../../../modules/categorization/interfaces/index.js';
import type { IDigestGenerator } from '../../../modules/digest/interfaces/index.js';
import type { IProvider } from '../../../providers/interfaces.js';
import type { FeedItem } from '../../../modules/parsers/interfaces/index.js';

describe('RssCollectorServices', () => {
    let rawArticleRepository: {
        findByUrl: Mock<IRawArticleRepository['findByUrl']>;
        create: Mock<IRawArticleRepository['create']>;
    };
    let feedItemRepository: { create: Mock<IFeedItemCreator['create']> };
    let categorizationService: { categorize: Mock<ICategorizationService['categorize']> };
    let digestService: { generateDigest: Mock<IDigestGenerator['generateDigest']> };
    let rssProvider: { fetch: Mock<IProvider<FeedItem>['fetch']> };
    let service: RssCollectorServices;

    beforeEach(() => {
        vi.clearAllMocks();

        rawArticleRepository = {
            findByUrl: vi.fn<IRawArticleRepository['findByUrl']>(),
            create: vi.fn<IRawArticleRepository['create']>(),
        };
        feedItemRepository = { create: vi.fn<IFeedItemCreator['create']>() };
        categorizationService = {
            categorize: vi.fn<ICategorizationService['categorize']>().mockReturnValue('Прочее'),
        };
        digestService = {
            generateDigest: vi
                .fn<IDigestGenerator['generateDigest']>()
                .mockResolvedValue({ generatedAt: new Date(), articles: [] }),
        };
        rssProvider = { fetch: vi.fn<IProvider<FeedItem>['fetch']>() };

        service = new RssCollectorServices({
            rawArticleRepository,
            feedItemRepository,
            categorizationService,
            digestService,
            rssProvider,
        });
    });

    it('saves only new items, skipping ones already stored by URL', async () => {
        rssProvider.fetch.mockResolvedValue([
            { link: 'https://a.example/1' },
            { link: 'https://a.example/2' },
        ]);
        processFeedItemsMock.mockResolvedValue([
            { link: 'https://a.example/1', title: 'New', fullText: 'text 1', pubDate: '2026-08-01' },
            { link: 'https://a.example/2', title: 'Existing', fullText: 'text 2', pubDate: '2026-08-02' },
        ]);
        rawArticleRepository.findByUrl.mockImplementation(async (url: string) =>
            url === 'https://a.example/2'
                ? {
                      _id: new Types.ObjectId(),
                      title: 'Existing',
                      url,
                      content: 'text 2',
                      publishedAt: new Date('2026-08-02'),
                      source: 'a.example',
                  }
                : null
        );
        rawArticleRepository.create.mockResolvedValue({
            _id: new Types.ObjectId(),
            title: 'New',
            url: 'https://a.example/1',
            content: 'text 1',
            publishedAt: new Date('2026-08-01'),
            source: 'a.example',
        });
        feedItemRepository.create.mockResolvedValue({
            _id: new Types.ObjectId(),
            title: 'New',
            content: 'text 1',
            date: new Date('2026-08-01'),
            rawArticleId: new Types.ObjectId(),
            category: 'Прочее',
            summary: null,
        });

        const saved = await service.collect();

        // 2 configured sources, each yielding the same mocked items -> 1 new item saved per source
        expect(rawArticleRepository.create).toHaveBeenCalledTimes(2);
        expect(rawArticleRepository.create).toHaveBeenCalledWith({
            title: 'New',
            url: 'https://a.example/1',
            content: 'text 1',
            publishedAt: new Date('2026-08-01'),
            source: 'a.example',
        });
        expect(categorizationService.categorize).toHaveBeenCalledWith({ title: 'New', content: 'text 1' });
        expect(feedItemRepository.create).toHaveBeenCalledTimes(2);
        expect(feedItemRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ category: 'Прочее' })
        );
        expect(saved).toBe(2);
    });

    it('does not let one failing source abort collection of the others', async () => {
        rssProvider.fetch
            .mockRejectedValueOnce(new Error('network down'))
            .mockResolvedValueOnce([{ link: 'https://b.example/1' }]);
        processFeedItemsMock.mockResolvedValue([
            { link: 'https://b.example/1', title: 'B post', fullText: 'text', pubDate: '2026-08-03' },
        ]);
        rawArticleRepository.findByUrl.mockResolvedValue(null);
        rawArticleRepository.create.mockResolvedValue({
            _id: new Types.ObjectId(),
            title: 'B post',
            url: 'https://b.example/1',
            content: 'text',
            publishedAt: new Date('2026-08-03'),
            source: 'b.example',
        });
        feedItemRepository.create.mockResolvedValue({
            _id: new Types.ObjectId(),
            title: 'B post',
            content: 'text',
            date: new Date('2026-08-03'),
            rawArticleId: new Types.ObjectId(),
            category: 'Прочее',
            summary: null,
        });

        const saved = await service.collect();

        expect(saved).toBe(1);
        expect(rawArticleRepository.create).toHaveBeenCalledTimes(1);
    });

    it('skips an item gracefully when rawArticleRepository.create hits a duplicate key race', async () => {
        rssProvider.fetch.mockResolvedValue([{ link: 'https://a.example/1' }]);
        processFeedItemsMock.mockResolvedValue([
            { link: 'https://a.example/1', title: 'New', fullText: 'text 1', pubDate: '2026-08-01' },
        ]);
        rawArticleRepository.findByUrl.mockResolvedValue(null);
        rawArticleRepository.create.mockRejectedValue(
            Object.assign(new Error('E11000 duplicate key error'), { code: 11000 })
        );

        const saved = await service.collect();

        expect(saved).toBe(0);
        expect(feedItemRepository.create).not.toHaveBeenCalled();
    });

    it('lets a non-duplicate-key error from rawArticleRepository.create propagate as a source failure', async () => {
        rssProvider.fetch.mockResolvedValue([{ link: 'https://a.example/1' }]);
        processFeedItemsMock.mockResolvedValue([
            { link: 'https://a.example/1', title: 'New', fullText: 'text 1', pubDate: '2026-08-01' },
        ]);
        rawArticleRepository.findByUrl.mockResolvedValue(null);
        rawArticleRepository.create.mockRejectedValue(new Error('connection reset'));

        const saved = await service.collect();

        expect(saved).toBe(0);
        expect(feedItemRepository.create).not.toHaveBeenCalled();
    });

    it('regenerates the digest after a collect run finishes', async () => {
        rssProvider.fetch.mockResolvedValue([]);
        processFeedItemsMock.mockResolvedValue([]);

        await service.collect();

        expect(digestService.generateDigest).toHaveBeenCalledTimes(1);
    });

    it('does not let a digest generation failure fail the collect run', async () => {
        rssProvider.fetch.mockResolvedValue([]);
        processFeedItemsMock.mockResolvedValue([]);
        digestService.generateDigest.mockRejectedValue(new Error('digest write failed'));

        await expect(service.collect()).resolves.toBe(0);
    });

    describe('fetchFeed', () => {
        it('delegates to the injected RSS provider', async () => {
            const items = [{ link: 'https://a.example/1' }];
            rssProvider.fetch.mockResolvedValue(items);

            const result = await service.fetchFeed('https://a.example/rss');

            expect(rssProvider.fetch).toHaveBeenCalledWith('https://a.example/rss');
            expect(result).toBe(items);
        });
    });
});
