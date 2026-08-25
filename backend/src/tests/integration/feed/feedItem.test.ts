import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createContainer, InjectionMode, asClass, asValue } from 'awilix';
import { Types } from 'mongoose';
import handleMiddleware from '../../../middleware.js';
import FeedController from '../../../controller/feed/index.js';
import FeedService from '../../../modules/feed/services/index.js';
import { SummarizerTimeoutError, SummarizerUnavailableError } from '../../../providers/summarizer/errors.js';

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
            feedItemRepository: asValue({ getOne: vi.fn(), getAll: vi.fn(), getRecentByCategory: vi.fn() }),
            rawArticleRepository: asValue({ create: vi.fn() }),
            categorizationService: asValue({ categorize: vi.fn() }),
            summarizerService: asValue({ summarize: vi.fn() }),
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

describe('GET /feed/items', () => {
    let app: express.Express;
    let feedItemRepository: { getAll: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
        feedItemRepository = { getAll: vi.fn().mockResolvedValue([]) };

        const container = createContainer({
            injectionMode: InjectionMode.PROXY,
            strict: true,
        });

        container.register({
            feedController: asClass(FeedController).scoped(),
            feedService: asClass(FeedService).scoped(),
            rssCollectorService: asValue({ fetchFeed: vi.fn() }),
            htmlParserService: asValue({ parseArticle: vi.fn() }),
            feedItemRepository: asValue(feedItemRepository),
            rawArticleRepository: asValue({ create: vi.fn() }),
            categorizationService: asValue({ categorize: vi.fn() }),
            summarizerService: asValue({ summarize: vi.fn() }),
        });

        app = express();

        await handleMiddleware(app, express, container);
    });

    it('passes the category query param through to the repository', async () => {
        const response = await request(app).get('/feed/items?category=Docker');

        expect(response.status).toBe(200);
        expect(feedItemRepository.getAll).toHaveBeenCalledWith(20, 'Docker');
    });

    it('queries without a category filter when none is given', async () => {
        const response = await request(app).get('/feed/items');

        expect(response.status).toBe(200);
        expect(feedItemRepository.getAll).toHaveBeenCalledWith(20, undefined);
    });
});

describe('POST /feed/items/:id/summary', () => {
    let app: express.Express;
    let feedItemRepository: {
        findById: ReturnType<typeof vi.fn>;
        setSummary: ReturnType<typeof vi.fn>;
    };
    let summarizerService: { summarize: ReturnType<typeof vi.fn> };
    const id = new Types.ObjectId().toString();
    const longContent = 'a'.repeat(250);

    beforeEach(async () => {
        feedItemRepository = {
            getOne: vi.fn(),
            getAll: vi.fn(),
            getRecentByCategory: vi.fn(),
            findById: vi.fn(),
            setSummary: vi.fn(),
        } as never;
        summarizerService = { summarize: vi.fn() };

        const container = createContainer({
            injectionMode: InjectionMode.PROXY,
            strict: true,
        });

        container.register({
            feedController: asClass(FeedController).scoped(),
            feedService: asClass(FeedService).scoped(),
            rssCollectorService: asValue({ fetchFeed: vi.fn() }),
            htmlParserService: asValue({ parseArticle: vi.fn() }),
            feedItemRepository: asValue(feedItemRepository),
            rawArticleRepository: asValue({ create: vi.fn() }),
            categorizationService: asValue({ categorize: vi.fn() }),
            summarizerService: asValue(summarizerService),
        });

        app = express();
        await handleMiddleware(app, express, container);
    });

    it('returns 404 when the item does not exist', async () => {
        feedItemRepository.findById.mockResolvedValue(null);

        const response = await request(app).post(`/feed/items/${id}/summary`);

        expect(response.status).toBe(404);
        expect(summarizerService.summarize).not.toHaveBeenCalled();
    });

    it('returns the cached summary without calling the summarizer (cache hit)', async () => {
        feedItemRepository.findById.mockResolvedValue({
            _id: id,
            content: longContent,
            summary: 'Already summarized.',
        });

        const response = await request(app).post(`/feed/items/${id}/summary`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ summary: 'Already summarized.' });
        expect(summarizerService.summarize).not.toHaveBeenCalled();
    });

    it('returns 400 without calling the summarizer when content is too short', async () => {
        feedItemRepository.findById.mockResolvedValue({ _id: id, content: 'too short', summary: null });

        const response = await request(app).post(`/feed/items/${id}/summary`);

        expect(response.status).toBe(400);
        expect(summarizerService.summarize).not.toHaveBeenCalled();
    });

    it('calls the summarizer, persists, and returns the summary on a cache miss', async () => {
        feedItemRepository.findById.mockResolvedValue({ _id: id, content: longContent, summary: null });
        summarizerService.summarize.mockResolvedValue('Fresh summary.');

        const response = await request(app).post(`/feed/items/${id}/summary`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ summary: 'Fresh summary.' });
        expect(summarizerService.summarize).toHaveBeenCalledWith(longContent);
        expect(feedItemRepository.setSummary).toHaveBeenCalledWith(id, 'Fresh summary.');
    });

    it('returns 503 and does not cache anything when the summarizer times out', async () => {
        feedItemRepository.findById.mockResolvedValue({ _id: id, content: longContent, summary: null });
        summarizerService.summarize.mockRejectedValue(new SummarizerTimeoutError());

        const response = await request(app).post(`/feed/items/${id}/summary`);

        expect(response.status).toBe(503);
        expect(feedItemRepository.setSummary).not.toHaveBeenCalled();
    });

    it('returns 503 when the summarizer is unavailable', async () => {
        feedItemRepository.findById.mockResolvedValue({ _id: id, content: longContent, summary: null });
        summarizerService.summarize.mockRejectedValue(new SummarizerUnavailableError());

        const response = await request(app).post(`/feed/items/${id}/summary`);

        expect(response.status).toBe(503);
        expect(feedItemRepository.setSummary).not.toHaveBeenCalled();
    });
});
