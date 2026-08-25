import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createContainer, InjectionMode, asClass, asValue } from 'awilix';
import { Types } from 'mongoose';
import handleMiddleware from '../../../middleware.js';
import TelegramController from '../../../controller/telegramController/index.js';
import { SummarizerTimeoutError, SummarizerUnavailableError } from '../../../providers/summarizer/errors.js';

vi.mock('../../../modules/config/index.js', () => ({
    default: {
        telegramChannelsPageSize: 4,
        telegramPostsPerChannelLimit: 5,
        defaultItemsLimit: 20,
    },
}));

function channel(overrides: Partial<{ channelId: number; title: string }> = {}) {
    return {
        _id: new Types.ObjectId(),
        channelId: -1,
        username: 'channel_a',
        title: 'Channel A',
        addedAt: new Date('2026-01-01'),
        ...overrides,
    };
}

function post(overrides: Partial<{ channelId: number; text: string }> = {}) {
    return {
        _id: new Types.ObjectId(),
        channelId: -1,
        text: 'Hello',
        publishedAt: new Date('2026-01-01'),
        mediaUrls: [],
        ...overrides,
    };
}

function setupApp() {
    const telegramChannelRepository = {
        findAll: vi.fn(),
        findAllWithUsername: vi.fn(),
        findPage: vi.fn(),
        count: vi.fn(),
    };
    const telegramPostRepository = {
        create: vi.fn(),
        findRecent: vi.fn(),
        findRecentByChannelIds: vi.fn(),
        findById: vi.fn(),
        setSummary: vi.fn(),
    };
    const telegramCollectorService = { collect: vi.fn() };
    const summarizerService = { summarize: vi.fn() };

    const container = createContainer({
        injectionMode: InjectionMode.PROXY,
        strict: true,
    });

    container.register({
        telegramController: asClass(TelegramController).scoped(),
        telegramChannelRepository: asValue(telegramChannelRepository),
        telegramPostRepository: asValue(telegramPostRepository),
        telegramCollectorService: asValue(telegramCollectorService),
        summarizerService: asValue(summarizerService),
    });

    return { telegramChannelRepository, telegramPostRepository, summarizerService, container };
}

describe('GET /telegram/channels', () => {
    let app: express.Express;
    let telegramChannelRepository: ReturnType<typeof setupApp>['telegramChannelRepository'];

    beforeEach(async () => {
        const setup = setupApp();
        telegramChannelRepository = setup.telegramChannelRepository;
        app = express();
        await handleMiddleware(app, express, setup.container);
    });

    it('without ?page, returns the full flat list from findAll (unchanged existing behavior)', async () => {
        telegramChannelRepository.findAll.mockResolvedValue([channel()]);

        const response = await request(app).get('/telegram/channels');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body).toEqual([
            {
                id: expect.any(String),
                channelId: -1,
                username: 'channel_a',
                title: 'Channel A',
                addedAt: '2026-01-01T00:00:00.000Z',
            },
        ]);
        expect(telegramChannelRepository.findPage).not.toHaveBeenCalled();
    });

    it('with ?page, paginates via findPage/count and wraps the response with total/page/pageSize', async () => {
        telegramChannelRepository.findPage.mockResolvedValue([channel({ channelId: -5 })]);
        telegramChannelRepository.count.mockResolvedValue(9);

        const response = await request(app).get('/telegram/channels?page=2&limit=4');

        expect(response.status).toBe(200);
        expect(telegramChannelRepository.findPage).toHaveBeenCalledWith(4, 4);
        expect(response.body).toEqual({
            channels: [
                {
                    id: expect.any(String),
                    channelId: -5,
                    username: 'channel_a',
                    title: 'Channel A',
                    addedAt: '2026-01-01T00:00:00.000Z',
                },
            ],
            total: 9,
            page: 2,
            pageSize: 4,
        });
    });

    it('with ?page but no ?limit, falls back to config.telegramChannelsPageSize', async () => {
        telegramChannelRepository.findPage.mockResolvedValue([]);
        telegramChannelRepository.count.mockResolvedValue(0);

        await request(app).get('/telegram/channels?page=1');

        expect(telegramChannelRepository.findPage).toHaveBeenCalledWith(0, 4);
    });
});

