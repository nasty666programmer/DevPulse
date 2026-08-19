import { asClass } from 'awilix';
import type { AwilixContainer } from 'awilix';
import DigestService from './digest/services/index.js';
import RssCollectorServices from './rss/services/index.js';
import HtmlParserServices from './parsers/services/htmlParser.js';
import FeedService from './feed/services/index.js';
import SchedulerService from './scheduler/index.js';
import CategorizationService from './categorization/services/index.js';
import TelegramBotService from './telegramBot/services/index.js';

export function createServicesContainer(container: AwilixContainer) {
    return container.register({
        rssCollectorService: asClass(RssCollectorServices).scoped(),
        digestService: asClass(DigestService).scoped(),
        htmlParserService: asClass(HtmlParserServices).scoped(),
        feedService: asClass(FeedService).scoped(),
        schedulerService: asClass(SchedulerService).scoped(),
        categorizationService: asClass(CategorizationService).scoped(),
        telegramBotService: asClass(TelegramBotService).scoped(),
    });
}
