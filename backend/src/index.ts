import express from 'express';
import bootstrap from './bootstrap.js';
import dotenv from 'dotenv';
import handleMiddleware from './middleware.js';
import config from './modules/config/index.js';
import type MongoDB from './db/mongo.js';

dotenv.config();

const app = express();
const PORT = config.port;

//TODO: Add error handler for some type: FeedError, DatabaseError, etc. and also add logging for errors

const container = await bootstrap();

// Middlewares and handle routers
await handleMiddleware(app, express, container);

app.get('/', async (_req, res) => {
    res.send('RSS collection started');
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`🚀 Server started on http://localhost:${PORT}`);

    // In Kubernetes this is set to "false" — scheduling is handled by a separate
    // CronJob (bin/collect.ts) instead, since every replica running its own cron
    // would collect the same feeds N times in parallel. Defaults to on for local dev.
    const schedulerEnabled = process.env.ENABLE_IN_PROCESS_SCHEDULER !== 'false';

    if (schedulerEnabled) {
        const schedulerService = container.resolve<{ start: () => void }>('schedulerService');
        schedulerService.start();
    }
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');

    server.close(async () => {
        const mongo = container.resolve<MongoDB>('mongo');
        await mongo.disconnect();
        process.exit(0);
    });
});
