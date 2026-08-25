import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import type TelegramCollectorService from '../../modules/telegramCollector/services/index.js';
import config from '../../modules/config/index.js';
import type { ITelegramChannelRepository } from '../../db/repositories/telegram/interface/telegramChannelRepository.js';
import type { ITelegramPostRepository } from '../../db/repositories/telegram/interface/telegramPostRepository.js';
import type { ITelegramChannelDocument } from '../../db/models/telegram/interface/telegramChannel.js';
import type { ITelegramPostDocument } from '../../db/models/telegram/interface/telegramPost.js';
import type { ISummarizerService } from '../../modules/summarizer/interfaces/index.js';
import { isSummarizable } from '../../modules/summarizer/interfaces/index.js';
import { SummarizerTimeoutError, SummarizerUnavailableError } from '../../providers/summarizer/errors.js';

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
        // ?? null, not a bare pass-through: posts collected before this field
        // existed have no `summary` key at all in Mongo (Mongoose's schema
        // `default` only applies on create, never retroactively on read), so
        // this reads back as undefined for them, not null.
        summary: post.summary ?? null,
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
    private readonly summarizerService: ISummarizerService;

    constructor({
        telegramCollectorService,
        telegramChannelRepository,
        telegramPostRepository,
        summarizerService,
    }: {
        telegramCollectorService: TelegramCollectorService;
        telegramChannelRepository: ITelegramChannelRepository;
        telegramPostRepository: ITelegramPostRepository;
        summarizerService: ISummarizerService;
    }) {
        this.telegramCollectorService = telegramCollectorService;
        this.telegramChannelRepository = telegramChannelRepository;
        this.telegramPostRepository = telegramPostRepository;
        this.summarizerService = summarizerService;
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

    async summarizePost(req: Request, res: Response) {
        const id = req.params.id as string;

        if (!Types.ObjectId.isValid(id)) {
            res.status(404).json({ error: 'Telegram post not found' });
            return;
        }

        const post = await this.telegramPostRepository.findById(id);

        if (!post) {
            res.status(404).json({ error: 'Telegram post not found' });
            return;
        }

        if (post.summary) {
            res.json({ summary: post.summary });
            return;
        }

        if (!isSummarizable(post.text)) {
            res.status(400).json({ error: 'Post text is too short to summarize' });
            return;
        }

        let summary: string;
        try {
            summary = await this.summarizerService.summarize(post.text);
        } catch (error) {
            if (error instanceof SummarizerTimeoutError || error instanceof SummarizerUnavailableError) {
                res.status(503).json({ error: error.message });
                return;
            }
            throw error;
        }

        await this.telegramPostRepository.setSummary(post._id.toString(), summary);

        res.json({ summary });
    }
}
