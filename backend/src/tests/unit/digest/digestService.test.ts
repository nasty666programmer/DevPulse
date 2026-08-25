import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { Types } from 'mongoose';

import DigestService from '../../../modules/digest/services/index.js';
import type { DigestData, IDigestRepository } from '../../../modules/digest/interfaces/index.js';
import type { IFeedItemCategoryReader } from '../../../db/repositories/feed/interface/feedItemRepository.js';
import type { IPopulatedFeedItem } from '../../../db/models/feed/interface/feedItem.js';
import type { Category } from '../../../modules/categorization/interfaces/index.js';

function populatedItem(title: string, category: Category, date: Date): IPopulatedFeedItem {
    const rawArticleId = new Types.ObjectId();

    return {
        _id: new Types.ObjectId(),
        title,
        content: 'text',
        date,
        category,
        summary: null,
        rawArticleId: {
            _id: rawArticleId,
            title,
            url: `https://example.com/${title}`,
            content: 'text',
            publishedAt: date,
            source: 'example.com',
        },
    };
}

describe('DigestService', () => {
    let feedItemRepository: { getRecentByCategory: Mock<IFeedItemCategoryReader['getRecentByCategory']> };
    let digestRepository: {
        save: Mock<IDigestRepository['save']>;
        getLatest: Mock<IDigestRepository['getLatest']>;
    };
    let service: DigestService;

    beforeEach(() => {
        feedItemRepository = {
            getRecentByCategory: vi.fn<IFeedItemCategoryReader['getRecentByCategory']>().mockResolvedValue([]),
        };
        digestRepository = {
            save: vi.fn<IDigestRepository['save']>(),
            getLatest: vi.fn<IDigestRepository['getLatest']>(),
        };
        service = new DigestService({ feedItemRepository, digestRepository });
    });

    describe('generateDigest', () => {
        it('asks the repository for recent items per category', async () => {
            digestRepository.save.mockResolvedValue({ generatedAt: new Date(), articles: [] });

            await service.generateDigest();

            const requestedCategories = feedItemRepository.getRecentByCategory.mock.calls.map((call) => call[0]);
            expect(requestedCategories).toEqual(
                expect.arrayContaining(['Node.js', 'Docker', 'AWS', 'DevOps', 'AI', 'Прочее'])
            );
        });

        it('round-robins one article per category per round instead of exhausting a single category first', async () => {
            const date = new Date('2026-08-19');
            feedItemRepository.getRecentByCategory.mockImplementation(async (category) => {
                if (category === 'Node.js') {
                    return [
                        populatedItem('node-1', 'Node.js', date),
                        populatedItem('node-2', 'Node.js', date),
                    ];
                }
                if (category === 'Docker') {
                    return [populatedItem('docker-1', 'Docker', date)];
                }
                return [];
            });
            digestRepository.save.mockImplementation(async (articles) => ({ generatedAt: date, articles }));

            await service.generateDigest();

            const savedArticles = digestRepository.save.mock.calls[0][0];
            const titles = savedArticles.map((a) => a.title);

            // First round takes one from each category before a second round ever
            // touches Node.js again — node-2 must come after docker-1.
            expect(titles.indexOf('docker-1')).toBeLessThan(titles.indexOf('node-2'));
            expect(titles).toContain('node-1');
        });

        it('caps the digest at 10 articles', async () => {
            const date = new Date('2026-08-19');
            feedItemRepository.getRecentByCategory.mockResolvedValue([
                populatedItem('a', 'Node.js', date),
                populatedItem('b', 'Node.js', date),
            ]);
            digestRepository.save.mockImplementation(async (articles) => ({ generatedAt: date, articles }));

            await service.generateDigest();

            const savedArticles = digestRepository.save.mock.calls[0][0];
            expect(savedArticles.length).toBeLessThanOrEqual(10);
        });

        it('returns whatever the repository saved', async () => {
            const saved: DigestData = { generatedAt: new Date('2026-08-19'), articles: [] };
            digestRepository.save.mockResolvedValue(saved);

            const result = await service.generateDigest();

            expect(result).toBe(saved);
        });
    });

    describe('getLatestDigest', () => {
        it('returns the latest digest from the repository', async () => {
            const digest: DigestData = { generatedAt: new Date('2026-08-19'), articles: [] };
            digestRepository.getLatest.mockResolvedValue(digest);

            const result = await service.getLatestDigest();

            expect(result).toBe(digest);
        });

        it('returns null when no digest has been generated yet', async () => {
            digestRepository.getLatest.mockResolvedValue(null);

            const result = await service.getLatestDigest();

            expect(result).toBeNull();
        });
    });
});
