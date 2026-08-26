import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { Types } from 'mongoose';
import FeedSourceService from '../../../modules/feedSource/services/index.js';
import {
    DuplicateFeedSourceError,
    FeedSourceNotFoundError,
    InvalidFeedSourceUrlError,
} from '../../../modules/feedSource/errors.js';
import type { IFeedSourceRepository } from '../../../db/repositories/feedSource/interface/feedSourceRepository.js';

describe('FeedSourceService.add', () => {
    let feedSourceRepository: {
        create: Mock<IFeedSourceRepository['create']>;
        findByUser: Mock<IFeedSourceRepository['findByUser']>;
        findAll: Mock<IFeedSourceRepository['findAll']>;
        deleteByIdForUser: Mock<IFeedSourceRepository['deleteByIdForUser']>;
    };
    let service: FeedSourceService;
    const userId = new Types.ObjectId().toString();

    beforeEach(() => {
        feedSourceRepository = { create: vi.fn(), findByUser: vi.fn(), findAll: vi.fn(), deleteByIdForUser: vi.fn() };
        service = new FeedSourceService({ feedSourceRepository });
    });

    it('trims the URL and persists it for the user', async () => {
        const stored = { _id: new Types.ObjectId(), userId: new Types.ObjectId(userId), url: 'https://example.com/rss', addedAt: new Date() };
        feedSourceRepository.create.mockResolvedValue(stored);

        const result = await service.add(userId, '  https://example.com/rss  ');

        expect(feedSourceRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ url: 'https://example.com/rss' })
        );
        expect(result).toBe(stored);
    });

    it('throws InvalidFeedSourceUrlError for a non-http(s) value and never touches the repository', async () => {
        await expect(service.add(userId, 'not-a-url')).rejects.toBeInstanceOf(InvalidFeedSourceUrlError);
        expect(feedSourceRepository.create).not.toHaveBeenCalled();
    });

    it('throws InvalidFeedSourceUrlError for a non-http(s) scheme', async () => {
        await expect(service.add(userId, 'ftp://example.com/feed')).rejects.toBeInstanceOf(
            InvalidFeedSourceUrlError
        );
    });

    it('throws DuplicateFeedSourceError when the repository reports a duplicate key', async () => {
        feedSourceRepository.create.mockRejectedValue({ code: 11000 });

        await expect(service.add(userId, 'https://example.com/rss')).rejects.toBeInstanceOf(
            DuplicateFeedSourceError
        );
    });

    it('rethrows unrelated repository errors as-is', async () => {
        const unrelated = new Error('mongo down');
        feedSourceRepository.create.mockRejectedValue(unrelated);

        await expect(service.add(userId, 'https://example.com/rss')).rejects.toBe(unrelated);
    });
});

describe('FeedSourceService.list', () => {
    it('delegates to the repository for the given user', async () => {
        const feedSourceRepository = { create: vi.fn(), findByUser: vi.fn(), findAll: vi.fn(), deleteByIdForUser: vi.fn() };
        const service = new FeedSourceService({ feedSourceRepository });
        const userId = new Types.ObjectId().toString();
        const sources = [{ _id: new Types.ObjectId() }];
        feedSourceRepository.findByUser.mockResolvedValue(sources);

        const result = await service.list(userId);

        expect(feedSourceRepository.findByUser).toHaveBeenCalledWith(userId);
        expect(result).toBe(sources);
    });
});

describe('FeedSourceService.remove', () => {
    let feedSourceRepository: {
        create: Mock<IFeedSourceRepository['create']>;
        findByUser: Mock<IFeedSourceRepository['findByUser']>;
        findAll: Mock<IFeedSourceRepository['findAll']>;
        deleteByIdForUser: Mock<IFeedSourceRepository['deleteByIdForUser']>;
    };
    let service: FeedSourceService;
    const userId = new Types.ObjectId().toString();

    beforeEach(() => {
        feedSourceRepository = { create: vi.fn(), findByUser: vi.fn(), findAll: vi.fn(), deleteByIdForUser: vi.fn() };
        service = new FeedSourceService({ feedSourceRepository });
    });

    it('resolves when the repository deletes a matching row', async () => {
        feedSourceRepository.deleteByIdForUser.mockResolvedValue(true);

        await expect(service.remove(userId, 'some-id')).resolves.toBeUndefined();
        expect(feedSourceRepository.deleteByIdForUser).toHaveBeenCalledWith('some-id', userId);
    });

    it('throws FeedSourceNotFoundError when nothing matched (wrong id or not this user\'s row)', async () => {
        feedSourceRepository.deleteByIdForUser.mockResolvedValue(false);

        await expect(service.remove(userId, 'some-id')).rejects.toBeInstanceOf(FeedSourceNotFoundError);
    });
});
