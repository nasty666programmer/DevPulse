import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { Types } from 'mongoose';
import type { MessageOriginChannel } from 'grammy/types';
import TelegramBotService from '../../../modules/telegramBot/services/index.js';
import type { ITelegramChannelRepository } from '../../../db/repositories/telegram/interface/telegramChannelRepository.js';

function channelOrigin(overrides: Partial<MessageOriginChannel['chat']> = {}): MessageOriginChannel {
    return {
        type: 'channel',
        date: 1_700_000_000,
        message_id: 42,
        chat: {
            id: -1001234567890,
            type: 'channel',
            title: 'Дизайн-канал',
            username: 'design_channel',
            ...overrides,
        },
    };
}

describe('TelegramBotService.registerForwardedChannel', () => {
    let telegramChannelRepository: {
        upsertByChannelId: Mock<ITelegramChannelRepository['upsertByChannelId']>;
        findAllWithUsername: Mock<ITelegramChannelRepository['findAllWithUsername']>;
    };
    let service: TelegramBotService;

    beforeEach(() => {
        telegramChannelRepository = {
            upsertByChannelId: vi.fn<ITelegramChannelRepository['upsertByChannelId']>(),
            findAllWithUsername: vi.fn<ITelegramChannelRepository['findAllWithUsername']>(),
        };
        service = new TelegramBotService({ telegramChannelRepository });
    });

    it('upserts the channel from a channel-post forward origin', async () => {
        const saved = {
            _id: new Types.ObjectId(),
            channelId: -1001234567890,
            username: 'design_channel',
            title: 'Дизайн-канал',
            addedAt: new Date(),
        };
        telegramChannelRepository.upsertByChannelId.mockResolvedValue(saved);

        const result = await service.registerForwardedChannel(channelOrigin());

        expect(telegramChannelRepository.upsertByChannelId).toHaveBeenCalledWith({
            channelId: -1001234567890,
            username: 'design_channel',
            title: 'Дизайн-канал',
            addedAt: expect.any(Date),
        });
        expect(result).toBe(saved);
    });

    it('stores null username for channels without a public handle', async () => {
        telegramChannelRepository.upsertByChannelId.mockResolvedValue({
            _id: new Types.ObjectId(),
            channelId: -1009999999999,
            username: null,
            title: 'Приватный канал',
            addedAt: new Date(),
        });

        await service.registerForwardedChannel(
            channelOrigin({ id: -1009999999999, title: 'Приватный канал', username: undefined })
        );

        expect(telegramChannelRepository.upsertByChannelId).toHaveBeenCalledWith(
            expect.objectContaining({ username: null })
        );
    });
});

describe('TelegramBotService.start', () => {
    it('does not start polling when no bot token is configured', () => {
        const telegramChannelRepository = {
            upsertByChannelId: vi.fn(),
            findAllWithUsername: vi.fn(),
        };
        const service = new TelegramBotService({ telegramChannelRepository });

        expect(() => service.start()).not.toThrow();
    });
});
