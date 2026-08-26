import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { Types } from 'mongoose';

vi.mock('../../../modules/config/index.js', () => ({
    default: { telegramPostsPerChannelLimit: 5 },
}));

import TelegramCollectorService from '../../../modules/telegramCollector/services/index.js';
import type { ITelegramChannelRepository } from '../../../db/repositories/telegram/interface/telegramChannelRepository.js';
import type { ITelegramPostRepository } from '../../../db/repositories/telegram/interface/telegramPostRepository.js';
import type { IProvider } from '../../../providers/interfaces.js';
import type { TelegramPost } from '../../../providers/telegram/TelegramProvider.js';

const USER_ID = new Types.ObjectId();

function channel(
    overrides: Partial<{ channelId: number; username: string | null; title: string }> = {}
) {
    return {
        _id: new Types.ObjectId(),
        userId: USER_ID,
        channelId: -1001111111111,
        username: 'channel_a',
        title: 'Channel A',
        addedAt: new Date(),
        ...overrides,
    };
}

describe('TelegramCollectorService.collect', () => {
    let telegramProvider: { fetch: Mock<IProvider<TelegramPost>['fetch']> };
    let telegramChannelRepository: {
        findAllWithUsername: Mock<ITelegramChannelRepository['findAllWithUsername']>;
        upsertByUserAndChannelId: Mock<ITelegramChannelRepository['upsertByUserAndChannelId']>;
        findAllForUser: Mock<ITelegramChannelRepository['findAllForUser']>;
        findPageForUser: Mock<ITelegramChannelRepository['findPageForUser']>;
        countForUser: Mock<ITelegramChannelRepository['countForUser']>;
    };
    let telegramPostRepository: {
        create: Mock<ITelegramPostRepository['create']>;
        findRecent: Mock<ITelegramPostRepository['findRecent']>;
        findRecentByChannelIds: Mock<ITelegramPostRepository['findRecentByChannelIds']>;
        findById: Mock<ITelegramPostRepository['findById']>;
        setSummary: Mock<ITelegramPostRepository['setSummary']>;
    };
    let service: TelegramCollectorService;

    beforeEach(() => {
        vi.clearAllMocks();

        telegramProvider = { fetch: vi.fn<IProvider<TelegramPost>['fetch']>() };
        telegramChannelRepository = {
            findAllWithUsername: vi.fn<ITelegramChannelRepository['findAllWithUsername']>(),
            upsertByUserAndChannelId: vi.fn<ITelegramChannelRepository['upsertByUserAndChannelId']>(),
            findAllForUser: vi.fn<ITelegramChannelRepository['findAllForUser']>(),
            findPageForUser: vi.fn<ITelegramChannelRepository['findPageForUser']>(),
            countForUser: vi.fn<ITelegramChannelRepository['countForUser']>(),
        };
        telegramPostRepository = {
            create: vi.fn<ITelegramPostRepository['create']>(),
            findRecent: vi.fn<ITelegramPostRepository['findRecent']>(),
            findRecentByChannelIds: vi.fn<ITelegramPostRepository['findRecentByChannelIds']>(),
            findById: vi.fn<ITelegramPostRepository['findById']>(),
            setSummary: vi.fn<ITelegramPostRepository['setSummary']>(),
        };

        service = new TelegramCollectorService({
            telegramProvider,
            telegramChannelRepository,
            telegramPostRepository,
        });
    });

    it('fetches and saves posts for every channel that has a public username, attributed to its owner', async () => {
        telegramChannelRepository.findAllWithUsername.mockResolvedValue([channel()]);
        telegramProvider.fetch.mockResolvedValue([
            { messageId: 1, text: 'Hello', publishedAt: new Date('2026-08-19'), mediaUrls: [] },
        ]);
        telegramPostRepository.create.mockResolvedValue({
            _id: new Types.ObjectId(),
            userId: USER_ID,
            channelId: -1001111111111,
            messageId: 1,
            text: 'Hello',
            publishedAt: new Date('2026-08-19'),
            mediaUrls: [],
            summary: null,
        });

        const saved = await service.collect();

        expect(telegramProvider.fetch).toHaveBeenCalledWith('channel_a');
        expect(telegramPostRepository.create).toHaveBeenCalledWith({
            userId: USER_ID,
            channelId: -1001111111111,
            messageId: 1,
            text: 'Hello',
            publishedAt: new Date('2026-08-19'),
            mediaUrls: [],
        });
        expect(saved).toBe(1);
    });

    it('does not let one failing channel abort collection of the others', async () => {
        telegramChannelRepository.findAllWithUsername.mockResolvedValue([
            channel({ channelId: -1, username: 'channel_a' }),
            channel({ channelId: -2, username: 'channel_b' }),
        ]);
        telegramProvider.fetch
            .mockRejectedValueOnce(new Error('scrape failed'))
            .mockResolvedValueOnce([
                {
                    messageId: 5,
                    text: 'B post',
                    publishedAt: new Date('2026-08-19'),
                    mediaUrls: [],
                },
            ]);
        telegramPostRepository.create.mockResolvedValue({
            _id: new Types.ObjectId(),
            userId: USER_ID,
            channelId: -2,
            messageId: 5,
            text: 'B post',
            publishedAt: new Date('2026-08-19'),
            mediaUrls: [],
            summary: null,
        });

        const saved = await service.collect();

        expect(saved).toBe(1);
    });

    it('skips a post gracefully when it was already collected (duplicate key)', async () => {
        telegramChannelRepository.findAllWithUsername.mockResolvedValue([channel()]);
        telegramProvider.fetch.mockResolvedValue([
            { messageId: 1, text: 'Hello', publishedAt: new Date('2026-08-19'), mediaUrls: [] },
        ]);
        telegramPostRepository.create.mockRejectedValue(
            Object.assign(new Error('E11000 duplicate key error'), { code: 11000 })
        );

        const saved = await service.collect();

        expect(saved).toBe(0);
    });

    it('only considers the N most recent posts per channel, per config.telegramPostsPerChannelLimit', async () => {
        telegramChannelRepository.findAllWithUsername.mockResolvedValue([channel()]);
        // Provider returns oldest-to-newest, matching t.me/s/<username>'s page order.
        const sevenPosts = Array.from({ length: 7 }, (_, i) => ({
            messageId: i + 1,
            text: `Post ${i + 1}`,
            publishedAt: new Date('2026-08-19'),
            mediaUrls: [],
        }));
        telegramProvider.fetch.mockResolvedValue(sevenPosts);
        telegramPostRepository.create.mockImplementation(async (post) => ({
            _id: new Types.ObjectId(),
            summary: null,
            ...post,
        }));

        const saved = await service.collect();

        expect(saved).toBe(5);
        expect(telegramPostRepository.create).toHaveBeenCalledTimes(5);
        // The 5 most recent = messageId 3..7 (the last 5 of the 7), not 1..5.
        expect(telegramPostRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ messageId: 3 })
        );
        expect(telegramPostRepository.create).not.toHaveBeenCalledWith(
            expect.objectContaining({ messageId: 1 })
        );
        expect(telegramPostRepository.create).not.toHaveBeenCalledWith(
            expect.objectContaining({ messageId: 2 })
        );
    });

    it('propagates a non-duplicate-key error from the post repository as a channel failure', async () => {
        telegramChannelRepository.findAllWithUsername.mockResolvedValue([channel()]);
        telegramProvider.fetch.mockResolvedValue([
            { messageId: 1, text: 'Hello', publishedAt: new Date('2026-08-19'), mediaUrls: [] },
        ]);
        telegramPostRepository.create.mockRejectedValue(new Error('connection reset'));

        const saved = await service.collect();

        expect(saved).toBe(0);
    });
});
