import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    extractLinkCode,
} from '../../../modules/telegramBot/services/index.js';
import Logger from '../../../modules/logger/index.js';
import { InvalidLinkCodeError } from '../../../modules/telegramLink/errors.js';
import type { ITelegramChannelRepository } from '../../../db/repositories/telegram/interface/telegramChannelRepository.js';
import type { IUserRepository } from '../../../db/repositories/user/interface/userRepository.js';
import type { ITelegramLinkService } from '../../../modules/telegramLink/interfaces/index.js';

const TELEGRAM_USER_ID = 555444333;

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

function makeChannelRepository() {
    return {
        upsertByUserAndChannelId: vi.fn<ITelegramChannelRepository['upsertByUserAndChannelId']>(),
        findAllWithUsername: vi.fn<ITelegramChannelRepository['findAllWithUsername']>(),
        findAllForUser: vi.fn<ITelegramChannelRepository['findAllForUser']>(),
        findPageForUser: vi.fn<ITelegramChannelRepository['findPageForUser']>(),
        countForUser: vi.fn<ITelegramChannelRepository['countForUser']>(),
    };
}

function makeUserRepository() {
    return {
        findById: vi.fn<IUserRepository['findById']>(),
        upsertFromGoogle: vi.fn<IUserRepository['upsertFromGoogle']>(),
        findByTelegramUserId: vi.fn<IUserRepository['findByTelegramUserId']>(),
        setTelegramUserId: vi.fn<IUserRepository['setTelegramUserId']>(),
    };
}

function makeTelegramLinkService() {
    return {
        generateCode: vi.fn<ITelegramLinkService['generateCode']>(),
        consumeCode: vi.fn<ITelegramLinkService['consumeCode']>(),
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

describe('extractLinkCode', () => {
    it.each([['482913', '482913'], [' 482913 ', '482913']])(
        'extracts a 6-digit code from %s',
        (input, expected) => {
            expect(extractLinkCode(input)).toBe(expected);
        }
    );

    it.each([['48291'], ['4829133'], ['abcdef'], ['@design_channel'], ['']])(
        'returns null for non-matching text: %s',
        (input) => {
            expect(extractLinkCode(input)).toBeNull();
        }
    );
});

describe('TelegramBotService.registerForwardedChannel', () => {
    let telegramChannelRepository: ReturnType<typeof makeChannelRepository>;
    let service: TelegramBotService;
    const userId = new Types.ObjectId().toString();

    beforeEach(() => {
        telegramChannelRepository = makeChannelRepository();
        service = new TelegramBotService({
            telegramChannelRepository,
            userRepository: makeUserRepository(),
            telegramLinkService: makeTelegramLinkService(),
        });
    });

    it('upserts the channel from a channel-post forward origin, owned by the given user', async () => {
        const saved = {
            _id: new Types.ObjectId(),
            userId: new Types.ObjectId(userId),
            channelId: -1001234567890,
            username: 'design_channel',
            title: 'Дизайн-канал',
            addedAt: new Date(),
        };
        telegramChannelRepository.upsertByUserAndChannelId.mockResolvedValue(saved);

        const result = await service.registerForwardedChannel(channelOrigin(), userId);

        expect(telegramChannelRepository.upsertByUserAndChannelId).toHaveBeenCalledWith({
            userId: new Types.ObjectId(userId),
            channelId: -1001234567890,
            username: 'design_channel',
            title: 'Дизайн-канал',
            addedAt: expect.any(Date),
        });
        expect(result).toBe(saved);
    });

    it('stores null username for channels without a public handle', async () => {
        telegramChannelRepository.upsertByUserAndChannelId.mockResolvedValue({
            _id: new Types.ObjectId(),
            userId: new Types.ObjectId(userId),
            channelId: -1009999999999,
            username: null,
            title: 'Приватный канал',
            addedAt: new Date(),
        });

        await service.registerForwardedChannel(
            channelOrigin({ id: -1009999999999, title: 'Приватный канал', username: undefined }),
            userId
        );

        expect(telegramChannelRepository.upsertByUserAndChannelId).toHaveBeenCalledWith(
            expect.objectContaining({ username: null })
        );
    });
});

describe('TelegramBotService.start', () => {
    it('does not start polling when no bot token is configured', () => {
        const service = new TelegramBotService({
            telegramChannelRepository: makeChannelRepository(),
            userRepository: makeUserRepository(),
            telegramLinkService: makeTelegramLinkService(),
        });

        expect(() => service.start()).not.toThrow();
        expect(botStartMock).not.toHaveBeenCalled();
    });

    it('logs and does not crash the process when the polling loop rejects', async () => {
        mockConfig.telegramBotToken = 'test-token';
        const loggerErrorSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});
        botStartMock.mockRejectedValue(
            new Error('409: Conflict: terminated by other getUpdates request')
        );
        const service = new TelegramBotService({
            telegramChannelRepository: makeChannelRepository(),
            userRepository: makeUserRepository(),
            telegramLinkService: makeTelegramLinkService(),
        });

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
        const service = new TelegramBotService({
            telegramChannelRepository: makeChannelRepository(),
            userRepository: makeUserRepository(),
            telegramLinkService: makeTelegramLinkService(),
        });

        service.start();

        expect(botStartMock).toHaveBeenCalledTimes(1);
    });
});

