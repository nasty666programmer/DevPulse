# Monthly Topic Report — Design

Date: 2026-08-26
Status: Proposed
Prior discussion: `docs/ideas/2026-08-26-monthly-topic-report.md` (superseded by this doc)

## Purpose

Add a cumulative report a user can subscribe to for one existing
category (e.g. "AI"): starting the day they subscribe, the system
collects and summarizes matching RSS articles daily; at the end of one
month it synthesizes everything into a single report saved to the
user's cabinet.

Value: turns the product from "read today's digest" into something
with a reason to come back later — an artifact that can be reread,
referenced, or shared, which the product currently has no equivalent
of.

## Decided

Carried over from the prior discussion, plus one correction found
while writing this spec:

- **Forward-only subscription**: accumulation starts at subscribe
  time, not retroactive. A retroactive option would require keeping
  daily summaries for every category for every user "just in case" —
  rejected as unnecessary cost for unclear demand.
- **Topic = existing `Category`** (`modules/categorization/interfaces`
  — `'Node.js' | 'Docker' | 'AWS' | 'DevOps' | 'AI' | 'Прочее'`), not
  free-text from the user. No new classification needed for the
  articles this applies to (see next point for the scope this is
  narrowed to).
- **v1 scope: RSS `feedItem`s only, not Telegram posts** — found
  while writing this spec: `category` is a field on `IFeedItem`,
  assigned by `categorizationService` inside
  `FeedService.saveFeedItem`, but `ITelegramPost` has no `category`
  field at all, and `telegramCollector` never calls
  `categorizationService`. The prior discussion's premise ("topic
  filtering is already solved by the existing category field") holds
  for RSS only. Extending it to Telegram is future work (see below),
  not silently assumed.
- **Delivery for v1: cabinet only** — saved to DB, shown in UI. Email
  is a later addition on top of a working report, not part of this
  design.
- **Subscription lifecycle: one-time, no auto-renewal** — simplest
  state machine; revisit only if users actually want to keep a
  subscription going.
- **Final synthesis: stay on the existing self-hosted BART pipeline**
  (`summarizer-service`, `facebook/bart-large-cnn`) rather than adding
  an instruction-following LLM call. Decided explicitly against
  quality: BART cannot follow a "structure this into trends and
  conclusions" instruction — the result is a compact reread of the
  month, not an analytical report with sections. Accepted trade-off
  because it avoids a new external dependency (cost, latency, a third
  party seeing user data). Revisit only if this compromise proves to
  disappoint users in practice (see Future work).

## Out of scope for v1

- Telegram posts (blocked on `telegramPost` having no `category` —
  separate piece of work, see Future work)
- Email delivery
- Multiple categories per subscription
- Auto-renewal / recurring subscriptions
- Retrospective (backward-looking) subscriptions
- Any instruction-LLM call (see Decided above)

## Data model

Three new Mongoose models, following the existing
`db/models/<domain>/`, `db/models/<domain>/interface/`,
`db/repositories/<domain>/` layout (mirrors `feed`/`telegram`/`digest`
today):

```
db/models/topicReport/
  subscription.ts / interface/subscription.ts
    { userId: ObjectId, category: Category, startDate: Date,
      endDate: Date, status: 'active' | 'completed' | 'failed' }
  dailySummary.ts / interface/dailySummary.ts
    { subscriptionId: ObjectId, date: Date, text: string }
    — unique index on (subscriptionId, date), one row per day.
  report.ts / interface/report.ts
    { subscriptionId: ObjectId, userId: ObjectId, category: Category,
      periodStart: Date, periodEnd: Date, content: string,
      generatedAt: Date }
db/repositories/topicReport/
  subscriptionRepository.ts, dailySummaryRepository.ts, reportRepository.ts
    — CRUD + the query methods the jobs below need (active
    subscriptions for today, subscriptions past endDate, upsert-by-day
    for dailySummary).
```

`endDate = startDate + 1 month`, computed once at subscribe time —
not recomputed, since there's no auto-renewal.

## Components

