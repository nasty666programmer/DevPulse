import type { Request, Response } from 'express';
import mongoose from 'mongoose';

export default class HealthController {
    async getHealth(_req: Request, res: Response) {
        const isConnected = mongoose.connection.readyState === 1;

        res.status(isConnected ? 200 : 503).json({
            status: isConnected ? 'ok' : 'error',
            mongo: mongoose.STATES[mongoose.connection.readyState],
        });
    }
}
