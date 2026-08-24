# Article/Post Summarization (self-hosted HuggingFace) — Design

Date: 2026-08-25
Status: Proposed

## Purpose

Add short AI-generated summaries to collected RSS articles and Telegram
posts, using a self-hosted, pre-trained HuggingFace summarization model
(no fine-tuning) rather than a paid LLM API. Motivated by projected cost
once source selection becomes personalized per user (each user's own
mix of sources means article volume scales with the user base, not a
shared catalog — see prior discussion). Generated once per item at
collection time (batch), cached in Mongo, served to every reader
regardless of how many read it.

Out of scope for this iteration (deliberately): per-user source
personalization/subscriptions (a separate future design — this doc only
assumes it's coming, doesn't build it), fine-tuning a model on
DevPulse's own content (only revisit if the pre-trained candidate's
quality proves insufficient — see Model selection), on-demand/lazy
summarization (chosen against here in favor of batch-at-collection —
revisit if resource use on the shared node turns out to be a problem),
frontend UI to display the summary (a follow-up once the field exists
and quality is confirmed).

## Constraint that shapes this design

The backend is Node/TypeScript; HuggingFace's `transformers` library is
Python-only (no TF.js/ONNX path that avoids reintroducing most of the
same complexity). Summarization can't live in-process in the existing
`backend` service — it needs its own small Python service, called over
HTTP from the Node collectors. That's the one new moving part this
design adds; everything else (schema fields, collector call sites)
stays inside the existing Node codebase and its existing patterns.

## Model selection (do this before any code)

Compare at least two pre-trained candidates —
`sshleifer/distilbart-cnn-12-6` (small, fast, the default guess) and
`facebook/bart-large-cnn` (larger, likely better quality, slower) —
against a sample of real, already-collected DevPulse content (~15-20
items pulled from the existing dev Mongo `rawarticles` /
`telegramposts` collections, spanning a few categories). Run this as a
throwaway local script (Python + `transformers`, CPU is fine for a
one-off comparison) — not wired into the app yet. Judge on: factual
accuracy (no hallucinated specifics), whether it reads like the source
content (dev/tech, often terse Telegram posts) rather than generic
news-wire prose, and latency on CPU. Pick one model as the actual
default before writing the service; record the loser and why in this
doc's status rather than silently dropping the comparison.

## Components

```
summarizer-service/                          — new: standalone Python (FastAPI), own repo dir + Dockerfile
  main.py                                      — POST /summarize {text: string} -> {summary: string}
  Dockerfile                                   — python:3.12-slim, transformers + torch (CPU) + fastapi/uvicorn
providers/summarizer/SummarizerProvider.ts    — new: Node-side HTTP client for summarizer-service
modules/summarizer/services/index.ts           — new: thin wrapper, timeout + error handling
modules/parsers/services/processFeedItems.ts  — extended: call summarizer after extraction, before save
modules/telegramCollector/services/index.ts    — extended: call summarizer after fetch, before save
db/models/feed/rawArticle.ts + feedItem.ts     — extended: summary: string | null
db/models/telegram/telegramPost.ts             — extended: summary: string | null
modules/config/index.ts                        — new: SUMMARIZER_SERVICE_URL, SUMMARIZER_TIMEOUT_MS
```

No existing collector's control flow shape changes — summarization is
an added step inside the existing per-item save path, not a new
pipeline stage.

## Data flow

1. RSS/Telegram collector fetches + extracts an item, exactly as today.
2. Before persisting, the collector calls
   `summarizerService.summarize(text)` (Node → HTTP → Python service).
3. On success: `summary` is saved alongside the item. On
   failure/timeout: `summary: null`, item is still saved —
   summarization is a value-add, never a collection blocker (mirrors
   how one failing RSS/Telegram source doesn't abort the others today).
4. `FeedItemDto` / `TelegramPostDto` gain an optional `summary` field;
   existing consumers (frontend) ignore it until wired up in a
   follow-up.

## Error handling

- Summarizer service unreachable/times out (`SUMMARIZER_TIMEOUT_MS`,
  suggest 10s given CPU inference): logged, `summary: null`, collection
  continues — same "degrade, don't block" pattern as the rest of the
  collection pipeline.
- Malformed/empty extracted text: skip the call entirely (nothing
  useful to summarize), `summary: null`.
- Service crash-loops: collectors keep working with `summary: null`
  for every item until it's back — no hard dependency introduced on
  the critical path (RSS/Telegram collection itself never depended on
  this service).

## Resource planning (shared single k3s node)

Everything today runs on one Hetzner-class node with fairly small
per-pod requests (backend: 50m CPU / 128Mi requests, 500m / 512Mi
limits — see `pulsedev-infra/k8s/base/backend-deployment.yaml`). A HF
model + `transformers` + CPU-only `torch` is a different resource
profile — model weights alone are roughly 300MB–1.6GB depending on the
candidate, plus framework overhead. Start with generous, explicit
requests/limits (e.g. `500m`/`1Gi` requests, `1500m`/`2Gi` limits —
refine once the model-selection step settles the actual model) and
watch real usage in the existing Grafana/Loki stack before tightening.
If the node can't comfortably hold it alongside Mongo/backend/frontend/
Grafana/Loki, that's a signal to size up the node or move this one
service elsewhere — decide with real numbers, not a guess made here.

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
   readiness probe before wiring any collector to call it (mirrors how
   `backend`'s own `readinessProbe` already gates traffic).

## Rollout sequencing

1. Model comparison (throwaway script, no deployment) → pick the
   model.
2. Build + deploy `summarizer-service` alone; confirm it's reachable
   in-cluster and healthy.
3. Wire into ONE collector first (RSS — simpler, cleaner text than
   Telegram posts) behind an `ENABLE_AI_SUMMARY` config flag (default
   off) — verify quality and resource use in prod on real traffic
   before enabling the second collector.
4. Wire into Telegram collection.
5. Frontend display of `summary` — separate follow-up design once the
   field is populated and quality is confirmed.

## Testing

Mirrors existing patterns:
- `SummarizerProvider` / `modules/summarizer` service: unit tests with
  a mocked HTTP call — success, timeout, non-200, malformed response —
  matching how other providers/services in this codebase are tested
  (interface-mocked, no real network).
- Collector integration: existing `processFeedItems` /
  `TelegramCollectorService` tests extended to cover `summary: null`
  on summarizer failure without blocking the save (mirrors the
  existing "one channel failing doesn't abort others" test shape).
- `summarizer-service` itself (Python): not part of this repo's
  vitest suite — a lightweight `pytest` smoke test (input → non-empty
  string output) inside `summarizer-service/`, run in its own CI step.
