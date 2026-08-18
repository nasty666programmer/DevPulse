import express from 'express';
import bootstrap from './bootstrap.js';
import dotenv from 'dotenv';
import handleMiddleware from './middleware.js';
import config from './modules/config/index.js';

dotenv.config();

const app = express();
const PORT = config.port;

const container = bootstrap();

//TODO: Add error handler for some type: FeedError, DatabaseError, etc. and also add logging for errors

// Middlewares and handle routers
handleMiddleware(app, express, container);

app.get('/', async (_req, res) => {
    res.send('RSS collection started');
});

// Start server
app.listen(PORT, () => {
    //Add healthchecks for database, ai access and also
    console.log(`🚀 Server started on http://localhost:${PORT}`);

    const schedulerService = container.resolve<{ start: () => void }>('schedulerService');
    schedulerService.start();
});
