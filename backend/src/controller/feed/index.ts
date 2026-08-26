import type { Request, Response } from 'express';
import FeedService from '../../modules/feed/services/index.js';
import config from '../../modules/config/index.js';
import type { Category } from '../../modules/categorization/interfaces/index.js';
import { FeedItemNotFoundError, FeedItemNotSummarizableError } from '../../modules/feed/errors.js';
import { SummarizerTimeoutError, SummarizerUnavailableError } from '../../providers/summarizer/errors.js';

export default class FeedController {
    private readonly feedService: FeedService;

    constructor({ feedService }: { feedService: FeedService }) {
        this.feedService = feedService;
    }

    async getItem(req: Request, res: Response) {
        const feedItem = await this.feedService.getItem(req.userId as string);

        res.json(feedItem);
    }

    async fetchFeedItem(req: Request, res: Response) {
        const feed = await this.feedService.fetchFeedItems(req.userId as string);

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

        const items = await this.feedService.listItems(req.userId as string, limit, category);

        res.json(items);
    }

    async summarizeItem(req: Request, res: Response) {
        try {
            const summary = await this.feedService.summarizeItem(req.userId as string, req.params.id as string);

            res.json({ summary });
        } catch (error) {
            if (error instanceof FeedItemNotFoundError) {
                res.status(404).json({ error: error.message });
                return;
            }
            if (error instanceof FeedItemNotSummarizableError) {
                res.status(400).json({ error: error.message });
                return;
            }
            if (error instanceof SummarizerTimeoutError || error instanceof SummarizerUnavailableError) {
                res.status(503).json({ error: error.message });
                return;
            }
            throw error;
        }
    }
}
