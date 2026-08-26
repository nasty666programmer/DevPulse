import type { Request, Response } from 'express';
import config from '../modules/config/index.js';
import { UnauthorizedError } from './errors.js';
import type { MiddlewareDefinition } from '../interfaces/middleware.js';
import type { IAuthService } from '../modules/auth/interfaces/index.js';

export default class AuthMiddleware implements MiddlewareDefinition {
    private readonly authService: IAuthService;

    constructor({ authService }: { authService: IAuthService }) {
        this.authService = authService;
    }

    // Throws UnauthorizedError instead of writing the response itself — the
    // caller (registerRoutes) runs middlewares inside its own try/catch and
    // maps this specific error to 401; a plain `return`/`res.status()` here
    // wouldn't stop that caller's loop from reaching the controller next.
    async useMiddleware(req: Request, res: Response): Promise<void> {
        const token = req.cookies?.[config.sessionCookieName];

        if (!token) {
            throw new UnauthorizedError('No session cookie provided');
        }

        const user = await this.authService.verifySession(token);

        if (!user) {
            throw new UnauthorizedError('Session is invalid or has expired');
        }

        req.userId = user._id.toString();
    }
}
