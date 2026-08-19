const DEFAULT_FEED_SOURCES = [
    'https://news.ycombinator.com/rss',
    'https://www.reddit.com/r/programming/.rss',
    'https://nodeweekly.com/rss',
];

const DEFAULT_RSS_CRON_SCHEDULE = '0 * * * *';
const DEFAULT_TELEGRAM_CRON_SCHEDULE = '0 * * * *';
const DEFAULT_RSS_FETCH_CONCURRENCY = 3;
const DEFAULT_PORT = 3000;
const DEFAULT_ITEMS_LIMIT = 20;
const DEFAULT_FEEDS_PAGE_SIZE = 5;

/**
 * RSS_FEEDS supports either a flat array of URL strings, a flat array of
 * `{ name, url }` objects, or a categorized object of those (as already used
 * in this project's .env: `{ nodejs: [{ name, url }], javascript: [...] }`).
 * Recurses through arbitrary nesting and pulls out every `url`.
 */
function extractUrls(value: unknown): string[] {
    if (typeof value === 'string') {
        return [value];
    }

    if (Array.isArray(value)) {
        return value.flatMap(extractUrls);
    }

    if (value && typeof value === 'object') {
        if ('url' in value && typeof (value as { url: unknown }).url === 'string') {
            return [(value as { url: string }).url];
        }

        return Object.values(value as Record<string, unknown>).flatMap(extractUrls);
    }

    return [];
}

function parseFeedSources(raw: string | undefined): string[] {
    if (!raw) {
        return DEFAULT_FEED_SOURCES;
    }

    try {
        const urls = extractUrls(JSON.parse(raw));

        return urls.length > 0 ? urls : DEFAULT_FEED_SOURCES;
    } catch {
        // ignore malformed RSS_FEEDS, fall back to defaults
        return DEFAULT_FEED_SOURCES;
    }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Read process.env lazily (via getters) rather than once at module load: ESM
// import hoisting means this module can be evaluated before index.ts calls
// dotenv.config(), so a plain top-level read would always see an empty env.
const config = {
    get feedSources(): string[] {
        return parseFeedSources(process.env.RSS_FEEDS);
    },
    get rssCronSchedule(): string {
        return process.env.RSS_CRON_SCHEDULE || DEFAULT_RSS_CRON_SCHEDULE;
    },
    get rssFetchConcurrency(): number {
        return parsePositiveInt(process.env.RSS_FETCH_CONCURRENCY, DEFAULT_RSS_FETCH_CONCURRENCY);
    },
    get port(): number {
        return parsePositiveInt(process.env.PORT, DEFAULT_PORT);
    },
    get defaultItemsLimit(): number {
        return parsePositiveInt(process.env.DEFAULT_ITEMS_LIMIT, DEFAULT_ITEMS_LIMIT);
    },
    get feedsPageSize(): number {
        return parsePositiveInt(process.env.FEEDS_PAGE_SIZE, DEFAULT_FEEDS_PAGE_SIZE);
    },
    // undefined when unset — the bot only starts when this is actually configured
    // (see index.ts), rather than defaulting to some placeholder token.
    get telegramBotToken(): string | undefined {
        return process.env.TELEGRAM_BOT_TOKEN || undefined;
    },
    // Independent of RSS_CRON_SCHEDULE — t.me/s/<username> is an unofficial
    // page, not a rate-limited API we're meant to hit as often as RSS.
    get telegramCronSchedule(): string {
        return process.env.TELEGRAM_CRON_SCHEDULE || DEFAULT_TELEGRAM_CRON_SCHEDULE;
    },
};

export default config;
