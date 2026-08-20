import type { Request, Response } from 'express';
import type TelegramCollectorService from '../../modules/telegramCollector/services/index.js';
import config from '../../modules/config/index.js';
import type { ITelegramChannelRepository } from '../../db/repositories/telegram/interface/telegramChannelRepository.js';
import type { ITelegramPostRepository } from '../../db/repositories/telegram/interface/telegramPostRepository.js';

export default class TelegramController {
    private readonly telegramCollectorService: TelegramCollectorService;
    private readonly telegramChannelRepository: ITelegramChannelRepository;
    private readonly telegramPostRepository: ITelegramPostRepository;

    constructor({
        telegramCollectorService,
        telegramChannelRepository,
        telegramPostRepository,
    }: {
        telegramCollectorService: TelegramCollectorService;
        telegramChannelRepository: ITelegramChannelRepository;
        telegramPostRepository: ITelegramPostRepository;
    }) {
        this.telegramCollectorService = telegramCollectorService;
        this.telegramChannelRepository = telegramChannelRepository;
        this.telegramPostRepository = telegramPostRepository;
    }

    async collectTelegram(req: Request, res: Response) {
        const saved = await this.telegramCollectorService.collect();

        res.json({ saved });
    }

    async listChannels(req: Request, res: Response) {
        const channels = await this.telegramChannelRepository.findAll();

        res.json(
            channels.map((channel) => ({
                id: channel._id.toString(),
                channelId: channel.channelId,
                username: channel.username,
                title: channel.title,
                addedAt: channel.addedAt,
            }))
        );
    }

    async listPosts(req: Request, res: Response) {
        const limit = Number(req.query.limit) || config.defaultItemsLimit;

        const posts = await this.telegramPostRepository.findRecent(limit);

        res.json(
            posts.map((post) => ({
                id: post._id.toString(),
                channelId: post.channelId,
                text: post.text,
                publishedAt: post.publishedAt,
                mediaUrls: post.mediaUrls,
            }))
        );
    }
}
