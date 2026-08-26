import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createContainer, InjectionMode, asClass, asValue } from 'awilix';
import handleMiddleware from '../../../middleware.js';
import DigestController from '../../../controller/digest/index.js';
import DigestService from '../../../modules/digest/services/index.js';

function setupApp() {
    const feedItemRepository = { getRecentByCategory: vi.fn().mockResolvedValue([]) };
    const digestRepository = { save: vi.fn(), getLatest: vi.fn() };

    const container = createContainer({
        injectionMode: InjectionMode.PROXY,
        strict: true,
    });

    container.register({
        authMiddleware: asValue({ useMiddleware: vi.fn().mockResolvedValue(undefined) }),
        digestController: asClass(DigestController).scoped(),
        digestService: asClass(DigestService).scoped(),
        feedItemRepository: asValue(feedItemRepository),
        digestRepository: asValue(digestRepository),
    });

    return { feedItemRepository, digestRepository, container };
}

describe('GET /digest/latest', () => {
    let app: express.Express;
    let digestRepository: { save: ReturnType<typeof vi.fn>; getLatest: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
        const setup = setupApp();
        digestRepository = setup.digestRepository;

        app = express();
        await handleMiddleware(app, express, setup.container);
    });

    it('responds with the latest digest', async () => {
        const digest = {
            generatedAt: new Date('2026-08-18').toISOString(),
            articles: [{ id: '1', title: 'Post', content: 'text', category: 'Прочее', url: null, source: null }],
        };
        digestRepository.getLatest.mockResolvedValue(digest);

        const response = await request(app).get('/digest/latest');

        expect(response.status).toBe(200);
        expect(response.body).toEqual(digest);
    });

    it('responds with 204 when no digest has been generated yet', async () => {
        digestRepository.getLatest.mockResolvedValue(null);

        const response = await request(app).get('/digest/latest');

        expect(response.status).toBe(204);
    });
});

describe('GET /digest/generate', () => {
    let app: express.Express;
    let feedItemRepository: { getRecentByCategory: ReturnType<typeof vi.fn> };
    let digestRepository: { save: ReturnType<typeof vi.fn>; getLatest: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
        const setup = setupApp();
        feedItemRepository = setup.feedItemRepository;
        digestRepository = setup.digestRepository;

        app = express();
        await handleMiddleware(app, express, setup.container);
    });

    it('regenerates the digest from the database only, without touching RSS collection', async () => {
        const saved = { generatedAt: new Date('2026-08-19').toISOString(), articles: [] };
        digestRepository.save.mockResolvedValue(saved);

        const response = await request(app).get('/digest/generate');

        expect(response.status).toBe(200);
        expect(response.body).toEqual(saved);
        expect(feedItemRepository.getRecentByCategory).toHaveBeenCalled();
    });
});
