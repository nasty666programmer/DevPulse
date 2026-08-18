import { asClass } from 'awilix';
import type { AwilixContainer } from 'awilix';
import RssController from './rssController/index.js';
import FeedController from './feed/index.js';

export function createControllersContainer(container: AwilixContainer) {
    return container.register({
        rssController: asClass(RssController).scoped(),
        feedController: asClass(FeedController).scoped(),
    });
}
