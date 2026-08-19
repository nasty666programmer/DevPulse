import express from 'express';
import swaggerUi from 'swagger-ui-express';
import bootstrap from './bootstrap.js';
import dotenv from 'dotenv';
import handleMiddleware from './middleware.js';
import config from './modules/config/index.js';
import openapiSpec from './openapi.js';
import type MongoDB from './db/mongo.js';

dotenv.config();

const app = express();
const PORT = config.port;

//TODO: Add error handler for some type: FeedError, DatabaseError, etc. and also add logging for errors

const container = await bootstrap();

// Middlewares and handle routers
await handleMiddleware(app, express, container);

// Local testing only. NODE_ENV can't be the signal here — the same Docker image
// runs both local docker-compose and Kubernetes, and the Dockerfile hardcodes
// NODE_ENV=production for both (needed for `npm ci --omit=dev`). ENABLE_SWAGGER
// mirrors ENABLE_IN_PROCESS_SCHEDULER: on by default, explicitly "false" in the
// k8s ConfigMap for real prod.
if (process.env.ENABLE_SWAGGER !== 'false') {
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
    console.log('📘 Swagger UI: /docs');
}

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

    // No-op when TELEGRAM_BOT_TOKEN is unset — see TelegramBotService.start().
    const telegramBotService = container.resolve<{ start: () => void }>('telegramBotService');
    telegramBotService.start();
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');

    server.close(async () => {
        const telegramBotService = container.resolve<{ stop: () => void }>('telegramBotService');
        telegramBotService.stop();

        const mongo = container.resolve<MongoDB>('mongo');
        await mongo.disconnect();
        process.exit(0);
    });
});
