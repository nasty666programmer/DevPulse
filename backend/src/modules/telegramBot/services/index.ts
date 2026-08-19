import { Bot } from 'grammy';
import type { Context } from 'grammy';
import type { MessageOriginChannel } from 'grammy/types';
import config from '../../config/index.js';
import type { ITelegramChannelRepository } from '../../../db/repositories/telegram/interface/telegramChannelRepository.js';
import type { ITelegramChannelDocument } from '../../../db/models/telegram/interface/telegramChannel.js';

export default class TelegramBotService {
    private readonly telegramChannelRepository: ITelegramChannelRepository;
    private readonly bot: Bot | null;

    constructor({ telegramChannelRepository }: { telegramChannelRepository: ITelegramChannelRepository }) {
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

        if (!origin || origin.type !== 'channel') {
            return;
        }

        const channel = await this.registerForwardedChannel(origin);

        await ctx.reply(`Канал «${channel.title}» добавлен как источник ✅`);
    }

    async registerForwardedChannel(origin: MessageOriginChannel): Promise<ITelegramChannelDocument> {
        return this.telegramChannelRepository.upsertByChannelId({
            channelId: origin.chat.id,
            username: origin.chat.username ?? null,
            title: origin.chat.title,
            addedAt: new Date(),
        });
    }
}
