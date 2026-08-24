import { asClass } from 'awilix';
import type { AwilixContainer } from 'awilix';
import RssProvider from './Rss/RssProvider.js';
import TelegramProvider from './telegram/TelegramProvider.js';
import GoogleAuthProvider from './google/GoogleAuthProvider.js';

export function createProvidersContainer(container: AwilixContainer) {
    return container.register({
        rssProvider: asClass(RssProvider).scoped(),
        telegramProvider: asClass(TelegramProvider).scoped(),
        googleAuthProvider: asClass(GoogleAuthProvider).scoped(),
    });
}
