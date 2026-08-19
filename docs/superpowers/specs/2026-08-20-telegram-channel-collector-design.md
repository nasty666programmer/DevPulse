# Telegram Channel Collector — Design

Date: 2026-08-20
Status: Approved

## Purpose

Replace the `TelegramProvider.fetch()` stub with a real content-capture
pipeline for Telegram channels the user has registered via the bot
(`TelegramBotService`, already implemented). Result: periodically
collected posts from public Telegram channels, stored in Mongo, fully
isolated from the RSS/digest pipeline (separate module, separate DB
collections, separate cron, no shared files).

Out of scope for this iteration (deliberately): summary/digest
generation over collected posts, the frontend "Telegram" tab, and
downloading/storing media files (only `mediaUrls` are captured, not
the files themselves).

## Constraint that shapes this design

The Telegram Bot API cannot backfill channel history, and only
delivers `channel_post` updates for channels where the bot is an
admin. Instead, this design pulls from the public, unauthenticated
HTML preview Telegram serves for any public channel at
`https://t.me/s/<username>` (the same surface used for link previews).
It exposes the channel's most recent posts (a rolling window, not full
history) and requires no bot membership, no token scope, nothing
beyond a public `username`. It is an unofficial surface — not part of
the documented Bot API — and could change without notice; channels
without a public `username` (private channels registered via a
forwarded message) are simply skipped by the collector, not backfilled
some other way.

This makes `TelegramProvider.fetch(username)` a genuine pull, matching
`RssProvider.fetch(url)` — `IProvider<TItem>` needs no changes.

## Components

```
providers/telegram/TelegramProvider.ts     — GET t.me/s/<username>, parse with cheerio → TelegramPost[]
modules/telegramBot/services/index.ts      — extended: register-by-username in addition to forwarded-message
modules/telegramCollector/services/index.ts — new: iterate registered channels, fetch, dedupe, persist
modules/telegramScheduler/index.ts         — new: own node-cron schedule, independent of RSS's
db/models/telegram/telegramPost.ts         — new collection
db/repositories/telegram/telegramPostRepository.ts
controller/telegramController/index.ts     — new: GET /telegram/collect (manual trigger)
```

No RSS-pipeline file is touched.

## Registration: username-text path (new)

`TelegramBotService` currently only handles `forward_origin.type ===
'channel'`. Add a second branch: any plain text message (no forward
origin) is tested against a username pattern — `@name`, `t.me/name`,
or bare `name` — using Telegram's username character rules
(`[a-zA-Z0-9_]{5,32}`). On a match:

1. Call Bot API `getChat(username)` — resolves the real numeric
   `channelId` and `title` (required by the existing `TelegramChannel`
   schema, where `channelId` is the unique key), and doubles as
   existence validation: if `getChat` throws, reply that the channel
   wasn't found.
2. Upsert via the existing `telegramChannelRepository.upsertByChannelId`
   — no repository changes needed.

Channels registered via a forwarded message may have `username: null`
(private channel). Those rows are kept (matches existing behavior) but
are skipped by the collector — nothing to scrape without a public
username.

## Data model and collection

```ts
interface ITelegramPost {
    channelId: number;
    messageId: number;
    text: string;
    publishedAt: Date;
    mediaUrls: string[];
}
```

Unique compound index on `(channelId, messageId)` — the dedup key,
same role `RawArticle.url` plays for RSS.

`TelegramCollectorService.collect()`:
- `Promise.allSettled` over every registered channel with a non-null
  `username`.
- For each: `telegramProvider.fetch(username)` → for each returned
  post, `telegramPostRepository.create(...)`, catching
  `isDuplicateKeyError` (already in `common/utils.ts`) to skip posts
  already stored.
- One channel failing (scrape error, parse error) is logged and does
  not abort the others — mirrors `RssCollectorServices.collect()`.

## Scheduling and API

`TelegramSchedulerService` mirrors `SchedulerService`: its own
`node-cron` task, gated by its own `isCollecting` re-entrancy guard,
started from `index.ts` alongside the existing RSS scheduler and bot
start, under the same `ENABLE_IN_PROCESS_SCHEDULER` flag. New config
key `TELEGRAM_CRON_SCHEDULE` (default: hourly) — deliberately
independent of `RSS_CRON_SCHEDULE`, and intentionally not aggressive
since `t.me/s/...` is an unofficial, unrate-limited-by-us surface.

`GET /telegram/collect` — manual trigger, same shape as the existing
`GET /rss/collect`.

## Error handling

- Invalid/nonexistent username at registration time: caught at
  `getChat()`, user gets a clear bot reply, nothing is written to
  Mongo.
- Scrape failure (network, non-200, unexpected HTML) for one channel
  during collection: logged, that channel's result is skipped, other
  channels still process (`Promise.allSettled`).
- Duplicate posts on re-collection: caught via `isDuplicateKeyError`,
  silently skipped (expected steady-state behavior, not an error).

## Testing

TDD throughout, mirroring existing test patterns in this codebase
(`rssCollectorService`, `telegramBotService` tests already follow this
shape):
- `TelegramProvider`: unit test against a saved sample `t.me/s/...`
  HTML fixture — parses expected posts, handles empty/malformed HTML.
- `TelegramBotService`: new tests for the username-text registration
  branch (valid `@name`, `t.me/name`, bare `name`, non-matching text,
  `getChat` failure).
- `TelegramCollectorService`: unit tests with mocked provider/repository
  — dedupe via duplicate-key error, one channel failing doesn't abort
  others, skips channels with `username: null`.
- `TelegramSchedulerService`: mirrors existing `SchedulerService` test
  coverage (start/stop, re-entrancy guard).
