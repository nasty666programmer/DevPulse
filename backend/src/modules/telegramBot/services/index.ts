import { Bot } from 'grammy';
import type { Context } from 'grammy';
import type { ChatFullInfo, MessageOriginChannel } from 'grammy/types';
import config from '../../config/index.js';
import type { ITelegramChannelRepository } from '../../../db/repositories/telegram/interface/telegramChannelRepository.js';
import type { ITelegramChannelDocument } from '../../../db/models/telegram/interface/telegramChannel.js';

// Telegram public usernames are 5-32 chars of letters, digits and underscore.
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{5,32}$/;

// Accepts "@name", "t.me/name", "https://t.me/name", or bare "name".
export function extractChannelUsername(text: string): string | null {
    const withoutUrl = text.trim().replace(/^(https?:\/\/)?t\.me\//i, '');
    const withoutAt = withoutUrl.replace(/^@/, '');

    return USERNAME_PATTERN.test(withoutAt) ? withoutAt : null;
}

export default class TelegramBotService {
    private readonly telegramChannelRepository: ITelegramChannelRepository;
    private readonly bot: Bot | null;

    constructor({
        telegramChannelRepository,
    }: {
        telegramChannelRepository: ITelegramChannelRepository;
    }) {
        this.telegramChannelRepository = telegramChannelRepository;
        this.bot = config.telegramBotToken ? new Bot(config.telegramBotToken) : null;

        this.bot?.on('message', (ctx) => this.handleMessage(ctx));
    }

    start() {
        if (!this.bot) {
            console.warn('[TelegramBotService] TELEGRAM_BOT_TOKEN not set — bot not started.');
            return;
        }

        // Long polling — not a webhook. Works identically in local dev and in
        // the cluster without needing an inbound Ingress route or public DNS,
        // unlike a webhook which would need both.
        void this.bot.start();
        console.log('🤖 Telegram bot started (long polling)');
    }

    stop() {
        void this.bot?.stop();
    }

    private async handleMessage(ctx: Context): Promise<void> {
        const origin = ctx.message?.forward_origin;

        if (origin && origin.type === 'channel') {
            const channel = await this.registerForwardedChannel(origin);
            await ctx.reply(`Канал «${channel.title}» добавлен как источник ✅`);
            return;
        }

        const text = ctx.message?.text;
        const username = text ? extractChannelUsername(text) : null;

        if (!username) {
            return;
        }

        try {
            const channel = await this.registerChannelByUsername(username);
            await ctx.reply(`Канал «${channel.title}» добавлен как источник ✅`);
        } catch {
            await ctx.reply('Канал не найден. Проверьте username и попробуйте снова.');
        }
    }

    async registerForwardedChannel(
        origin: MessageOriginChannel
    ): Promise<ITelegramChannelDocument> {
        return this.telegramChannelRepository.upsertByChannelId({
            channelId: origin.chat.id,
            username: origin.chat.username ?? null,
            title: origin.chat.title,
            addedAt: new Date(),
        });
    }

    async registerChannelByUsername(username: string): Promise<ITelegramChannelDocument> {
        if (!this.bot) {
            throw new Error('Telegram bot is not configured');
        }

        const chat: ChatFullInfo = await this.bot.api.getChat(`@${username}`);

        if (chat.type !== 'channel') {
            throw new Error(`"@${username}" is not a channel`);
        }

        return this.telegramChannelRepository.upsertByChannelId({
            channelId: chat.id,
            username: chat.username ?? null,
            title: chat.title,
            addedAt: new Date(),
        });
    }
}
