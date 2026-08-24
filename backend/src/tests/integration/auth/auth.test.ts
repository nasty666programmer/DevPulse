import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createContainer, InjectionMode, asClass, asValue } from 'awilix';
import { Types } from 'mongoose';
import handleMiddleware from '../../../middleware.js';
import AuthController from '../../../controller/authController/index.js';
import { InvalidGoogleTokenError } from '../../../modules/auth/errors.js';

// vi.mock is hoisted above any top-level const, so the cookie name literal
// is repeated here rather than shared via a variable.
vi.mock('../../../modules/config/index.js', () => ({
    default: { sessionCookieName: 'devpulse_session', sessionMaxAgeMs: 1000 * 60 * 60, cookieSecure: false },
}));

const SESSION_COOKIE_NAME = 'devpulse_session';

function user() {
    return {
        _id: new Types.ObjectId(),
        googleId: 'google-123',
        email: 'dev@example.com',
        name: 'Dev User',
        avatarUrl: null,
        createdAt: new Date('2026-01-01'),
        lastLoginAt: new Date('2026-01-01'),
    };
}

function setupApp() {
    const authService = { signInWithGoogle: vi.fn(), verifySession: vi.fn() };

    const container = createContainer({
        injectionMode: InjectionMode.PROXY,
        strict: true,
    });

    container.register({
        authController: asClass(AuthController).scoped(),
        authService: asValue(authService),
    });

    return { authService, container };
}

describe('POST /auth/google', () => {
    let app: express.Express;
    let authService: { signInWithGoogle: ReturnType<typeof vi.fn>; verifySession: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
        const setup = setupApp();
        authService = setup.authService;
        app = express();
        await handleMiddleware(app, express, setup.container);
    });

    it('signs in, sets the session cookie, and returns the user', async () => {
        const stored = user();
        authService.signInWithGoogle.mockResolvedValue({ user: stored, sessionToken: 'signed-token' });

        const response = await request(app).post('/auth/google').send({ idToken: 'google-id-token' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            user: {
                id: stored._id.toString(),
                email: stored.email,
                name: stored.name,
                avatarUrl: stored.avatarUrl,
            },
        });
        expect(authService.signInWithGoogle).toHaveBeenCalledWith('google-id-token');
        const setCookie = response.headers['set-cookie'];
        expect(setCookie[0]).toContain(`${SESSION_COOKIE_NAME}=signed-token`);
        expect(setCookie[0]).toContain('HttpOnly');
    });

    it('responds 400 when idToken is missing from the body', async () => {
        const response = await request(app).post('/auth/google').send({});

        expect(response.status).toBe(400);
        expect(authService.signInWithGoogle).not.toHaveBeenCalled();
    });

    it('responds 401 when the Google token fails verification', async () => {
        authService.signInWithGoogle.mockRejectedValue(new InvalidGoogleTokenError());

        const response = await request(app).post('/auth/google').send({ idToken: 'bad-token' });

        expect(response.status).toBe(401);
    });
});

describe('GET /auth/me', () => {
    let app: express.Express;
    let authService: { signInWithGoogle: ReturnType<typeof vi.fn>; verifySession: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
        const setup = setupApp();
        authService = setup.authService;
        app = express();
        await handleMiddleware(app, express, setup.container);
    });

    it('responds 401 when no session cookie is present', async () => {
        const response = await request(app).get('/auth/me');

        expect(response.status).toBe(401);
        expect(authService.verifySession).not.toHaveBeenCalled();
    });

    it('responds with the user for a valid session cookie', async () => {
        const stored = user();
        authService.verifySession.mockResolvedValue(stored);

        const response = await request(app)
            .get('/auth/me')
            .set('Cookie', `${SESSION_COOKIE_NAME}=valid-token`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            user: {
                id: stored._id.toString(),
                email: stored.email,
                name: stored.name,
                avatarUrl: stored.avatarUrl,
            },
        });
        expect(authService.verifySession).toHaveBeenCalledWith('valid-token');
    });

    it('responds 401 when the session cookie no longer resolves to a user', async () => {
        authService.verifySession.mockResolvedValue(null);

        const response = await request(app)
            .get('/auth/me')
            .set('Cookie', `${SESSION_COOKIE_NAME}=stale-token`);

        expect(response.status).toBe(401);
    });
});

describe('POST /auth/logout', () => {
    let app: express.Express;

    beforeEach(async () => {
        const setup = setupApp();
        app = express();
        await handleMiddleware(app, express, setup.container);
    });

    it('clears the session cookie and responds 204', async () => {
        const response = await request(app)
            .post('/auth/logout')
            .set('Cookie', `${SESSION_COOKIE_NAME}=some-token`);

        expect(response.status).toBe(204);
        const setCookie = response.headers['set-cookie'];
        expect(setCookie[0]).toContain(`${SESSION_COOKIE_NAME}=;`);
    });
});
