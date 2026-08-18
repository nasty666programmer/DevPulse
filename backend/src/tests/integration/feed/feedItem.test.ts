import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createContainer, InjectionMode, asClass, asValue } from 'awilix';
import handleMiddleware from '../../../middleware.js';
import FeedController from '../../../controller/feed/index.js';
import FeedService from '../../../modules/feed/services/index.js';

describe('GET /feed/item', () => {
    let app: express.Express;
    let rssCollectorService: { fetchFeed: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
        rssCollectorService = { fetchFeed: vi.fn() };

        const container = createContainer({
            injectionMode: InjectionMode.PROXY,
            strict: true,
        });

        container.register({
            feedController: asClass(FeedController).scoped(),
            feedService: asClass(FeedService).scoped(),
            rssCollectorService: asValue(rssCollectorService),
            // FeedService's constructor destructures all five deps up front (PROXY injection
            // mode resolves each on access), so even deps unused by the method under test
            // must be registered or the container throws before the handler runs.
            htmlParserService: asValue({ parseArticle: vi.fn() }),
            feedItemRepository: asValue({ getOne: vi.fn(), getAll: vi.fn(), getByDate: vi.fn() }),
            rawArticleRepository: asValue({ create: vi.fn() }),
            categorizationService: asValue({ categorize: vi.fn() }),
        });

        app = express();

        await handleMiddleware(app, express, container);
    });

    it('responds with 200 and fetches the hacker news feed through the DI container', async () => {
        const firstItem = { title: 'Some post' };
        rssCollectorService.fetchFeed.mockResolvedValue([firstItem, { title: 'Other post' }]);

        const response = await request(app).get('/feed/fetch-item');

        expect(response.status).toBe(200);
        expect(response.body).toEqual(firstItem);
        expect(rssCollectorService.fetchFeed).toHaveBeenCalledWith(
            'https://news.ycombinator.com/rss'
        );
    });

    it('responds with 500 when the underlying feed fetch fails', async () => {
        rssCollectorService.fetchFeed.mockRejectedValue(new Error('feed unavailable'));

        const response = await request(app).get('/feed/fetch-item');

        expect(response.status).toBe(500);
    });
});
