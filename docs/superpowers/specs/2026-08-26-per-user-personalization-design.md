# Per-User Personalization (RSS sources + Telegram channels) — Design

Date: 2026-08-26
Status: Proposed

## Purpose

Today RSS sources come from one global `.env` list (`RSS_FEEDS`), and
Telegram channels are one shared global catalog added via the bot by
anyone — every account sees the same articles, same posts, same
digest. This closes the last major MVP gap: each user gets their own
sources and their own collected content.

## Foundational gap found while writing this design

`AuthService.verifySession(token)` (cookie → `IUserDocument`) exists
but is only ever called manually inside `AuthController.getCurrentUser`
(`GET /auth/me`). No Express middleware runs it on every request and
attaches a `userId` — every `feed`/`telegram`/`digest` route today is
fully unauthenticated, regardless of login state. Personalization is
impossible without this piece first; it's not optional infrastructure,
it's the prerequisite everything else in this doc depends on.

## Decided

- **Full per-user isolation**: each user's `feedItem`/`telegramPost`
  are their own copy, even when two users add the same source —
  chosen explicitly over a shared-catalog-plus-subscriptions model.
  Accepted consequence: if two users both add the same RSS feed, its
  articles are fetched/categorized/stored twice, and (later)
  summarized twice independently — no cross-user dedup or shared
  compute.
- **Refinement to the above, found while modeling this**: `rawArticle`
  (the parsed-HTML-content cache, deduped by URL today via
  `rawArticleRepository.findByUrl`) is an internal cache no user ever
  queries directly — only `feedItem` is user-facing. Proposal: keep
  `rawArticle` shared/deduped by URL (avoids redundant fetch+HTML-parse
  of the same page for every user who happens to add the same feed),
  while `feedItem` itself still gets one row per `(userId,
  rawArticleId)` — so isolation is real at the content/category/summary
  level users interact with, without also duplicating the expensive
  network+parse step. Flagging this explicitly since it wasn't part of
  the earlier full-isolation decision — say so if you'd rather
  duplicate `rawArticle` too for full symmetry.
- **RSS source input**: URL only. No user-supplied name — a source's
  display name comes from the fetched feed's own title (same idea
  already used for article titles).
- **No data migration**: existing global `feedItem`/`telegramPost`/
  `telegramChannel`/`digest`/`rawArticle` collections get wiped: dev
  data, nothing to preserve. Scheduler starts collecting fresh under
  the new per-user schema.
- **Telegram account linking**: user generates a one-time code in the
  cabinet, sends it to the bot, the bot binds that Telegram sender's
  id to their `userId`. Chosen over the Telegram Login Widget — no
  second OAuth flow, reuses the bot that already exists.
- **Scheduler stays a single global cron tick** for both RSS and
  Telegram — it now iterates every `(user, source)` / `(user's
  channel)` pair instead of a fixed list, through the same
  concurrency control already in place (`rssFetchConcurrency`). No
  per-user schedule — not a real need at current scale.

## Phasing

Two phases, sequenced so the harder problem (Telegram's identity
linking) doesn't block the simpler one:

- **Phase 1**: auth middleware (prerequisite for both) + RSS
  personalization end to end.
- **Phase 2**: Telegram account linking + Telegram personalization,
  built on the same `userId`-scoping pattern Phase 1 establishes.

Each phase is independently shippable and testable — mirrors how the
monthly-report design was scoped to RSS-only first for the same
reason.

## Data model

```
db/models/user/interface/user.ts        — MODIFY: + telegramUserId: number | null
db/models/feedSource/ (+ interface/)    — NEW: { userId, url, addedAt }
db/models/telegram/telegramChannel.ts   — MODIFY: + userId
db/models/feed/feedItem.ts              — MODIFY: + userId
db/models/telegram/telegramPost.ts      — MODIFY: + userId
db/models/digest/digest.ts              — MODIFY: + userId
db/models/telegramLinkCode/ (+interface/) — NEW: { userId, code, expiresAt }
  — short-lived (e.g. 10 min), not a field on user: it's ephemeral
  request state, not identity.
```

`rawArticle` — unchanged (stays shared/deduped by URL, see Decided
above).

Uniqueness/dedup keys that change:
- `feedItem`: was implicitly deduped via `rawArticle.findByUrl`
  short-circuiting before a `feedItem` was ever created. Now needs its
  own check/index on `(userId, rawArticleId)` — a shared `rawArticle`
  existing must no longer block a *different* user from getting their
  own `feedItem` for it.
- `telegramChannel`: `upsertByChannelId` today upserts globally by
  `channelId`. Needs to become `upsertByUserAndChannelId(userId,
  channelId, ...)` so two users can each hold their own record for the
  same underlying Telegram channel.
- `telegramPost`: dedup key moves from `(channelId, messageId)` to
  `(userId, channelId, messageId)` — `userId` comes from the owning
  `telegramChannel.userId` at collection time.

## Components

### Phase 1

