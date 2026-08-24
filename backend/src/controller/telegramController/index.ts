import type { Request, Response } from 'express';
import type TelegramCollectorService from '../../modules/telegramCollector/services/index.js';
import config from '../../modules/config/index.js';
import type { ITelegramChannelRepository } from '../../db/repositories/telegram/interface/telegramChannelRepository.js';
import type { ITelegramPostRepository } from '../../db/repositories/telegram/interface/telegramPostRepository.js';
import type { ITelegramChannelDocument } from '../../db/models/telegram/interface/telegramChannel.js';
import type { ITelegramPostDocument } from '../../db/models/telegram/interface/telegramPost.js';

function toChannelDto(channel: ITelegramChannelDocument) {
    return {
        id: channel._id.toString(),
        channelId: channel.channelId,
        username: channel.username,
        title: channel.title,
        addedAt: channel.addedAt,
    };
}

function toPostDto(post: ITelegramPostDocument) {
    return {
        id: post._id.toString(),
        channelId: post.channelId,
        text: post.text,
        publishedAt: post.publishedAt,
        mediaUrls: post.mediaUrls,
    };
}

function parseChannelIds(raw: unknown): number[] {
    if (typeof raw !== 'string' || raw.length === 0) {
        return [];
    }

    return raw
        .split(',')
        .map((id) => Number(id.trim()))
        .filter((id) => Number.isInteger(id));
}

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
        // No ?page — the unpaginated flat list, used by the channel-chip
        // overview row, which shows every registered channel at once.
        if (req.query.page === undefined) {
            const channels = await this.telegramChannelRepository.findAll();

            res.json(channels.map(toChannelDto));
            return;
        }

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.max(1, Number(req.query.limit) || config.telegramChannelsPageSize);
        const offset = (page - 1) * limit;

        const [channels, total] = await Promise.all([
            this.telegramChannelRepository.findPage(offset, limit),
            this.telegramChannelRepository.count(),
        ]);

        res.json({
            channels: channels.map(toChannelDto),
            total,
            page,
            pageSize: limit,
        });
    }

    async listPosts(req: Request, res: Response) {
        const channelIds = parseChannelIds(req.query.channelIds);

        if (channelIds.length > 0) {
            const posts = await this.telegramPostRepository.findRecentByChannelIds(
                channelIds,
                config.telegramPostsPerChannelLimit
            );

            res.json(posts.map(toPostDto));
            return;
        }

        const limit = Number(req.query.limit) || config.defaultItemsLimit;
        const posts = await this.telegramPostRepository.findRecent(limit);

        res.json(posts.map(toPostDto));
    }
}
