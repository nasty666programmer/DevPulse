import { asClass } from 'awilix';
import type { AwilixContainer } from 'awilix';
import DigestService from './digest/services/index.js';
import RssCollectorServices from './rss/services/index.js';
import HtmlParserServices from './parsers/services/htmlParser.js';
import FeedService from './feed/services/index.js';
import SchedulerService from './scheduler/index.js';
import CategorizationService from './categorization/services/index.js';
import TelegramBotService from './telegramBot/services/index.js';
import TelegramCollectorService from './telegramCollector/services/index.js';
import TelegramSchedulerService from './telegramScheduler/index.js';
import AuthService from './auth/services/index.js';
import SummarizerService from './summarizer/services/index.js';
import FeedSourceService from './feedSource/services/index.js';
import TelegramLinkService from './telegramLink/services/index.js';

export function createServicesContainer(container: AwilixContainer) {
    return container.register({
        rssCollectorService: asClass(RssCollectorServices).scoped(),
        digestService: asClass(DigestService).scoped(),
        htmlParserService: asClass(HtmlParserServices).scoped(),
        feedService: asClass(FeedService).scoped(),
        schedulerService: asClass(SchedulerService).scoped(),
        categorizationService: asClass(CategorizationService).scoped(),
        telegramBotService: asClass(TelegramBotService).scoped(),
        telegramCollectorService: asClass(TelegramCollectorService).scoped(),
        telegramSchedulerService: asClass(TelegramSchedulerService).scoped(),
        authService: asClass(AuthService).scoped(),
        summarizerService: asClass(SummarizerService).scoped(),
        feedSourceService: asClass(FeedSourceService).scoped(),
        telegramLinkService: asClass(TelegramLinkService).scoped(),
    });
}
