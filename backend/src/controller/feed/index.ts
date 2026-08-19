import type { Request, Response } from 'express';
import FeedService from '../../modules/feed/services/index.js';
import config from '../../modules/config/index.js';
import type { Category } from '../../modules/categorization/interfaces/index.js';

export default class FeedController {
    private readonly feedService: FeedService;

    constructor({ feedService }: { feedService: FeedService }) {
        this.feedService = feedService;
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
}
