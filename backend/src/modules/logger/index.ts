import pino from 'pino';
import config from '../config/index.js';

export default class Logger {
    private static instance: pino.Logger;

    private constructor() {}

    static getInstance(): pino.Logger {
        if (!Logger.instance) {
            Logger.instance = pino({
                level: config.logLevel ?? 'info',
            });
        }

        return Logger.instance;
    }

    static info(message: string, meta?: Record<string, unknown>): void {
        Logger.getInstance().info(meta ?? {}, message);
    }

    static warn(message: string, meta?: Record<string, unknown>): void {
        Logger.getInstance().warn(meta ?? {}, message);
    }

    static error(message: string, error?: unknown): void {
        Logger.getInstance().error({ err: error }, message);
    }
}
