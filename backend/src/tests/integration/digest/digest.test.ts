import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createContainer, InjectionMode, asClass, asValue } from 'awilix';
import handleMiddleware from '../../../middleware.js';
import DigestController from '../../../controller/digest/index.js';
import DigestService from '../../../modules/digest/services/index.js';

describe('GET /digest/latest', () => {
    let app: express.Express;
    let digestRepository: { upsertByDate: ReturnType<typeof vi.fn>; getLatest: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
        digestRepository = { upsertByDate: vi.fn(), getLatest: vi.fn() };

        const container = createContainer({
            injectionMode: InjectionMode.PROXY,
            strict: true,
        });

        container.register({
            digestController: asClass(DigestController).scoped(),
            digestService: asClass(DigestService).scoped(),
            feedItemRepository: asValue({ getByDate: vi.fn() }),
            digestRepository: asValue(digestRepository),
        });

        app = express();

        await handleMiddleware(app, express, container);
    });

    it('responds with the latest digest', async () => {
        const digest = {
            date: new Date('2026-08-18').toISOString(),
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