describe('TelegramBotService.registerChannelByUsername', () => {
    let telegramChannelRepository: ReturnType<typeof makeChannelRepository>;
    let service: TelegramBotService;
    const userId = new Types.ObjectId().toString();

    beforeEach(() => {
        mockConfig.telegramBotToken = 'test-token';
        telegramChannelRepository = makeChannelRepository();
        service = new TelegramBotService({
            telegramChannelRepository,
            userRepository: makeUserRepository(),
            telegramLinkService: makeTelegramLinkService(),
        });
    });

    it('resolves the channel via getChat and upserts it for the given user', async () => {
        getChatMock.mockResolvedValue({
            id: -1009876543210,
            type: 'channel',
            title: 'Публичный канал',
            username: 'public_channel',
        } as ChatFullInfo);
        const saved = {
            _id: new Types.ObjectId(),
            userId: new Types.ObjectId(userId),
            channelId: -1009876543210,
            username: 'public_channel',
            title: 'Публичный канал',
            addedAt: new Date(),
        };
        telegramChannelRepository.upsertByUserAndChannelId.mockResolvedValue(saved);

        const result = await service.registerChannelByUsername('public_channel', userId);

        expect(getChatMock).toHaveBeenCalledWith('@public_channel');
        expect(telegramChannelRepository.upsertByUserAndChannelId).toHaveBeenCalledWith({
            userId: new Types.ObjectId(userId),
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

        await expect(service.registerChannelByUsername('some_user', userId)).rejects.toThrow(
            'is not a channel'
        );
        expect(telegramChannelRepository.upsertByUserAndChannelId).not.toHaveBeenCalled();
    });

    it('propagates a getChat failure (e.g. channel not found)', async () => {
        getChatMock.mockRejectedValue(new Error('Bad Request: chat not found'));

        await expect(service.registerChannelByUsername('missing_channel', userId)).rejects.toThrow(
            'chat not found'
        );
    });
});

describe('TelegramBotService handleMessage integration', () => {
    let telegramChannelRepository: ReturnType<typeof makeChannelRepository>;
    let userRepository: ReturnType<typeof makeUserRepository>;
    let telegramLinkService: ReturnType<typeof makeTelegramLinkService>;
    let handleMessage: (ctx: unknown) => Promise<void>;
    const userId = new Types.ObjectId().toString();

    beforeEach(() => {
        mockConfig.telegramBotToken = 'test-token';
        telegramChannelRepository = makeChannelRepository();
        userRepository = makeUserRepository();
        telegramLinkService = makeTelegramLinkService();
        new TelegramBotService({ telegramChannelRepository, userRepository, telegramLinkService });

        handleMessage = botOnMock.mock.calls[0][1];
    });

    it('ignores a message with no ctx.from (no way to identify a Telegram sender)', async () => {
        const ctx = { message: { text: '@design_channel' }, reply: vi.fn() };

        await handleMessage(ctx);

        expect(ctx.reply).not.toHaveBeenCalled();
    });

    describe('when the Telegram sender is linked to a DevPulse account', () => {
        beforeEach(() => {
            userRepository.findByTelegramUserId.mockResolvedValue({
                _id: new Types.ObjectId(userId),
                googleId: 'google-123',
                email: 'dev@example.com',
                name: 'Dev User',
                avatarUrl: null,
                createdAt: new Date('2026-01-01'),
                lastLoginAt: new Date('2026-01-01'),
            });
        });

        it('replies with a success message when a forwarded channel post is registered', async () => {
            const saved = {
                _id: new Types.ObjectId(),
                userId: new Types.ObjectId(userId),
                channelId: -1001234567890,
                username: 'design_channel',
                title: 'Дизайн-канал',
                addedAt: new Date(),
            };
            telegramChannelRepository.upsertByUserAndChannelId.mockResolvedValue(saved);

            const ctx = {
                from: { id: TELEGRAM_USER_ID },
                message: { forward_origin: channelOrigin() },
                reply: vi.fn(),
            };

            await handleMessage(ctx);

            expect(telegramChannelRepository.upsertByUserAndChannelId).toHaveBeenCalledWith(
                expect.objectContaining({ channelId: -1001234567890, userId: new Types.ObjectId(userId) })
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
                userId: new Types.ObjectId(userId),
                channelId: -1009876543210,
                username: 'public_channel',
                title: 'Публичный канал',
                addedAt: new Date(),
            };
            telegramChannelRepository.upsertByUserAndChannelId.mockResolvedValue(saved);

            const ctx = {
                from: { id: TELEGRAM_USER_ID },
                message: { text: '@public_channel' },
                reply: vi.fn(),
            };

            await handleMessage(ctx);

            expect(telegramChannelRepository.upsertByUserAndChannelId).toHaveBeenCalledWith(
                expect.objectContaining({ channelId: -1009876543210 })
            );
            expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('✅'));
        });

        it('replies with a "not found" message and does not leak the raw error when registration fails', async () => {
            getChatMock.mockRejectedValue(new Error('Bad Request: chat not found'));
            const loggerErrorSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});

            const ctx = {
                from: { id: TELEGRAM_USER_ID },
                message: { text: '@missing_channel' },
                reply: vi.fn(),
            };

            await handleMessage(ctx);

            expect(telegramChannelRepository.upsertByUserAndChannelId).not.toHaveBeenCalled();
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

    describe('when the Telegram sender is not linked to any DevPulse account', () => {
        beforeEach(() => {
            userRepository.findByTelegramUserId.mockResolvedValue(null);
        });

        it('nudges the sender to link their account instead of registering a forwarded channel', async () => {
            const ctx = {
                from: { id: TELEGRAM_USER_ID },
                message: { forward_origin: channelOrigin() },
                reply: vi.fn(),
            };

            await handleMessage(ctx);

            expect(telegramChannelRepository.upsertByUserAndChannelId).not.toHaveBeenCalled();
            expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('привяжите аккаунт'));
        });

        it('nudges the sender to link their account instead of registering by username', async () => {
            const ctx = {
                from: { id: TELEGRAM_USER_ID },
                message: { text: '@design_channel' },
                reply: vi.fn(),
            };

            await handleMessage(ctx);

            expect(getChatMock).not.toHaveBeenCalled();
            expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('привяжите аккаунт'));
        });

        it('says nothing for a message that is neither a link code nor a channel add attempt', async () => {
            const ctx = { from: { id: TELEGRAM_USER_ID }, message: { text: 'hello there' }, reply: vi.fn() };

            await handleMessage(ctx);

            expect(ctx.reply).not.toHaveBeenCalled();
        });
    });

    describe('link-code messages', () => {
        it('links the account and replies with success on a valid code', async () => {
            telegramLinkService.consumeCode.mockResolvedValue(userId);
            const ctx = { from: { id: TELEGRAM_USER_ID }, message: { text: '482913' }, reply: vi.fn() };

            await handleMessage(ctx);

            expect(telegramLinkService.consumeCode).toHaveBeenCalledWith('482913');
            expect(userRepository.setTelegramUserId).toHaveBeenCalledWith(userId, TELEGRAM_USER_ID);
            expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('✅'));
        });

        it('replies that the code is invalid/expired without linking anything', async () => {
            telegramLinkService.consumeCode.mockRejectedValue(new InvalidLinkCodeError());
            const ctx = { from: { id: TELEGRAM_USER_ID }, message: { text: '000000' }, reply: vi.fn() };

            await handleMessage(ctx);

            expect(userRepository.setTelegramUserId).not.toHaveBeenCalled();
            expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('недействителен'));
        });
    });
});
