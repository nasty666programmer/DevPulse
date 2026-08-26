import type { Request, Response } from 'express';

export interface MiddlewareDefinition {
    useMiddleware(req: Request, res: Response): Promise<void>;
}
