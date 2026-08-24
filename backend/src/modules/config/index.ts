const DEFAULT_FEED_SOURCES = [
    'https://news.ycombinator.com/rss',
    'https://www.reddit.com/r/programming/.rss',
    'https://nodeweekly.com/rss',
];

const DEFAULT_RSS_CRON_SCHEDULE = '0 * * * *';
const DEFAULT_TELEGRAM_CRON_SCHEDULE = '*/30 * * * *';
const DEFAULT_TELEGRAM_POSTS_PER_CHANNEL_LIMIT = 5;
const DEFAULT_RSS_FETCH_CONCURRENCY = 3;
const DEFAULT_PORT = 3000;
const DEFAULT_ITEMS_LIMIT = 20;
const DEFAULT_FEEDS_PAGE_SIZE = 5;
const DEFAULT_SESSION_COOKIE_NAME = 'devpulse_session';
const DEFAULT_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';

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

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
    if (raw === undefined) {
        return fallback;
    }

    return raw !== 'false';
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
    // Caps how many of a channel's most-recent posts are considered per
    // collect() run — t.me/s/<username> can return more than this, and we
    // only want the freshest ones, not the whole visible history each time.
    get telegramPostsPerChannelLimit(): number {
        return parsePositiveInt(
            process.env.TELEGRAM_POSTS_PER_CHANNEL_LIMIT,
            DEFAULT_TELEGRAM_POSTS_PER_CHANNEL_LIMIT
        );
    },
    get logLevel(): string {
        return process.env.LOG_LEVEL || 'info';
    },
    // OAuth client ID from Google Cloud Console — also the JWT audience the
    // frontend's ID token must carry. No fallback: GoogleAuthProvider would
    // silently reject every sign-in against an empty audience if this were
    // left unset, so let a missing value surface as an obvious empty string
    // rather than a plausible-looking default.
    get googleClientId(): string {
        return process.env.GOOGLE_CLIENT_ID || '';
    },
    // Secret used to sign/verify our own session cookie (a JWT carrying just
    // the user id) — unrelated to Google's keys, which google-auth-library
    // fetches and verifies against on its own.
    get sessionSecret(): string {
        return process.env.SESSION_SECRET || '';
    },
    get sessionCookieName(): string {
        return process.env.SESSION_COOKIE_NAME || DEFAULT_SESSION_COOKIE_NAME;
    },
    get sessionMaxAgeMs(): number {
        return parsePositiveInt(process.env.SESSION_MAX_AGE_MS, DEFAULT_SESSION_MAX_AGE_MS);
    },
    // Only disable for local http:// dev — browsers drop `Secure` cookies
    // over plain http, which would otherwise break sign-in outside https.
    get cookieSecure(): boolean {
        return parseBoolean(process.env.COOKIE_SECURE, true);
    },
    // Credentialed CORS requires one explicit origin — an "*" wildcard is
    // rejected by browsers whenever credentials: 'include' is used.
    get corsOrigin(): string {
        return process.env.CORS_ORIGIN || DEFAULT_CORS_ORIGIN;
    },
};

export default config;
