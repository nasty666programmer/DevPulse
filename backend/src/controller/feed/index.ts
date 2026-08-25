import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import FeedService from '../../modules/feed/services/index.js';
import config from '../../modules/config/index.js';
import type { Category } from '../../modules/categorization/interfaces/index.js';
import type { IFeedItemRepository } from '../../db/repositories/feed/interface/feedItemRepository.js';
import type { ISummarizerService } from '../../modules/summarizer/interfaces/index.js';
import { isSummarizable } from '../../modules/summarizer/interfaces/index.js';
import { SummarizerTimeoutError, SummarizerUnavailableError } from '../../providers/summarizer/errors.js';

export default class FeedController {
    private readonly feedService: FeedService;
    private readonly feedItemRepository: IFeedItemRepository;
    private readonly summarizerService: ISummarizerService;

    constructor({
        feedService,
        feedItemRepository,
        summarizerService,
    }: {
        feedService: FeedService;
        feedItemRepository: IFeedItemRepository;
        summarizerService: ISummarizerService;
    }) {
        this.feedService = feedService;
        this.feedItemRepository = feedItemRepository;
        this.summarizerService = summarizerService;
    }

    async getItem(req: Request, res: Response) {
        const feedItem = await this.feedService.getItem();

        res.json(feedItem);
    }

    async fetchFeedItem(req: Request, res: Response) {
        const feed = await this.feedService.fetchFeedItems();

        res.json(feed);
    }

    async getFeeds(req: Request, res: Response) {
        const feeds = await this.feedService.fetchAllFeeds();

        const limit = feeds.slice(0, config.feedsPageSize);

        res.json(limit);
    }

    async getItems(req: Request, res: Response) {
        const limit = Number(req.query.limit) || config.defaultItemsLimit;
        const category = typeof req.query.category === 'string' ? (req.query.category as Category) : undefined;

        const items = await this.feedService.listItems(limit, category);

        res.json(items);
    }

    async summarizeItem(req: Request, res: Response) {
        const id = req.params.id as string;

        if (!Types.ObjectId.isValid(id)) {
            res.status(404).json({ error: 'Feed item not found' });
            return;
        }

        const item = await this.feedItemRepository.findById(id);

        if (!item) {
            res.status(404).json({ error: 'Feed item not found' });
            return;
        }

        if (item.summary) {
            res.json({ summary: item.summary });
            return;
        }

        if (!isSummarizable(item.content)) {
            res.status(400).json({ error: 'Item content is too short to summarize' });
            return;
        }

        let summary: string;
        try {
            summary = await this.summarizerService.summarize(item.content);
        } catch (error) {
            if (error instanceof SummarizerTimeoutError || error instanceof SummarizerUnavailableError) {
                res.status(503).json({ error: error.message });
                return;
            }
            throw error;
        }

        await this.feedItemRepository.setSummary(item._id.toString(), summary);

        res.json({ summary });
    }
}
