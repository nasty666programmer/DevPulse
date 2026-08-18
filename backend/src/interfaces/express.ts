import type { Request, Response, NextFunction } from 'express';
import type { AwilixContainer } from 'awilix';

// Attached by the per-request DI scope middleware in middleware.ts before any route runs.
declare module 'express-serve-static-core' {
    interface Request {
        scope: AwilixContainer;
    }
}

export type ControllerHandler = (req: Request, res: Response, next: NextFunction) => unknown;

export interface ResolvedController {
    [handlerName: string]: ControllerHandler | undefined;
}
