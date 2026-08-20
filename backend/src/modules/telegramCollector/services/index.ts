import { isDuplicateKeyError } from '../../../common/utils.js';
import Logger from '../../logger/index.js';
import config from '../../config/index.js';
import type { IProvider } from '../../../providers/interfaces.js';
import type { TelegramPost } from '../../../providers/telegram/TelegramProvider.js';
import type { ITelegramChannelRepository } from '../../../db/repositories/telegram/interface/telegramChannelRepository.js';
import type { ITelegramChannelDocument } from '../../../db/models/telegram/interface/telegramChannel.js';
import type { ITelegramPostRepository } from '../../../db/repositories/telegram/interface/telegramPostRepository.js';
import type { ITelegramCollector } from '../interfaces/index.js';

export default class TelegramCollectorService implements ITelegramCollector {
    private readonly telegramProvider: IProvider<TelegramPost>;
    private readonly telegramChannelRepository: ITelegramChannelRepository;
    private readonly telegramPostRepository: ITelegramPostRepository;

    constructor({
        telegramProvider,
        telegramChannelRepository,
        telegramPostRepository,
    }: {
        telegramProvider: IProvider<TelegramPost>;
        telegramChannelRepository: ITelegramChannelRepository;
        telegramPostRepository: ITelegramPostRepository;
    }) {
        this.telegramProvider = telegramProvider;
        this.telegramChannelRepository = telegramChannelRepository;
        this.telegramPostRepository = telegramPostRepository;
    }

    /**
     * Fetches every registered channel that has a public username and
     * persists posts that aren't already stored (deduped by channelId +
     * messageId). One channel failing never aborts the others.
     */
    async collect(): Promise<number> {
        const channels = await this.telegramChannelRepository.findAllWithUsername();

        Logger.info('[TelegramCollectorService] Collect started', { channels: channels.length });

        const results = await Promise.allSettled(
            channels.map((channel) => this.collectFromChannel(channel))
        );

        let saved = 0;
        const failedChannels: string[] = [];

        for (let i = 0; i < results.length; i++) {
            const result = results[i];

            if (result.status === 'fulfilled') {
                saved += result.value;
            } else {
                failedChannels.push(channels[i].username as string);
                Logger.error(
                    `[TelegramCollectorService] Failed to collect from "@${channels[i].username}"`,
                    result.reason
                );
            }
        }

        Logger.info('[TelegramCollectorService] Collect finished', { saved, failedChannels });

        return saved;
    }

    private async collectFromChannel(channel: ITelegramChannelDocument): Promise<number> {
        // channel.username is guaranteed non-null: findAllWithUsername filters for it.
        const posts = await this.telegramProvider.fetch(channel.username as string);

        // Posts arrive oldest-to-newest (t.me/s/<username>'s page order) — keep
        // only the most recent N per run, not the whole visible page.
        const recentPosts = posts.slice(-config.telegramPostsPerChannelLimit);

        let saved = 0;

        for (const post of recentPosts) {
            try {
                await this.telegramPostRepository.create({
                    channelId: channel.channelId,
                    messageId: post.messageId,
                    text: post.text,
                    publishedAt: post.publishedAt,
                    mediaUrls: post.mediaUrls,
                });
                saved += 1;
            } catch (error) {
                if (isDuplicateKeyError(error)) {
                    continue;
                }

                throw error;
            }
        }

        return saved;
    }
}
