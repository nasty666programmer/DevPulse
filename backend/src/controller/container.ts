import { asClass } from 'awilix';
import type { AwilixContainer } from 'awilix';
import RssController from './rssController/index.js';
import FeedController from './feed/index.js';
import HealthController from './health/index.js';
import DigestController from './digest/index.js';
import TelegramController from './telegramController/index.js';
import AuthController from './authController/index.js';

export function createControllersContainer(container: AwilixContainer) {
    return container.register({
        rssController: asClass(RssController).scoped(),
        feedController: asClass(FeedController).scoped(),
        healthController: asClass(HealthController).scoped(),
        digestController: asClass(DigestController).scoped(),
        telegramController: asClass(TelegramController).scoped(),
        authController: asClass(AuthController).scoped(),
    });
}