describe('GET /telegram/posts', () => {
    let app: express.Express;
    let telegramPostRepository: ReturnType<typeof setupApp>['telegramPostRepository'];

    beforeEach(async () => {
        const setup = setupApp();
        telegramPostRepository = setup.telegramPostRepository;
        app = express();
        await handleMiddleware(app, express, setup.container);
    });

    it('without ?channelIds, keeps the existing findRecent(limit) behavior', async () => {
        telegramPostRepository.findRecent.mockResolvedValue([post()]);

        const response = await request(app).get('/telegram/posts');

        expect(response.status).toBe(200);
        expect(telegramPostRepository.findRecent).toHaveBeenCalledWith(20);
        expect(telegramPostRepository.findRecentByChannelIds).not.toHaveBeenCalled();
    });

    it('with ?channelIds, scopes to those channels via findRecentByChannelIds', async () => {
        telegramPostRepository.findRecentByChannelIds.mockResolvedValue([
            post({ channelId: -1 }),
            post({ channelId: -2 }),
        ]);

        const response = await request(app).get('/telegram/posts?channelIds=-1,-2');

        expect(response.status).toBe(200);
        expect(telegramPostRepository.findRecentByChannelIds).toHaveBeenCalledWith([-1, -2], 5);
        expect(response.body).toHaveLength(2);
        expect(telegramPostRepository.findRecent).not.toHaveBeenCalled();
    });
});

describe('POST /telegram/posts/:id/summary', () => {
    let app: express.Express;
    let telegramPostRepository: ReturnType<typeof setupApp>['telegramPostRepository'];
    let summarizerService: ReturnType<typeof setupApp>['summarizerService'];
    const id = new Types.ObjectId().toString();
    const longText = 'a'.repeat(250);

    beforeEach(async () => {
        const setup = setupApp();
        telegramPostRepository = setup.telegramPostRepository;
        summarizerService = setup.summarizerService;
        app = express();
        await handleMiddleware(app, express, setup.container);
    });

    it('returns 404 when the post does not exist', async () => {
        telegramPostRepository.findById.mockResolvedValue(null);

        const response = await request(app).post(`/telegram/posts/${id}/summary`);

        expect(response.status).toBe(404);
        expect(summarizerService.summarize).not.toHaveBeenCalled();
    });

    it('returns the cached summary without calling the summarizer (cache hit)', async () => {
        telegramPostRepository.findById.mockResolvedValue({ _id: id, text: longText, summary: 'Cached.' });

        const response = await request(app).post(`/telegram/posts/${id}/summary`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ summary: 'Cached.' });
        expect(summarizerService.summarize).not.toHaveBeenCalled();
    });

    it('returns 400 without calling the summarizer when text is too short', async () => {
        telegramPostRepository.findById.mockResolvedValue({ _id: id, text: 'short', summary: null });

        const response = await request(app).post(`/telegram/posts/${id}/summary`);

        expect(response.status).toBe(400);
        expect(summarizerService.summarize).not.toHaveBeenCalled();
    });

    it('calls the summarizer, persists, and returns the summary on a cache miss', async () => {
        telegramPostRepository.findById.mockResolvedValue({ _id: id, text: longText, summary: null });
        summarizerService.summarize.mockResolvedValue('Fresh summary.');

        const response = await request(app).post(`/telegram/posts/${id}/summary`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ summary: 'Fresh summary.' });
        expect(summarizerService.summarize).toHaveBeenCalledWith(longText);
        expect(telegramPostRepository.setSummary).toHaveBeenCalledWith(id, 'Fresh summary.');
    });

    it('returns 503 and does not cache anything when the summarizer fails', async () => {
        telegramPostRepository.findById.mockResolvedValue({ _id: id, text: longText, summary: null });
        summarizerService.summarize.mockRejectedValue(new SummarizerUnavailableError());

        const response = await request(app).post(`/telegram/posts/${id}/summary`);

        expect(response.status).toBe(503);
        expect(telegramPostRepository.setSummary).not.toHaveBeenCalled();
    });

    it('returns 503 when the summarizer times out', async () => {
        telegramPostRepository.findById.mockResolvedValue({ _id: id, text: longText, summary: null });
        summarizerService.summarize.mockRejectedValue(new SummarizerTimeoutError());

        const response = await request(app).post(`/telegram/posts/${id}/summary`);

        expect(response.status).toBe(503);
    });
});