```
middleware.ts or a new modules/auth/middleware.ts
  — NEW: requireAuth — reads the session cookie, calls
    AuthService.verifySession, attaches req.userId (401 if missing/invalid).
    Applied to feed/telegram/digest/topicReport/feedSource routes.

db/models/feedSource/, db/repositories/feedSource/          — NEW
modules/feedSource/services/index.ts                        — NEW: add(userId, url)/list(userId)/remove(userId, id)
controller/feedSource/index.ts, routes/feedSource.ts        — NEW:
  POST /feed-sources, GET /feed-sources, DELETE /feed-sources/:id

modules/rss/services/index.ts (RssCollectorServices.collect)  — MODIFY:
  iterate feedSourceRepository.listAll() (all users' sources) instead
  of config.feedSources; collectFromSource gains userId; digest
  regeneration becomes per-user (regenerate each affected user's
  digest at the end of the tick, not one global call).
modules/feed/services/index.ts (FeedService.saveFeedItem)     — MODIFY: + userId param
db/models/feed/feedItem.ts, db/repositories/feed/feedItemRepository.ts — MODIFY: + userId, new dedup check
db/models/digest/digest.ts, db/repositories/digest/digestRepository.ts — MODIFY: + userId, one digest per user

controller/feed/index.ts, controller/digest/index.ts          — MODIFY:
  read req.userId (from requireAuth), scope every query to it —
  GET /feed/items, GET /digest, POST /feed/items/:id/summary all
  become "mine only," not global.

frontend/... — NEW: feed-source management UI (add/remove URL) in the
  cabinet; existing feed/digest views need no visual change, just now
  implicitly scoped server-side.
```

### Phase 2

```
db/models/telegram/telegramChannel.ts, telegramPostRepository.ts — MODIFY: + userId, new dedup keys (see above)
db/models/telegramLinkCode/, db/repositories/telegramLinkCode/    — NEW
db/models/user/, db/repositories/user/userRepository.ts           — MODIFY: + telegramUserId, findByTelegramUserId, setTelegramUserId

controller/telegramLink/index.ts (or folded into an existing user
  controller), routes/telegramLink.ts                              — NEW:
  POST /users/me/telegram-link-code — generates+stores a code, returns it for display

modules/telegramBot/services/index.ts (TelegramBotService)         — MODIFY:
  handleMessage: recognize a link-code message first (before the
  existing channel-add handling) → validate against
  telegramLinkCodeRepository → setTelegramUserId(userId, ctx.from.id).
  registerForwardedChannel/registerChannelByUsername: look up the
  sender's userId via findByTelegramUserId(ctx.from.id) — if not
  linked, reply asking the user to link via the cabinet first instead
  of silently adding to a global list.

modules/telegramCollector/services/index.ts (TelegramCollectorService) — MODIFY:
  collectFromChannel passes channel.userId into telegramPostRepository.create.

controller/telegramController/index.ts                             — MODIFY:
  GET /telegram/posts, GET /telegram/channels scoped to req.userId.

frontend/... — NEW: "Привязать Telegram" flow in the cabinet
  (request a code, show it, instructions to send to the bot).
```

## Data flow

**Phase 1** — subscribe: `POST /feed-sources` (authenticated) → creates
a `feedSource` row for the user. Collection: the existing RSS cron tick
now loops every `(user, feedSource)` pair, fetches, categorizes, and
saves a `feedItem` owned by that user (deduped per-user via the new
`(userId, rawArticleId)` check, while `rawArticle` itself is still
fetched/parsed once and reused across users). At the end of the tick,
regenerate the digest for every user who had at least one source
collected this run. Reads: every `feed`/`digest` endpoint requires
`requireAuth` and filters by `req.userId`.

**Phase 2** — link: user requests a code in the cabinet → sends it to
the bot → bot resolves it to their `userId`, stores
`user.telegramUserId`. Add a channel: forwarding/username flow works
as today, but the resulting `telegramChannel` row is now owned by the
linked sender's `userId`; a message from an unlinked Telegram user
gets a "link your account first" reply instead of silently registering
a global channel. Collection: the Telegram cron tick iterates all
channels as today, but posts are saved under the owning channel's
`userId`. Reads: `telegram` endpoints require `requireAuth` and filter
by `req.userId`.

## Error handling

- `requireAuth` missing/invalid cookie → 401, no fallback to
  "anonymous"/global data — there is no anonymous read path left after
  this ships.
- Telegram message with an expired/unknown link code → bot replies
  that the code is invalid/expired, no partial linking.
- Telegram message from an unlinked sender attempting to add a channel
  → bot replies asking them to link first; the message is not silently
  dropped nor does it fall back to creating an ownerless channel.
- One user's source/channel failing during a collection tick behaves
  exactly as today's existing per-source/per-channel isolation
  (`Promise.allSettled`, one failure logged and skipped) — just scoped
  finer now (per `(user, source)` instead of per source).

## Testing

- `requireAuth` middleware: unit tests — valid cookie attaches
  `req.userId`, missing/invalid/expired cookie returns 401 without
  reaching the handler.
- `feedSourceService`/repository: unit + integration (supertest) —
  add/list/remove scoped to the authenticated user, one user can't see
  or delete another's sources.
- `RssCollectorServices.collect`: unit tests with mocked repositories
  — two users sharing the same source URL each get their own
  `feedItem`, `rawArticle` is fetched/parsed once and reused, one
  user's source failing doesn't affect another user's collection.
- `TelegramBotService`: unit tests for the link-code path — valid code
  links, expired/invalid code doesn't, an unlinked sender's channel-add
  attempt is rejected with the expected reply instead of registering a
  channel.
- `TelegramCollectorService`: unit test — post saved with the owning
  channel's `userId`, two users' channels for the same underlying
  Telegram channel produce two independent post sets.
- Controller integration tests (existing supertest+awilix pattern):
  every touched `feed`/`digest`/`telegram` endpoint — authenticated
  request scoped to caller only, unauthenticated request rejected.

## Future work

- Auto-seeding new users with a small set of default sources (today's
  `DEFAULT_FEED_SOURCES`) so the cabinet isn't empty on day one — left
  out of v1 deliberately, revisit if an empty first-run experience
  proves to be a real problem.
- Per-user source/channel limits (rate-limiting how many a single free
  account can add) — no such concern at current scale.
- Once this ships, `topicReportSubscription` (see
  `2026-08-26-monthly-topic-report-design.md`) needs its category
  query updated to also filter by `userId` — noted here as a
  dependency, not solved in this doc.
