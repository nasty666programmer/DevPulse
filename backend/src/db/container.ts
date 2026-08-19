import { asClass } from 'awilix';
import type { AwilixContainer } from 'awilix';
import MongoDB from './mongo.js';
import RawArticleRepository from './repositories/feed/rawArticleRepository.js';
import FeedItemRepository from './repositories/feed/feedItemRepository.js';
import DigestRepository from './repositories/digest/digestRepository.js';

export function createDatabaseContainer(container: AwilixContainer) {
    return container.register({
        mongo: asClass(MongoDB).singleton(),
        rawArticleRepository: asClass(RawArticleRepository).scoped(),
        feedItemRepository: asClass(FeedItemRepository).scoped(),
        digestRepository: asClass(DigestRepository).scoped(),
    });
}
