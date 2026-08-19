import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { Types } from 'mongoose';

import DigestService from '../../../modules/digest/services/index.js';
import type { DigestData, IDigestRepository } from '../../../modules/digest/interfaces/index.js';
import type { IFeedItemDateReader } from '../../../db/repositories/feed/interface/feedItemRepository.js';
import type { IPopulatedFeedItem } from '../../../db/models/feed/interface/feedItem.js';

describe('DigestService', () => {
    let feedItemRepository: { getByDate: Mock<IFeedItemDateReader['getByDate']> };
    let digestRepository: {
        upsertByDate: Mock<IDigestRepository['upsertByDate']>;
        getLatest: Mock<IDigestRepository['getLatest']>;
    };
    let service: DigestService;

    beforeEach(() => {
        feedItemRepository = { getByDate: vi.fn<IFeedItemDateReader['getByDate']>() };
        digestRepository = {
            upsertByDate: vi.fn<IDigestRepository['upsertByDate']>().mockResolvedValue(undefined),
            getLatest: vi.fn<IDigestRepository['getLatest']>(),
        };
        service = new DigestService({ feedItemRepository, digestRepository });
    });

    function populatedItem(overrides: Partial<IPopulatedFeedItem> = {}): IPopulatedFeedItem {
        const rawArticleId = new Types.ObjectId();

        return {
            _id: new Types.ObjectId(),
            title: 'Post',
            content: 'text',
            date: new Date('2026-08-18'),
            category: 'Прочее',
            rawArticleId: {
                _id: rawArticleId,
                title: 'Post',
                url: 'https://example.com/post',
                content: 'text',
                publishedAt: new Date('2026-08-18'),
                source: 'example.com',
            },
            ...overrides,
        };
    }

    describe('buildDigestData', () => {
        it('maps populated feed items for the given date into digest articles', async () => {
            const date = new Date('2026-08-18');
            feedItemRepository.getByDate.mockResolvedValue([populatedItem()]);

            const data = await service.buildDigestData(date);

            expect(feedItemRepository.getByDate).toHaveBeenCalledWith(date);
            expect(data).toEqual({
                date,
                articles: [
                    {
                        id: expect.any(String),
                        title: 'Post',
                        content: 'text',
                        date: new Date('2026-08-18'),
                        category: 'Прочее',
                        url: 'https://example.com/post',
                        source: 'example.com',
                    },
                ],
            });
        });
    });

    describe('generateDigest', () => {
        it('persists the built digest via the repository', async () => {
            const date = new Date('2026-08-18');
            feedItemRepository.getByDate.mockResolvedValue([populatedItem()]);

            await service.generateDigest(date);

            expect(digestRepository.upsertByDate).toHaveBeenCalledWith(
                date,
                expect.arrayContaining([expect.objectContaining({ title: 'Post' })])
            );
        });

        it('persists an empty article list when there is nothing for the day', async () => {
            const date = new Date('2026-08-19');
            feedItemRepository.getByDate.mockResolvedValue([]);

            await service.generateDigest(date);

            expect(digestRepository.upsertByDate).toHaveBeenCalledWith(date, []);
        });

        it('defaults to today when no date is passed', async () => {
            feedItemRepository.getByDate.mockResolvedValue([]);

            await service.generateDigest();

            expect(feedItemRepository.getByDate).toHaveBeenCalledWith(expect.any(Date));
        });
    });

    describe('getLatestDigest', () => {
        it('returns the latest digest from the repository', async () => {
            const digest: DigestData = { date: new Date('2026-08-18'), articles: [] };
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
