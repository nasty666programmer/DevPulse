import type { Request, Response } from 'express';
import config from '../../modules/config/index.js';
import { InvalidGoogleTokenError } from '../../modules/auth/errors.js';
import { toUserDto } from '../../modules/auth/mappers.js';
import type { IAuthService } from '../../modules/auth/interfaces/index.js';

const SESSION_COOKIE_OPTIONS = {
    httpOnly: true,
    sameSite: 'lax' as const,
};

export default class AuthController {
    private readonly authService: IAuthService;

    constructor({ authService }: { authService: IAuthService }) {
        this.authService = authService;
    }

    async signInWithGoogle(req: Request, res: Response) {
        const idToken = req.body?.idToken;

        if (typeof idToken !== 'string' || !idToken) {
            res.status(400).json({ error: 'idToken is required' });
            return;
        }

        let result;
        try {
            result = await this.authService.signInWithGoogle(idToken);
        } catch (error) {
            if (error instanceof InvalidGoogleTokenError) {
                res.status(401).json({ error: 'invalid_google_token' });
                return;
            }
            throw error;
        }

        res.cookie(config.sessionCookieName, result.sessionToken, {
            ...SESSION_COOKIE_OPTIONS,
            secure: config.cookieSecure,
            maxAge: config.sessionMaxAgeMs,
        });
        res.json({ user: toUserDto(result.user) });
    }

    async getCurrentUser(req: Request, res: Response) {
        const token = req.cookies?.[config.sessionCookieName];

        if (!token) {
            res.status(401).json({ error: 'not_authenticated' });
            return;
        }

        const user = await this.authService.verifySession(token);

        if (!user) {
            res.status(401).json({ error: 'not_authenticated' });
            return;
        }

        res.json({ user: toUserDto(user) });
    }

    async logout(req: Request, res: Response) {
        const token = req.cookies?.[config.sessionCookieName];

        if (token) {
            await this.authService.logout(token);
        }

        res.clearCookie(config.sessionCookieName, {
            ...SESSION_COOKIE_OPTIONS,
            secure: config.cookieSecure,
        });
        res.status(204).end();
    }
}