```
modules/topicReport/
  services/subscriptionService.ts   — subscribe(userId, category), reads/lists
  services/dailyAccumulationJob.ts  — the daily job (see Data flow, step 2)
  services/reportSynthesisJob.ts    — the end-of-period job (step 3), owns
                                       the map-reduce chunking below
  services/chunking.ts              — pure function: group strings into
                                       char-budget batches — unit-testable
                                       without any I/O
modules/scheduler/index.ts          — extended: two more cron.schedule()
                                       calls (daily accumulation, end-of-
                                       period check), same pattern as the
                                       existing RSS collection schedule
db/repositories/feed/feedItemRepository.ts
                                     — extended: a category+date-range query
                                       (today's matching items) — `getAll`
                                       and `getRecentByCategory` don't cover
                                       "published today" today
controller/topicReport/index.ts     — new: POST /topic-reports (subscribe),
                                       GET /topic-reports (list mine)
routes/topicReport.ts               — new
frontend/...                        — new: subscribe UI (category picker)
                                       + report list/detail view in cabinet
```

Reused as-is, no changes needed:
`FeedService.summarizeItem` (already programmatic, not
controller-bound — see `f01185fe`), `SummarizerProvider`,
`categorizationService` (only read from, not called — category is
already on the stored `feedItem`).

## Data flow

1. **Subscribe**: user picks one existing category → `POST
   /topic-reports` → creates a `subscription` with `status: 'active'`,
   `startDate: now`, `endDate: now + 1 month`.
2. **Daily accumulation job** (new cron tick, once/day): for each
   active subscription, query `feedItem`s with that `category`
   published today → for any without a `summary` yet, call
   `FeedService.summarizeItem` to get one (reuses the on-demand
   summarization path, now driven by the scheduler instead of a user
   click) → concatenate the day's item summaries into one string →
   upsert a `dailySummary` row for `(subscriptionId, today)`.
3. **End-of-period job** (new cron tick, checks daily for
   subscriptions whose `endDate` has passed and are still `active`):
   - Load all `dailySummary` rows for the subscription, ordered by
     date.
   - **Map**: group them into batches under a character budget
     (`~2800`, leaving headroom below the summarizer's 3000-char input
     cap) via the pure `chunking.ts` function, then call
     `SummarizerProvider.summarize` once per batch.
   - **Reduce**: concatenate the batch summaries. If the result is
     still over budget, repeat map+reduce on it. Recurses until one
     block remains — for a month (~30 short daily summaries) this is
     expected to take one or two passes, not an unbounded chain.
   - Save the final block as `report.content`, mark subscription
     `status: 'completed'`.
4. **View**: `GET /topic-reports` lists the user's subscriptions and
   any completed report content, shown in the cabinet.

## Error handling

- **Daily job, one item's summarization fails**: log and skip that
  item for the day (partial daily summary beats a stalled pipeline) —
  matches the existing "no cache write on failure, safe to retry
  later" behavior already in `FeedService.summarizeItem` /
  `SummarizerProvider`.
- **Daily job, no matching items on a given day**: no `dailySummary`
  row written for that day — the end-of-period job treats missing days
  as simply absent, not an error.
- **End-of-period job fails** (e.g. `summarizer-service` down for the
  whole run): subscription → `status: 'failed'`, visible to the user
  in the cabinet as a failed report rather than silently stuck
  `'active'` forever. No automatic retry in v1 — YAGNI until this
  proves to happen often enough to matter.

## Testing

- `chunking.ts`: unit tests, no I/O — batches respect the char budget,
  a single string over budget alone stays its own batch (doesn't loop
  forever trying to split further), empty input, exact-boundary input.
- `reportSynthesisJob`: unit tests with a mocked `SummarizerProvider` —
  single pass suffices vs. needs a second reduce pass, one batch
  fails mid-run.
- `dailyAccumulationJob`: unit tests with mocked
  `feedItemRepository`/`FeedService` — items with existing summaries
  are reused not re-summarized, one item failing doesn't stop the
  others, no matching items today writes nothing.
- Controller: integration test (supertest + awilix, existing pattern)
  for subscribe + list endpoints.

## Future work

- **Telegram posts**: add `category` to `ITelegramPost` and call
  `categorizationService` from `telegramCollector` (mirrors what
  `FeedService.saveFeedItem` already does for RSS) — only then extend
  subscriptions to cover Telegram sources too.
- **Richer synthesis via instruction-LLM** (the rejected variant B):
  revisit only if the BART-only report's lack of structure
  (trends/conclusions) turns out to actually disappoint users in
  practice, not preemptively — a single call per subscription per
  month keeps the cost/risk of adding it low whenever that's
  reconsidered.
- **Email delivery**, **auto-renewal**, **multiple categories per
  subscription**: each a separate, independently scoped addition on
  top of a working v1, not bundled in now.
