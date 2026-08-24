# Article/Post Summarization (self-hosted HuggingFace) — Design

Date: 2026-08-25
Status: Proposed (revised: lazy/on-demand instead of batch-at-collection)

## Purpose

Add short AI-generated summaries to RSS articles and Telegram posts,
using a self-hosted, pre-trained HuggingFace summarization model (no
fine-tuning) rather than a paid LLM API. Generated **on demand** —
a "Саммаризировать" button on the article/post card, only when a
reader actually asks for one — not for every collected item up front.
Once generated, the result is cached on the item itself, so a second
click (by the same or a different reader) is free.

This is a deliberate choice over batch-at-collection: it ties
inference cost/load to actual reading, not to collection volume —
directly addresses the earlier concern that per-user source
personalization (each user's own mix of sources, a separate future
design) would otherwise make article volume — and therefore
summarization cost — scale with the user base rather than a shared
catalog.

Out of scope for this iteration (deliberately): per-user source
personalization/subscriptions (this doc only assumes it's coming,
doesn't build it), fine-tuning a model on DevPulse's own content (only
revisit if the pre-trained candidate's quality proves insufficient —
see Model selection), batch/eager summarization at collection time
(chosen against — see Purpose).

## Constraint that shapes this design

The backend is Node/TypeScript; HuggingFace's `transformers` library is
Python-only (no TF.js/ONNX path that avoids reintroducing most of the
same complexity). Summarization can't live in-process in the existing
`backend` service — it needs its own small Python service, called over
HTTP, synchronously, from a new per-item backend endpoint while the
reader waits. That's the one new moving part this design adds;
everything else (schema field, new endpoints, the button) stays inside
existing patterns.

## Model selection (do this before any code)

Compare at least two pre-trained candidates —
`sshleifer/distilbart-cnn-12-6` (small, fast, the default guess) and
`facebook/bart-large-cnn` (larger, likely better quality, slower) —
against a sample of real, already-collected DevPulse content (~15-20
items pulled from the existing dev Mongo `feeditems` /
`telegramposts` collections, spanning a few categories). Run this as a
throwaway local script (Python + `transformers`, CPU is fine for a
one-off comparison) — not wired into the app yet. Judge on: factual
accuracy (no hallucinated specifics), whether it reads like the source
content (dev/tech, often terse Telegram posts) rather than generic
news-wire prose, **and latency on CPU** — this now matters more than
before, since a reader is waiting on the response synchronously rather
than a background batch job. Pick one model as the actual default
before writing the service; record the loser and why in this doc's
status rather than silently dropping the comparison.

## Components

```
summarizer-service/                          — new: standalone Python (FastAPI), own repo dir + Dockerfile
  main.py                                      — POST /summarize {text: string} -> {summary: string}
  Dockerfile                                   — python:3.12-slim, transformers + torch (CPU) + fastapi/uvicorn
providers/summarizer/SummarizerProvider.ts    — new: Node-side HTTP client for summarizer-service
modules/summarizer/services/index.ts           — new: thin wrapper, timeout + error handling
controller/feed/index.ts                       — extended: POST /feed/items/:id/summary
controller/telegramController/index.ts          — extended: POST /telegram/posts/:id/summary
db/repositories/feed/feedItemRepository.ts      — extended: findById, setSummary(id, summary)
db/repositories/telegram/telegramPostRepository.ts — extended: findById, setSummary(id, summary)
db/models/feed/feedItem.ts                      — extended: summary: string | null
db/models/telegram/telegramPost.ts              — extended: summary: string | null
modules/config/index.ts                         — new: SUMMARIZER_SERVICE_URL, SUMMARIZER_TIMEOUT_MS
frontend/src/components/ArticleCard.tsx         — extended: "Саммаризировать" button, loading/error/result states
frontend/src/components/TelegramPostCard.tsx    — extended: same, for posts
frontend/src/api/feed.ts, api/telegram.ts       — extended: summarizeFeedItem(id) / summarizeTelegramPost(id)
```

RSS/Telegram collectors themselves are untouched — no call to the
summarizer happens at collection time anymore.

## Data flow

1. Item is collected and stored exactly as today; `summary` starts
   `null`.
2. Reader sees a "Саммаризировать" button on the card (only shown
   when `summary` is empty and there's enough `content`/`text` to be
   worth summarizing).
3. Click → `POST /feed/items/:id/summary` (or the Telegram
   equivalent). Backend looks the item up by id:
   - `summary` already set → return it immediately, no call to
     `summarizer-service` (cache hit).
   - `summary` unset → call `summarizerService.summarize(text)`
     (Node → HTTP → Python service), persist the result on the item,
     return it.
4. Frontend replaces the button with the returned summary; a loading
   state covers the request, an error state (with a manual retry
   button) covers failure.
5. `FeedItemDto` / `TelegramPostDto` gain a `summary: string | null`
   field.

## Error handling

- Summarizer service unreachable/times out
  (`SUMMARIZER_TIMEOUT_MS`, suggest ~15s — generous since there's no
  batch queue behind it, just one reader waiting): endpoint responds
  503, `summary` is **not** cached as a failure (stays `null` so a
  retry can succeed later). Frontend shows an inline error + retry
  button — this is now a user-initiated action, so failure surfaces
  to the user instead of being silently logged and skipped.
- Empty/too-short `content`/`text`: endpoint responds 400 without
  calling the service; the button is also hidden client-side for such
  items as the simpler common-case guard.
- Double-click / duplicate in-flight request: not specially
  de-duplicated server-side for now (YAGNI at this scale) — the
  button disables itself while its own request is in flight, which
  covers the common case; revisit only if double-submission from
  multiple tabs turns out to be a real problem.

## Resource planning (shared single k3s node)

Everything today runs on one Hetzner-class node with fairly small
per-pod requests (backend: 50m CPU / 128Mi requests, 500m / 512Mi
limits — see `pulsedev-infra/k8s/base/backend-deployment.yaml`). A HF
model + `transformers` + CPU-only `torch` is a different resource
profile — model weights alone are roughly 300MB–1.6GB depending on the
candidate, plus framework overhead. On-demand load is bursty and
request-shaped (one reader, one click) rather than a scheduled batch
spike touching every collected item — likely lighter on average than
the batch design would have been, but each request still needs to
finish in a time a person will tolerate waiting on a button. Start
with generous, explicit requests/limits (e.g. `500m`/`1Gi` requests,
`1500m`/`2Gi` limits — refine once the model-selection step settles
the actual model) and watch real usage in the existing Grafana/Loki
stack before tightening.

## Deployment plan

1. New repo dir `summarizer-service/` in `DevPulse` (own `Dockerfile`,
   own `requirements.txt`).
2. `pulsedev-infra`: new `k8s/base/summarizer-deployment.yaml` +
   `summarizer-service.yaml` (ClusterIP, not exposed via Ingress —
   internal-only, called by `backend` over the cluster network).
3. `backend-config` ConfigMap gets
   `SUMMARIZER_SERVICE_URL=http://summarizer-service:8000` (in-cluster
   DNS, mirrors the existing `mongo-service`/`backend-service`
   pattern).
4. Extend `DevPulse/.github/workflows/deploy.yml`: a new
   `docker/build-push-action` step for `summarizer-service`, same
   `:latest` + `:sha-<short>` tagging as backend/frontend.
5. Extend `pulsedev-infra/.github/workflows/deploy.yml`'s SSH script:
   `kubectl apply -k` (picks up the new manifests) + a new
   `kubectl set image deployment/summarizer-service ...` +
   `kubectl rollout status` line, alongside the existing
   backend/frontend ones.
6. First rollout: deploy the service alone, verify a `/health`-style
   readiness probe before wiring any endpoint to call it (mirrors how
   `backend`'s own `readinessProbe` already gates traffic).

## Rollout sequencing

1. Model comparison (throwaway script, no deployment) → pick the
   model.
2. Build + deploy `summarizer-service` alone; confirm it's reachable
   in-cluster and healthy.
3. Wire `POST /feed/items/:id/summary` + the button on `ArticleCard`
   first (RSS — simpler, cleaner text than Telegram posts) — verify
   quality and click-to-result latency in prod on real traffic.
4. Wire the Telegram equivalent (`POST /telegram/posts/:id/summary` +
   `TelegramPostCard` button) the same way.

## Testing

Mirrors existing patterns:
- `SummarizerProvider` / `modules/summarizer` service: unit tests with
  a mocked HTTP call — success, timeout, non-200, malformed response —
  matching how other providers/services in this codebase are tested
  (interface-mocked, no real network).
- Feed/Telegram controller integration tests (supertest + awilix,
  existing pattern): cache-hit (item already has `summary`, service
  never called), cache-miss success (service called, `summary`
  persisted and returned), and failure (503, `summary` stays `null`).
- `summarizer-service` itself (Python): not part of this repo's
  vitest suite — a lightweight `pytest` smoke test (input → non-empty
  string output) inside `summarizer-service/`, run in its own CI step.
- Frontend: no automated test infra in this project currently
  (matches the rest of the frontend) — verify the button's
  loading/result/error states manually against a real backend before
  calling either card done.
