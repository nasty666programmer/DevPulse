import type { Request, Response, NextFunction } from 'express';
import type { AwilixContainer } from 'awilix';

// Attached by the per-request DI scope middleware in middleware.ts before any route runs.
declare module 'express-serve-static-core' {
    interface Request {
        scope: AwilixContainer;
        // Set by AuthMiddleware once a route's `middleware` list includes it —
        // absent on routes that don't require auth, so it stays optional.
        userId?: string;
    }
}

export type ControllerHandler = (req: Request, res: Response, next: NextFunction) => unknown;

export interface ResolvedController {
    [handlerName: string]: ControllerHandler | undefined;
}
