import { asClass } from 'awilix';
import type { AwilixContainer } from 'awilix';
import RssController from './rssController/index.js';
import FeedController from './feed/index.js';
import HealthController from './health/index.js';
import DigestController from './digest/index.js';

export function createControllersContainer(container: AwilixContainer) {
    return container.register({
        rssController: asClass(RssController).scoped(),
        feedController: asClass(FeedController).scoped(),
        healthController: asClass(HealthController).scoped(),
        digestController: asClass(DigestController).scoped(),
    });
}
