import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { Types } from 'mongoose';
import type { ChatFullInfo, MessageOriginChannel } from 'grammy/types';

const { getChatMock, botOnMock, botStartMock, botStopMock, mockConfig } = vi.hoisted(() => ({
    getChatMock: vi.fn(),
    botOnMock: vi.fn(),
    botStartMock: vi.fn(),
    botStopMock: vi.fn(),
    mockConfig: { telegramBotToken: undefined as string | undefined },
}));

vi.mock('grammy', () => ({
    Bot: vi.fn().mockImplementation(function () {
        return {
            on: botOnMock,
            start: botStartMock,
            stop: botStopMock,
            api: { getChat: getChatMock },
        };
    }),
}));

vi.mock('../../../modules/config/index.js', () => ({
    default: mockConfig,
}));

import TelegramBotService, {
    extractChannelUsername,
} from '../../../modules/telegramBot/services/index.js';
import Logger from '../../../modules/logger/index.js';
import type { ITelegramChannelRepository } from '../../../db/repositories/telegram/interface/telegramChannelRepository.js';

function channelOrigin(
    overrides: Partial<MessageOriginChannel['chat']> = {}
): MessageOriginChannel {
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

beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.telegramBotToken = undefined;
});

describe('extractChannelUsername', () => {
    it.each([
        ['@design_channel', 'design_channel'],
        ['t.me/design_channel', 'design_channel'],
        ['https://t.me/design_channel', 'design_channel'],
        ['design_channel', 'design_channel'],
    ])('extracts a username from %s', (input, expected) => {
        expect(extractChannelUsername(input)).toBe(expected);
    });

    it.each([['hello world'], ['abc'], ['']])('returns null for non-matching text: %s', (input) => {
        expect(extractChannelUsername(input)).toBeNull();
    });
});

describe('TelegramBotService.registerForwardedChannel', () => {
    let telegramChannelRepository: {
        upsertByChannelId: Mock<ITelegramChannelRepository['upsertByChannelId']>;
        findAllWithUsername: Mock<ITelegramChannelRepository['findAllWithUsername']>;
        findAll: Mock<ITelegramChannelRepository['findAll']>;
        findPage: Mock<ITelegramChannelRepository['findPage']>;
        count: Mock<ITelegramChannelRepository['count']>;
    };
    let service: TelegramBotService;

    beforeEach(() => {
        telegramChannelRepository = {
            upsertByChannelId: vi.fn<ITelegramChannelRepository['upsertByChannelId']>(),
            findAllWithUsername: vi.fn<ITelegramChannelRepository['findAllWithUsername']>(),
            findAll: vi.fn<ITelegramChannelRepository['findAll']>(),
            findPage: vi.fn<ITelegramChannelRepository['findPage']>(),
            count: vi.fn<ITelegramChannelRepository['count']>(),
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
            findAll: vi.fn(),
            findPage: vi.fn(),
            count: vi.fn(),
        };
        const service = new TelegramBotService({ telegramChannelRepository });

        expect(() => service.start()).not.toThrow();
        expect(botStartMock).not.toHaveBeenCalled();
    });

    it('logs and does not crash the process when the polling loop rejects', async () => {
        mockConfig.telegramBotToken = 'test-token';
        const loggerErrorSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});
        botStartMock.mockRejectedValue(
            new Error('409: Conflict: terminated by other getUpdates request')
        );
        const telegramChannelRepository = {
            upsertByChannelId: vi.fn(),
            findAllWithUsername: vi.fn(),
            findAll: vi.fn(),
            findPage: vi.fn(),
            count: vi.fn(),
        };
        const service = new TelegramBotService({ telegramChannelRepository });

        expect(() => service.start()).not.toThrow();
        await new Promise((resolve) => setImmediate(resolve));

        expect(loggerErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('[TelegramBotService]'),
            expect.any(Error)
        );

        loggerErrorSpy.mockRestore();
    });

    it('starts long polling when a bot token is configured', () => {
        mockConfig.telegramBotToken = 'test-token';
        const telegramChannelRepository = {
            upsertByChannelId: vi.fn(),
            findAllWithUsername: vi.fn(),
            findAll: vi.fn(),
            findPage: vi.fn(),
            count: vi.fn(),
        };
        const service = new TelegramBotService({ telegramChannelRepository });

        service.start();

        expect(botStartMock).toHaveBeenCalledTimes(1);
    });
});

