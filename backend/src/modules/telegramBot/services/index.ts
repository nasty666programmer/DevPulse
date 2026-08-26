import { Bot } from 'grammy';
import { Types } from 'mongoose';
import type { Context } from 'grammy';
import type { ChatFullInfo, MessageOriginChannel } from 'grammy/types';
import config from '../../config/index.js';
import Logger from '../../logger/index.js';
import { InvalidLinkCodeError } from '../../telegramLink/errors.js';
import type { ITelegramChannelRepository } from '../../../db/repositories/telegram/interface/telegramChannelRepository.js';
import type { ITelegramChannelDocument } from '../../../db/models/telegram/interface/telegramChannel.js';
import type { IUserRepository } from '../../../db/repositories/user/interface/userRepository.js';
import type { ITelegramLinkService } from '../../telegramLink/interfaces/index.js';

// Telegram public usernames are 5-32 chars of letters, digits and underscore.
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{5,32}$/;

// The link codes TelegramLinkService issues are always exactly 6 digits.
const LINK_CODE_PATTERN = /^\d{6}$/;

// Accepts "@name", "t.me/name", "https://t.me/name", or bare "name".
export function extractChannelUsername(text: string): string | null {
    const withoutUrl = text.trim().replace(/^(https?:\/\/)?t\.me\//i, '');
    const withoutAt = withoutUrl.replace(/^@/, '');

    return USERNAME_PATTERN.test(withoutAt) ? withoutAt : null;
}

export function extractLinkCode(text: string): string | null {
    const trimmed = text.trim();

    return LINK_CODE_PATTERN.test(trimmed) ? trimmed : null;
}

export default class TelegramBotService {
    private readonly telegramChannelRepository: ITelegramChannelRepository;
    private readonly userRepository: IUserRepository;
    private readonly telegramLinkService: ITelegramLinkService;
    private readonly bot: Bot | null;

    constructor({
        telegramChannelRepository,
        userRepository,
        telegramLinkService,
    }: {
        telegramChannelRepository: ITelegramChannelRepository;
        userRepository: IUserRepository;
        telegramLinkService: ITelegramLinkService;
    }) {
        this.telegramChannelRepository = telegramChannelRepository;
        this.userRepository = userRepository;
        this.telegramLinkService = telegramLinkService;
        this.bot = config.telegramBotToken ? new Bot(config.telegramBotToken) : null;

        this.bot?.on('message', (ctx) => this.handleMessage(ctx));
    }

    start() {
        if (!this.bot) {
            Logger.warn('[TelegramBotService] TELEGRAM_BOT_TOKEN not set — bot not started.');
            return;
        }

        // Long polling — not a webhook. Works identically in local dev and in
        // the cluster without needing an inbound Ingress route or public DNS,
        // unlike a webhook which would need both.
        //
        // bot.start() resolves only when the polling loop stops, so an
        // unhandled rejection here (e.g. a 409 from a second poller on the
        // same token — Telegram allows only one) would otherwise crash the
        // whole process, taking the HTTP server and schedulers down with it.
        this.bot.start().catch((error) => {
            Logger.error('[TelegramBotService] Polling loop stopped unexpectedly', error);
        });
        Logger.info('🤖 Telegram bot started (long polling)');
    }

    stop() {
        void this.bot?.stop();
    }

    private async handleMessage(ctx: Context): Promise<void> {
        const telegramUserId = ctx.from?.id;
        const text = ctx.message?.text;

        const linkCode = text ? extractLinkCode(text) : null;

        if (linkCode && telegramUserId) {
            await this.handleLinkCode(ctx, linkCode, telegramUserId);
            return;
        }

        if (!telegramUserId) {
            return;
        }

        const origin = ctx.message?.forward_origin;
        const username = text ? extractChannelUsername(text) : null;

        if (!origin && !username) {
            return;
        }

        const user = await this.userRepository.findByTelegramUserId(telegramUserId);

        if (!user) {
            await ctx.reply(
                'Сначала привяжите аккаунт: получите код в кабинете DevPulse (вкладка «Источники») и отправьте его сюда.'
            );
            return;
        }

        const userId = user._id.toString();

        if (origin && origin.type === 'channel') {
            const channel = await this.registerForwardedChannel(origin, userId);
            await ctx.reply(`Канал «${channel.title}» добавлен как источник ✅`);
            return;
        }

        let channel: ITelegramChannelDocument;

        try {
            channel = await this.registerChannelByUsername(username as string, userId);
        } catch (error) {
            Logger.error('[TelegramBotService] registerChannelByUsername failed', error);
            await ctx.reply('Канал не найден. Проверьте username и попробуйте снова.');
            return;
        }

        await ctx.reply(`Канал «${channel.title}» добавлен как источник ✅`);
    }

    private async handleLinkCode(ctx: Context, code: string, telegramUserId: number): Promise<void> {
        let userId: string;

        try {
            userId = await this.telegramLinkService.consumeCode(code);
        } catch (error) {
            if (error instanceof InvalidLinkCodeError) {
                await ctx.reply('Код недействителен или истёк. Получите новый код в кабинете.');
                return;
            }
            throw error;
        }

        await this.userRepository.setTelegramUserId(userId, telegramUserId);
        await ctx.reply('Готово — аккаунт привязан ✅ Каналы, которые вы добавите через бота, теперь будут вашими.');
    }

    async registerForwardedChannel(
        origin: MessageOriginChannel,
        userId: string
    ): Promise<ITelegramChannelDocument> {
        return this.telegramChannelRepository.upsertByUserAndChannelId({
            userId: new Types.ObjectId(userId),
            channelId: origin.chat.id,
            username: origin.chat.username ?? null,
            title: origin.chat.title,
            addedAt: new Date(),
        });
    }

    async registerChannelByUsername(username: string, userId: string): Promise<ITelegramChannelDocument> {
        if (!this.bot) {
            throw new Error('Telegram bot is not configured');
        }

        const chat: ChatFullInfo = await this.bot.api.getChat(`@${username}`);

        if (chat.type !== 'channel') {
            throw new Error(`"@${username}" is not a channel`);
        }

        return this.telegramChannelRepository.upsertByUserAndChannelId({
            userId: new Types.ObjectId(userId),
            channelId: chat.id,
            username: chat.username ?? null,
            title: chat.title,
            addedAt: new Date(),
        });
    }
}
