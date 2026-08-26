import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createContainer, InjectionMode, asClass, asValue } from 'awilix';
import { Types } from 'mongoose';
import handleMiddleware from '../../../middleware.js';
import FeedSourceController from '../../../controller/feedSource/index.js';
import {
    DuplicateFeedSourceError,
    FeedSourceNotFoundError,
    InvalidFeedSourceUrlError,
} from '../../../modules/feedSource/errors.js';

function setupApp() {
    const feedSourceService = { add: vi.fn(), list: vi.fn(), remove: vi.fn() };
    // Pass-through: these tests exercise FeedSourceController, not the auth
    // gate (that's covered separately for GET /feed/items) — every request
    // here is already "authenticated" as this fixed user.
    const authMiddleware = {
        useMiddleware: vi.fn(async (req) => {
            req.userId = FIXED_USER_ID;
        }),
    };

    const container = createContainer({
        injectionMode: InjectionMode.PROXY,
        strict: true,
    });

    container.register({
        authMiddleware: asValue(authMiddleware),
        feedSourceController: asClass(FeedSourceController).scoped(),
        feedSourceService: asValue(feedSourceService),
    });

    return { feedSourceService, container };
}

const FIXED_USER_ID = new Types.ObjectId().toString();

describe('POST /feed-sources', () => {
    let app: express.Express;
    let feedSourceService: { add: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
        const setup = setupApp();
        feedSourceService = setup.feedSourceService;
        app = express();
        await handleMiddleware(app, express, setup.container);
    });

    it('adds a source and returns it', async () => {
        const stored = { _id: new Types.ObjectId(), url: 'https://example.com/rss', addedAt: new Date('2026-01-01') };
        feedSourceService.add.mockResolvedValue(stored);

        const response = await request(app).post('/feed-sources').send({ url: 'https://example.com/rss' });

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
            id: stored._id.toString(),
            url: stored.url,
            addedAt: stored.addedAt.toISOString(),
        });
        expect(feedSourceService.add).toHaveBeenCalledWith(FIXED_USER_ID, 'https://example.com/rss');
    });

    it('responds 400 when url is missing from the body', async () => {
        const response = await request(app).post('/feed-sources').send({});

        expect(response.status).toBe(400);
        expect(feedSourceService.add).not.toHaveBeenCalled();
    });

    it('responds 400 when the service rejects the URL as invalid', async () => {
        feedSourceService.add.mockRejectedValue(new InvalidFeedSourceUrlError());

        const response = await request(app).post('/feed-sources').send({ url: 'not-a-url' });

        expect(response.status).toBe(400);
    });

    it('responds 409 when the source is already added', async () => {
        feedSourceService.add.mockRejectedValue(new DuplicateFeedSourceError());

        const response = await request(app).post('/feed-sources').send({ url: 'https://example.com/rss' });

        expect(response.status).toBe(409);
    });
});

describe('GET /feed-sources', () => {
    let app: express.Express;
    let feedSourceService: { add: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
        const setup = setupApp();
        feedSourceService = setup.feedSourceService;
        app = express();
        await handleMiddleware(app, express, setup.container);
    });

    it('lists the current user\'s sources', async () => {
        const sources = [{ _id: new Types.ObjectId(), url: 'https://example.com/rss', addedAt: new Date('2026-01-01') }];
        feedSourceService.list.mockResolvedValue(sources);

        const response = await request(app).get('/feed-sources');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([
            { id: sources[0]._id.toString(), url: sources[0].url, addedAt: sources[0].addedAt.toISOString() },
        ]);
        expect(feedSourceService.list).toHaveBeenCalledWith(FIXED_USER_ID);
    });
});

describe('DELETE /feed-sources/:id', () => {
    let app: express.Express;
    let feedSourceService: { add: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
        const setup = setupApp();
        feedSourceService = setup.feedSourceService;
        app = express();
        await handleMiddleware(app, express, setup.container);
    });

    it('removes the source and responds 204', async () => {
        feedSourceService.remove.mockResolvedValue(undefined);

        const response = await request(app).delete('/feed-sources/some-id');

        expect(response.status).toBe(204);
        expect(feedSourceService.remove).toHaveBeenCalledWith(FIXED_USER_ID, 'some-id');
    });

    it('responds 404 when the source does not belong to this user or does not exist', async () => {
        feedSourceService.remove.mockRejectedValue(new FeedSourceNotFoundError());

        const response = await request(app).delete('/feed-sources/some-id');

        expect(response.status).toBe(404);
    });
});