describe('TelegramBotService.registerChannelByUsername', () => {
    let telegramChannelRepository: {
        upsertByChannelId: Mock<ITelegramChannelRepository['upsertByChannelId']>;
        findAllWithUsername: Mock<ITelegramChannelRepository['findAllWithUsername']>;
        findAll: Mock<ITelegramChannelRepository['findAll']>;
        findPage: Mock<ITelegramChannelRepository['findPage']>;
        count: Mock<ITelegramChannelRepository['count']>;
    };
    let service: TelegramBotService;

    beforeEach(() => {
        mockConfig.telegramBotToken = 'test-token';
        telegramChannelRepository = {
            upsertByChannelId: vi.fn<ITelegramChannelRepository['upsertByChannelId']>(),
            findAllWithUsername: vi.fn<ITelegramChannelRepository['findAllWithUsername']>(),
            findAll: vi.fn<ITelegramChannelRepository['findAll']>(),
            findPage: vi.fn<ITelegramChannelRepository['findPage']>(),
            count: vi.fn<ITelegramChannelRepository['count']>(),
        };
        service = new TelegramBotService({ telegramChannelRepository });
    });

    it('resolves the channel via getChat and upserts it', async () => {
        getChatMock.mockResolvedValue({
            id: -1009876543210,
            type: 'channel',
            title: 'Публичный канал',
            username: 'public_channel',
        } as ChatFullInfo);
        const saved = {
            _id: new Types.ObjectId(),
            channelId: -1009876543210,
            username: 'public_channel',
            title: 'Публичный канал',
            addedAt: new Date(),
        };
        telegramChannelRepository.upsertByChannelId.mockResolvedValue(saved);

        const result = await service.registerChannelByUsername('public_channel');

        expect(getChatMock).toHaveBeenCalledWith('@public_channel');
        expect(telegramChannelRepository.upsertByChannelId).toHaveBeenCalledWith({
            channelId: -1009876543210,
            username: 'public_channel',
            title: 'Публичный канал',
            addedAt: expect.any(Date),
        });
        expect(result).toBe(saved);
    });

    it('rejects when the resolved chat is not a channel', async () => {
        getChatMock.mockResolvedValue({
            id: 123,
            type: 'private',
            first_name: 'Not a channel',
        } as ChatFullInfo);

        await expect(service.registerChannelByUsername('some_user')).rejects.toThrow(
            'is not a channel'
        );
        expect(telegramChannelRepository.upsertByChannelId).not.toHaveBeenCalled();
    });

    it('propagates a getChat failure (e.g. channel not found)', async () => {
        getChatMock.mockRejectedValue(new Error('Bad Request: chat not found'));

        await expect(service.registerChannelByUsername('missing_channel')).rejects.toThrow(
            'chat not found'
        );
    });
});

describe('TelegramBotService handleMessage integration', () => {
    let telegramChannelRepository: {
        upsertByChannelId: Mock<ITelegramChannelRepository['upsertByChannelId']>;
        findAllWithUsername: Mock<ITelegramChannelRepository['findAllWithUsername']>;
        findAll: Mock<ITelegramChannelRepository['findAll']>;
        findPage: Mock<ITelegramChannelRepository['findPage']>;
        count: Mock<ITelegramChannelRepository['count']>;
    };
    let handleMessage: (ctx: unknown) => Promise<void>;

    beforeEach(() => {
        mockConfig.telegramBotToken = 'test-token';
        telegramChannelRepository = {
            upsertByChannelId: vi.fn<ITelegramChannelRepository['upsertByChannelId']>(),
            findAllWithUsername: vi.fn<ITelegramChannelRepository['findAllWithUsername']>(),
            findAll: vi.fn<ITelegramChannelRepository['findAll']>(),
            findPage: vi.fn<ITelegramChannelRepository['findPage']>(),
            count: vi.fn<ITelegramChannelRepository['count']>(),
        };
        new TelegramBotService({ telegramChannelRepository });

        handleMessage = botOnMock.mock.calls[0][1];
    });

    it('replies with a success message when a forwarded channel post is registered', async () => {
        const saved = {
            _id: new Types.ObjectId(),
            channelId: -1001234567890,
            username: 'design_channel',
            title: 'Дизайн-канал',
            addedAt: new Date(),
        };
        telegramChannelRepository.upsertByChannelId.mockResolvedValue(saved);

        const ctx = {
            message: { forward_origin: channelOrigin() },
            reply: vi.fn(),
        };

        await handleMessage(ctx);

        expect(telegramChannelRepository.upsertByChannelId).toHaveBeenCalledWith(
            expect.objectContaining({ channelId: -1001234567890 })
        );
        expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('✅'));
    });

    it('replies with a success message when a username is registered via getChat', async () => {
        getChatMock.mockResolvedValue({
            id: -1009876543210,
            type: 'channel',
            title: 'Публичный канал',
            username: 'public_channel',
        } as ChatFullInfo);
        const saved = {
            _id: new Types.ObjectId(),
            channelId: -1009876543210,
            username: 'public_channel',
            title: 'Публичный канал',
            addedAt: new Date(),
        };
        telegramChannelRepository.upsertByChannelId.mockResolvedValue(saved);

        const ctx = {
            message: { text: '@public_channel' },
            reply: vi.fn(),
        };

        await handleMessage(ctx);

        expect(telegramChannelRepository.upsertByChannelId).toHaveBeenCalledWith(
            expect.objectContaining({ channelId: -1009876543210 })
        );
        expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('✅'));
    });

    it('replies with a "not found" message and does not leak the raw error when registration fails', async () => {
        getChatMock.mockRejectedValue(new Error('Bad Request: chat not found'));
        const loggerErrorSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});

        const ctx = {
            message: { text: '@missing_channel' },
            reply: vi.fn(),
        };

        await handleMessage(ctx);

        expect(telegramChannelRepository.upsertByChannelId).not.toHaveBeenCalled();
        expect(ctx.reply).toHaveBeenCalledWith(
            'Канал не найден. Проверьте username и попробуйте снова.'
        );
        expect(loggerErrorSpy).toHaveBeenCalledWith(
            '[TelegramBotService] registerChannelByUsername failed',
            expect.any(Error)
        );

        loggerErrorSpy.mockRestore();
    });
});
