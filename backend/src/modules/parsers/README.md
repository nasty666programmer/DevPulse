# Article extraction module

Given RSS feed items (`{ title, link, description, pubDate, ... }`), this module
fetches each `link`, downloads the HTML and extracts the main article content
(no menus/ads/footers) using [`@mozilla/readability`](https://github.com/mozilla/readability)
running against a [`jsdom`](https://github.com/jsdom/jsdom) document.

Files:
- `interfaces/index.ts` — shared types (`FeedItem`, `ExtractedArticle`, `ProcessedFeedItem`, options).
- `errors.ts` — `HttpStatusError`, `BlockedError`, `TimeoutError`, `NetworkError`.
- `services/extractArticle.ts` — fetch + parse a single URL.
- `services/processFeedItems.ts` — batch-process feed items with concurrency, delay, retry and fallback.
- `services/htmlParser.ts` — existing DI service, now delegates to `extractArticle`.

## `extractArticle(url, options?)`

```ts
import { extractArticle } from './src/modules/parsers/services/extractArticle.js';

const article = await extractArticle('https://example.com/post');
// article: { title, textContent, contentHtml, excerpt, siteName, length } | null
```

Behavior:
- Realistic desktop Chrome `User-Agent`, 10s timeout (`AbortController`) by default.
- Detects `content-type` charset; non-UTF-8 responses (e.g. `windows-1251`) are
  decoded via `iconv-lite`.
- Cross-domain redirects are logged as a warning but followed (result is extracted
  from the final page).
- Throws instead of returning a value on failure, so the caller can distinguish cases:
  - `BlockedError` — HTTP 403/429 (User-Agent blocking / rate limiting).
  - `HttpStatusError` — any other non-2xx status (404, 500, ...).
  - `TimeoutError` — request exceeded `timeoutMs`.
  - `NetworkError` — DNS/connection failure.
- Returns `null` (does not throw) when the fetch succeeds but Readability could not
  find article content.
- One automatic retry (500ms backoff) for `TimeoutError` / `NetworkError` only —
  never retries 403/404/etc. Disable via `{ retryOnNetworkError: false }`.

Options: `{ timeoutMs?: number; userAgent?: string; retryOnNetworkError?: boolean }`.

## `processFeedItems(items, options?)`

```ts
import { processFeedItems } from './src/modules/parsers/services/processFeedItems.js';

const enriched = await processFeedItems(feedItems, {
  concurrency: 3,      // default 3, via p-limit
  delayMinMs: 300,     // default 300
  delayMaxMs: 500,     // default 500
  timeoutMs: 10_000,
  onError: (url, err) => { /* optional extra logging/metrics */ },
});
```

For each item it adds:
- `fullText: string` — plain text of the extracted article, or fallback text.
- `cleanHtml: string` — extracted article HTML, or the raw fallback HTML.
- `extractionStatus: 'ok' | 'fallback' | 'blocked' | 'error'`
  - `ok` — Readability extracted the article successfully.
  - `fallback` — page fetched fine but Readability found no article content;
    used `item['content:encoded']` → `item.content` → `item.description` →
    `item.contentSnippet` instead.
  - `blocked` — site returned 403/429; same fallback content is used.
  - `error` — any other failure (missing link, 404, timeout, network error, ...);
    same fallback content is used.
- `extractionError?: string` — present for `blocked`/`error`.

A failure on one item never rejects the whole batch — errors are caught, logged
to `console.error` (and optionally to `options.onError`), and the item falls
back to its RSS description/content.

## CLI (`bin/extract.ts`)

```bash
# Extract a single URL and print to stdout
npm run extract -- "https://example.com/post"

# Extract a single URL and save to a file
npm run extract -- "https://example.com/post" --out output.json

# Process a JSON array of feed items (same shape as rss-parser output)
npm run extract -- items.json --out output.json --concurrency 3
```
