# Article/Post Summarization (self-hosted HuggingFace) — Design

Date: 2026-08-25
Status: Proposed — model selected: `facebook/bart-large-cnn` (see Model selection)

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
(chosen against — see Purpose), Russian/Ukrainian-language
summarization (see Future work — `bart-large-cnn` is English-only;
this ships English-only first).

## Constraint that shapes this design

The backend is Node/TypeScript; HuggingFace's `transformers` library is
Python-only (no TF.js/ONNX path that avoids reintroducing most of the
same complexity). Summarization can't live in-process in the existing
`backend` service — it needs its own small Python service, called over
HTTP, synchronously, from a new per-item backend endpoint while the
reader waits. That's the one new moving part this design adds;
everything else (schema field, new endpoints, the button) stays inside
existing patterns.

## Model selection — done, `bart-large-cnn` chosen

Compared `sshleifer/distilbart-cnn-12-6` vs `facebook/bart-large-cnn`
on 8 real feed items from the local dev Mongo (`feeditems` — the local
`telegramposts` collection was empty at test time, so the Telegram
side of this comparison is still outstanding; re-run once there's real
Telegram content to sample), each truncated to the first 3000 input
characters (see input-length caveat below), via a throwaway local
script (kept out of the repo — not committed).

**Result: `bart-large-cnn` wins on quality**, consistently more
coherent and more faithful to source structure (e.g. correctly
preserved a "Part 1/2/3" structure `distilbart` dropped). More
importantly, `distilbart-cnn-12-6` produced one outright incoherent,
repeating/hallucinated output on one of the 8 samples ("The 'Tourist
Prompt' is what I call the 'Guid Tourist Prompt") — a real quality
risk for a live, user-facing feature, not just a style preference.
`bart-large-cnn` had no comparable failure across the sample.

Cost of the win: `bart-large-cnn` is slower (**6-12s** observed per
summary on the dev machine's CPU, vs `distilbart`'s 5-7s) and heavier
on disk (~1.63GB model weights vs `distilbart`'s ~1.2GB). Accepted —
this is a synchronous, user-initiated click with a loading state (see
Data flow), so the extra few seconds cost UX patience, not correctness,
and correctness is what `distilbart` failed on.

**Input-length caveat found during testing:** neither model was fed
more than the first 3000 characters of the source text in this
comparison (BART's position embeddings cap around 1024 tokens; feeding
more crashes with an `IndexError`, which is what surfaced this). One
tested article was 16,366 characters — its summary was necessarily
based on roughly the first fifth of the piece only. Whether this
matters depends on how long real collected items typically run;
revisit with chunked/map-reduce summarization only if long articles
turn out to be common and the intro-only summary proves misleading in
practice — not addressed by this design as written.

**Latency caveat for prod:** the 6-12s figures above were measured on
a full desktop CPU, not the shared k3s node's constrained per-pod CPU
limit (see Resource planning — `1500m` limit, i.e. at most 1.5 cores).
Expect real latency in prod to run slower than the dev measurement;
confirm actual p95 after the first rollout (step 2 in Rollout
sequencing) before treating `SUMMARIZER_TIMEOUT_MS` as tuned.

## Components

```
summarizer-service/                          — new: standalone Python (FastAPI), own repo dir + Dockerfile
  main.py                                      — POST /summarize {text: string} -> {summary: string}
                                                  model: facebook/bart-large-cnn (pipeline("summarization", ...))
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
profile — `bart-large-cnn`'s weights alone are ~1.63GB on disk
(measured), plus `torch`/`transformers` framework overhead on top; the
pod needs enough memory headroom to load that and run inference
without getting OOMKilled. On-demand load is bursty and request-shaped
(one reader, one click) rather than a scheduled batch spike touching
every collected item — likely lighter on average than the batch design
would have been, but each request still needs to finish in a time a
person will tolerate waiting on a button, and dev-machine latency
(6-12s) won't directly transfer to the node's constrained CPU limit
(see the Latency caveat in Model selection). Start with generous,
explicit requests/limits (e.g. `500m`/`2.5Gi` requests, `1500m`/`3Gi`
limits — the memory numbers bumped up from the original estimate now
that the model's real size is known) and watch real usage in the
existing Grafana/Loki stack before tightening.

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

1. ~~Model comparison~~ — done, `bart-large-cnn` selected (see Model
   selection).
2. Build + deploy `summarizer-service` alone; confirm it's reachable
   in-cluster and healthy.
3. Wire `POST /feed/items/:id/summary` + the button on `ArticleCard`
   first (RSS — simpler, cleaner text than Telegram posts) — verify
   quality and click-to-result latency in prod on real traffic.
4. Wire the Telegram equivalent (`POST /telegram/posts/:id/summary` +
   `TelegramPostCard` button) the same way.

## Future work: Russian (and possibly Ukrainian) support

`bart-large-cnn` is English-only — it doesn't meaningfully summarize
Russian or Ukrainian text, this is a model limitation, not a config
option. Once the English-only rollout above has shipped and is
validated, add a second model rather than replacing the first:

- Candidate: `csebuetnlp/mT5_multilingual_XLSum` — trained for
  summarization across ~45 languages including Russian. **Verify
  Ukrainian coverage on the model card before relying on it** — not
  confirmed as of this doc.
- `summarizer-service` loads both models (two `pipeline(...)`
  instances in the same process) and picks one per request via a
  language-detection step (e.g. `langdetect`/`fasttext` on the input
  text, or a language hint passed from the caller if the source's
  language is already known) — one service, not a second deployment,
  unless combined memory footprint forces that later.
- Needs its own model comparison on real Russian/Ukrainian content
  from this app's actual sources before committing, exactly like the
  English decision in Model selection above — do not assume
  `mT5_multilingual_XLSum`'s quality without testing it here.
- Resource impact: two models loaded at once roughly doubles memory
  footprint versus the single-model numbers in Resource planning —
  re-measure and re-budget node resources once this is built, don't
  assume the existing `2.5Gi`/`3Gi` figures still hold.

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
