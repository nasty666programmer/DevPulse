# Article/Post Summarization Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship on-demand, cached AI summaries ("Саммаризировать" button) for RSS feed items and Telegram posts, backed by a new self-hosted `summarizer-service` (Python/FastAPI, `facebook/bart-large-cnn`) called synchronously from the Node backend.

**Architecture:** A new standalone `summarizer-service/` (FastAPI, one `POST /summarize`) is called over HTTP by a new `SummarizerProvider`/`SummarizerService` pair in the existing Node/TypeScript `backend`. Two existing controllers (`FeedController`, `TelegramController`) each gain one new endpoint that looks an item up by id, returns a cached `summary` if present, otherwise calls the summarizer and persists the result. Two existing cards (`ArticleCard`, `TelegramPostCard`) gain a button that triggers this endpoint and renders loading/result/error states. RSS/Telegram collection itself is untouched — nothing calls the summarizer at collection time.

**Tech Stack:** Backend: Node/TypeScript, Express, Mongoose, awilix DI, `node-fetch`, Vitest+Supertest. Summarizer service: Python 3.12, FastAPI, `transformers`+`torch` (CPU), pytest. Frontend: React/TypeScript, plain CSS (design tokens in `index.css`), no test infra (manual verification).

**Spec:** `docs/superpowers/specs/2026-08-25-hf-summarization-design.md`

## Global Constraints

- Model is fixed: `facebook/bart-large-cnn` (already chosen and benchmarked in the spec — do not re-litigate or swap models in this plan).
- English-only this iteration. Do not add language detection or a second model — that's explicitly future work in the spec.
- Summarization stays **synchronous and on-demand**, triggered only by a reader clicking the button. Never call the summarizer at collection time (RSS/Telegram collectors stay untouched).
- Truncate summarizer input to the first 3000 characters server-side (Python), per the spec's input-length caveat (BART's ~1024-token position-embedding cap).
- `SUMMARIZER_TIMEOUT_MS` default: `15000` (15s) — generous, no batch queue behind it.
- A failed/timed-out summarization must **not** be cached — `summary` stays `null` so a retry can succeed later.
- `MIN_SUMMARIZABLE_LENGTH = 200` (characters) — the shared "is this worth summarizing" threshold. Lives once in the backend (`modules/summarizer/interfaces/index.ts`) and is duplicated by hand in each frontend card (same convention already used for the `Category` union between backend and `frontend/src/types.ts` — comment both sides so they're kept in sync deliberately, not accidentally).
- Button copy (Russian, exact strings): trigger `"Саммаризировать"`, loading `"Саммаризация…"`, retry `"Повторить"`.
- This plan covers the `DevPulse` repo only (`backend/`, `frontend/`, new `summarizer-service/`, `docker-compose.yml`). The `pulsedev-infra` Kubernetes/CI rollout (spec's "Deployment plan" steps 2–5) is a **separate repo and a separate plan** — out of scope here; do not attempt it as part of this plan.
- No automated frontend test infra exists in this project — the two frontend tasks end in an explicit manual-verification step, not an automated one.

---

## File Structure

```
summarizer-service/                                     — NEW
  main.py                                                — FastAPI app: GET /health, POST /summarize
  requirements.txt
  requirements-dev.txt
  Dockerfile
  tests/test_main.py                                     — pytest smoke test

backend/src/
  modules/config/index.ts                                — MODIFY: + summarizerServiceUrl, summarizerTimeoutMs
  providers/summarizer/
    errors.ts                                             — NEW: SummarizerTimeoutError, SummarizerUnavailableError
    interface/summarizerProvider.ts                       — NEW: ISummarizerProvider
    SummarizerProvider.ts                                 — NEW: node-fetch HTTP client
  providers/container.ts                                  — MODIFY: register summarizerProvider
  modules/summarizer/
    interfaces/index.ts                                   — NEW: ISummarizerService, MIN_SUMMARIZABLE_LENGTH, isSummarizable
    services/index.ts                                     — NEW: SummarizerService (thin wrapper)
  modules/container.ts                                    — MODIFY: register summarizerService
  db/models/feed/interface/feedItem.ts                    — MODIFY: + summary
  db/models/feed/feedItem.ts                               — MODIFY: + summary schema field
  db/models/telegram/interface/telegramPost.ts             — MODIFY: + summary
  db/models/telegram/telegramPost.ts                       — MODIFY: + summary schema field
  db/repositories/feed/interface/feedItemRepository.ts     — MODIFY: + findById, setSummary
  db/repositories/feed/feedItemRepository.ts                — MODIFY: + findById, setSummary
  db/repositories/telegram/interface/telegramPostRepository.ts — MODIFY: + findById, setSummary
  db/repositories/telegram/telegramPostRepository.ts         — MODIFY: + findById, setSummary
  modules/feed/mappers.ts                                  — MODIFY: mapPopulatedFeedItem + summary
  controller/feed/index.ts                                 — MODIFY: + summarizeItem
  controller/telegramController/index.ts                    — MODIFY: + summarizePost, toPostDto + summary
  routes/feed.ts                                            — MODIFY: + POST /items/:id/summary
  routes/telegram.ts                                        — MODIFY: + POST /posts/:id/summary
  openapi.ts                                                — MODIFY: + summary field, + 2 new paths
  tests/unit/summarizer/summarizerProvider.test.ts          — NEW
  tests/unit/summarizer/summarizerService.test.ts           — NEW
  tests/integration/feed/feedItem.test.ts                   — MODIFY: + POST /feed/items/:id/summary tests
  tests/integration/telegram/telegramController.test.ts     — MODIFY: + POST /telegram/posts/:id/summary tests

backend/.env.example                                       — MODIFY: + SUMMARIZER_SERVICE_URL, SUMMARIZER_TIMEOUT_MS

docker-compose.yml                                          — MODIFY: + summarizer-service, backend env wiring

frontend/src/
  types.ts                                                  — MODIFY: FeedItemDto/TelegramPostDto + summary
  api/feed.ts                                               — MODIFY: + summarizeFeedItem
  api/telegram.ts                                           — MODIFY: + summarizeTelegramPost
  components/ArticleCard.tsx                                — MODIFY: button + states
  components/TelegramPostCard.tsx                            — MODIFY: button + states
  index.css                                                  — MODIFY: + .card-footer-actions, .card-summary, .summary-error
```

---

### Task 1: `summarizer-service` — standalone Python microservice

**Files:**
- Create: `summarizer-service/main.py`
- Create: `summarizer-service/requirements.txt`
- Create: `summarizer-service/requirements-dev.txt`
- Create: `summarizer-service/Dockerfile`
- Test: `summarizer-service/tests/test_main.py`

**Interfaces:**
- Produces: `POST /summarize` — request `{"text": string}`, response `{"summary": string}`. `GET /health` — response `{"status": "ok"}`, used later as this service's k8s readiness probe and as the "is it up" check for manual local verification (Task 7).

- [ ] **Step 1: Create the app**

`summarizer-service/main.py`:
```python
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import pipeline

MODEL_NAME = "facebook/bart-large-cnn"

# BART's position embeddings cap around 1024 tokens; feeding more raises an
# IndexError. Truncating to the first 3000 input characters is the same
# limit used during model comparison (see the design spec's "Input-length
# caveat" — this is a deliberate simplification, not a bug: chunked/map-reduce
# summarization is explicitly out of scope for this iteration).
MAX_INPUT_CHARS = 3000

app = FastAPI()
summarizer = pipeline("summarization", model=MODEL_NAME)


class SummarizeRequest(BaseModel):
    text: str


class SummarizeResponse(BaseModel):
    summary: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/summarize", response_model=SummarizeResponse)
def summarize(request: SummarizeRequest):
    truncated = request.text[:MAX_INPUT_CHARS]
    result = summarizer(truncated, max_length=130, min_length=30, do_sample=False)
    return SummarizeResponse(summary=result[0]["summary_text"])
```

`summarizer-service/requirements.txt`:
```
fastapi==0.115.6
uvicorn[standard]==0.32.1
transformers==4.47.1
torch==2.5.1
pydantic==2.10.4
```

`summarizer-service/requirements-dev.txt`:
```
-r requirements.txt
pytest==8.3.4
httpx==0.28.1
```

- [ ] **Step 2: Write the smoke test**

`summarizer-service/tests/test_main.py`:
```python
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_summarize_returns_non_empty_summary():
    # Real model, real inference — slow (loads bart-large-cnn on first call),
    # but this is the "input -> non-empty string output" smoke test the
    # design spec calls for, not a unit test with a mocked model.
    text = (
        "Kubernetes is an open-source system for automating deployment, "
        "scaling, and management of containerized applications. "
    ) * 20
    response = client.post("/summarize", json={"text": text})
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["summary"], str)
    assert len(body["summary"]) > 0
```

- [ ] **Step 3: Run the test to verify it passes**

Run (from `summarizer-service/`):
```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt   # Windows; use .venv/bin/pip on macOS/Linux
.venv/Scripts/python -m pytest tests/ -v
```
Expected: PASS (first run is slow — downloads `facebook/bart-large-cnn`, ~1.63GB).

- [ ] **Step 4: Write the Dockerfile**

`summarizer-service/Dockerfile`:
```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py ./

# Bake the model into the image at build time so the pod doesn't hit the
# HuggingFace Hub on every cold start / restart.
RUN python -c "from transformers import pipeline; pipeline('summarization', model='facebook/bart-large-cnn')"

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 5: Build the image and verify it serves**

Run:
```bash
cd summarizer-service
docker build -t summarizer-service:local .
docker run --rm -p 8000:8000 summarizer-service:local
```
In another terminal:
```bash
curl http://localhost:8000/health
curl -X POST http://localhost:8000/summarize -H "Content-Type: application/json" -d "{\"text\": \"Kubernetes is an open-source system for automating deployment, scaling, and management of containerized applications.\"}"
```
Expected: `/health` returns `{"status":"ok"}`; `/summarize` returns `{"summary": "..."}` with a non-empty string. Stop the container after verifying (`Ctrl+C`).

- [ ] **Step 6: Commit**

```bash
git add summarizer-service/
git commit -m "feat: add standalone summarizer-service (FastAPI + bart-large-cnn)"
```

---

### Task 2: Backend config + `SummarizerProvider` (HTTP client)

**Files:**
- Modify: `backend/src/modules/config/index.ts`
- Create: `backend/src/providers/summarizer/errors.ts`
- Create: `backend/src/providers/summarizer/interface/summarizerProvider.ts`
- Create: `backend/src/providers/summarizer/SummarizerProvider.ts`
- Modify: `backend/src/providers/container.ts`
- Test: `backend/src/tests/unit/summarizer/summarizerProvider.test.ts`

**Interfaces:**
- Consumes: `config.summarizerServiceUrl: string`, `config.summarizerTimeoutMs: number` (from this task's own config change).
- Produces: `ISummarizerProvider.summarize(text: string): Promise<string>` — throws `SummarizerTimeoutError` on timeout, `SummarizerUnavailableError` on network failure / non-200 / malformed response. DI name: `summarizerProvider`.

- [ ] **Step 1: Add config getters**

Edit `backend/src/modules/config/index.ts` — add near the other `DEFAULT_*` constants:
```ts
const DEFAULT_SUMMARIZER_SERVICE_URL = 'http://localhost:8000';
const DEFAULT_SUMMARIZER_TIMEOUT_MS = 15000;
```
Add to the `config` object (after `corsOrigin`):
```ts
    // Base URL of summarizer-service (Python/FastAPI). In docker-compose and
    // Kubernetes this is overridden to the in-cluster/in-compose hostname;
    // the localhost default is for running the backend directly (dev.sh)
    // against a locally-run `uvicorn main:app`.
    get summarizerServiceUrl(): string {
        return process.env.SUMMARIZER_SERVICE_URL || DEFAULT_SUMMARIZER_SERVICE_URL;
    },
    // How long to wait for summarizer-service before giving up. Generous —
    // this is a synchronous, user-initiated click with no batch queue
    // behind it, just one reader waiting.
    get summarizerTimeoutMs(): number {
        return parsePositiveInt(process.env.SUMMARIZER_TIMEOUT_MS, DEFAULT_SUMMARIZER_TIMEOUT_MS);
    },
```

- [ ] **Step 2: Write the errors**

`backend/src/providers/summarizer/errors.ts`:
```ts
export class SummarizerTimeoutError extends Error {
    constructor(message = 'Summarizer service timed out') {
        super(message);
        this.name = 'SummarizerTimeoutError';
    }
}

export class SummarizerUnavailableError extends Error {
    constructor(message = 'Summarizer service unavailable') {
        super(message);
        this.name = 'SummarizerUnavailableError';
    }
}
```

- [ ] **Step 3: Write the interface**

`backend/src/providers/summarizer/interface/summarizerProvider.ts`:
```ts
export interface ISummarizerProvider {
    // Throws SummarizerTimeoutError on timeout, SummarizerUnavailableError on
    // network failure, a non-200 response, or a malformed response body.
    summarize(text: string): Promise<string>;
}
```

- [ ] **Step 4: Write the failing test**

`backend/src/tests/unit/summarizer/summarizerProvider.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({
    fetchMock: vi.fn(),
}));

vi.mock('node-fetch', () => ({
    default: fetchMock,
}));

vi.mock('../../../modules/config/index.js', () => ({
    default: {
        summarizerServiceUrl: 'http://summarizer-service:8000',
        summarizerTimeoutMs: 15000,
    },
}));

import SummarizerProvider from '../../../providers/summarizer/SummarizerProvider.js';
import { SummarizerTimeoutError, SummarizerUnavailableError } from '../../../providers/summarizer/errors.js';

function jsonResponse(body: unknown, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    };
}

describe('SummarizerProvider.summarize', () => {
    let provider: SummarizerProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        provider = new SummarizerProvider();
    });

    it('POSTs the text to summarizer-service and returns the summary', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ summary: 'A short summary.' }));

        const result = await provider.summarize('some article text');

        expect(result).toBe('A short summary.');
        expect(fetchMock).toHaveBeenCalledWith(
            'http://summarizer-service:8000/summarize',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ text: 'some article text' }),
            })
        );
    });

    it('throws SummarizerUnavailableError on a non-200 response', async () => {
        fetchMock.mockResolvedValue(jsonResponse({}, 500));

        await expect(provider.summarize('text')).rejects.toThrow(SummarizerUnavailableError);
    });

    it('throws SummarizerUnavailableError on a malformed response body', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ notSummary: 'oops' }));

        await expect(provider.summarize('text')).rejects.toThrow(SummarizerUnavailableError);
    });

    it('throws SummarizerUnavailableError on a network failure', async () => {
        fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(provider.summarize('text')).rejects.toThrow(SummarizerUnavailableError);
    });

    it('throws SummarizerTimeoutError when the request is aborted', async () => {
        fetchMock.mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));

        await expect(provider.summarize('text')).rejects.toThrow(SummarizerTimeoutError);
    });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test -- summarizerProvider` (from `backend/`)
Expected: FAIL — `Cannot find module '../../../providers/summarizer/SummarizerProvider.js'`.

- [ ] **Step 6: Implement `SummarizerProvider`**

`backend/src/providers/summarizer/SummarizerProvider.ts`:
```ts
import fetch from 'node-fetch';
import config from '../../modules/config/index.js';
import Logger from '../../modules/logger/index.js';
import { SummarizerTimeoutError, SummarizerUnavailableError } from './errors.js';
import type { ISummarizerProvider } from './interface/summarizerProvider.js';

type SummarizeResponseBody = { summary: string };

function isSummarizeResponseBody(value: unknown): value is SummarizeResponseBody {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { summary: unknown }).summary === 'string'
    );
}

export default class SummarizerProvider implements ISummarizerProvider {
    async summarize(text: string): Promise<string> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.summarizerTimeoutMs);

        let response;
        try {
            response = await fetch(`${config.summarizerServiceUrl}/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
                signal: controller.signal,
            });
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new SummarizerTimeoutError();
            }

            Logger.warn('[SummarizerProvider] request to summarizer-service failed', {
                error: error instanceof Error ? error.message : error,
            });
            throw new SummarizerUnavailableError();
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            Logger.warn('[SummarizerProvider] summarizer-service returned an error status', {
                status: response.status,
            });
            throw new SummarizerUnavailableError(`summarizer-service responded with ${response.status}`);
        }

        const body: unknown = await response.json();

        if (!isSummarizeResponseBody(body)) {
            throw new SummarizerUnavailableError('summarizer-service returned a malformed response');
        }

        return body.summary;
    }
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- summarizerProvider`
Expected: PASS (5 tests).

- [ ] **Step 8: Register in the DI container**

Edit `backend/src/providers/container.ts`:
```ts
import { asClass } from 'awilix';
import type { AwilixContainer } from 'awilix';
import RssProvider from './Rss/RssProvider.js';
import TelegramProvider from './telegram/TelegramProvider.js';
import GoogleAuthProvider from './google/GoogleAuthProvider.js';
import SummarizerProvider from './summarizer/SummarizerProvider.js';

export function createProvidersContainer(container: AwilixContainer) {
    return container.register({
        rssProvider: asClass(RssProvider).scoped(),
        telegramProvider: asClass(TelegramProvider).scoped(),
        googleAuthProvider: asClass(GoogleAuthProvider).scoped(),
        summarizerProvider: asClass(SummarizerProvider).scoped(),
    });
}
```

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/config/index.ts backend/src/providers/summarizer backend/src/providers/container.ts backend/src/tests/unit/summarizer/summarizerProvider.test.ts
git commit -m "feat(backend): add SummarizerProvider — HTTP client for summarizer-service"
```

---

### Task 3: `SummarizerService` (thin wrapper) + shared length guard

**Files:**
- Create: `backend/src/modules/summarizer/interfaces/index.ts`
- Create: `backend/src/modules/summarizer/services/index.ts`
- Modify: `backend/src/modules/container.ts`
- Test: `backend/src/tests/unit/summarizer/summarizerService.test.ts`

**Interfaces:**
- Consumes: `ISummarizerProvider` (Task 2), DI name `summarizerProvider`.
- Produces: `ISummarizerService.summarize(text: string): Promise<string>`, DI name `summarizerService`. `MIN_SUMMARIZABLE_LENGTH: number` and `isSummarizable(text: string): boolean` — imported directly by both controllers in Tasks 5–6 for the pre-call 400 guard (this guard does not go through the provider at all).

- [ ] **Step 1: Write the failing tests**

`backend/src/tests/unit/summarizer/summarizerService.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import SummarizerService from '../../../modules/summarizer/services/index.js';
import { MIN_SUMMARIZABLE_LENGTH, isSummarizable } from '../../../modules/summarizer/interfaces/index.js';

describe('SummarizerService.summarize', () => {
    it('delegates to the provider with trimmed text', async () => {
        const summarizerProvider = { summarize: vi.fn().mockResolvedValue('A summary.') };
        const service = new SummarizerService({ summarizerProvider });

        const result = await service.summarize('  some text with padding  ');

        expect(result).toBe('A summary.');
        expect(summarizerProvider.summarize).toHaveBeenCalledWith('some text with padding');
    });

    it('propagates provider errors', async () => {
        const error = new Error('boom');
        const summarizerProvider = { summarize: vi.fn().mockRejectedValue(error) };
        const service = new SummarizerService({ summarizerProvider });

        await expect(service.summarize('text')).rejects.toThrow(error);
    });
});

describe('isSummarizable', () => {
    it('is false for text shorter than MIN_SUMMARIZABLE_LENGTH', () => {
        expect(isSummarizable('a'.repeat(MIN_SUMMARIZABLE_LENGTH - 1))).toBe(false);
    });

    it('is true for text exactly at MIN_SUMMARIZABLE_LENGTH', () => {
        expect(isSummarizable('a'.repeat(MIN_SUMMARIZABLE_LENGTH))).toBe(true);
    });

    it('trims before measuring, so padding whitespace does not count', () => {
        const padded = ` ${'a'.repeat(MIN_SUMMARIZABLE_LENGTH - 1)} `;
        expect(isSummarizable(padded)).toBe(false);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- summarizerService`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Implement the interfaces and service**

`backend/src/modules/summarizer/interfaces/index.ts`:
```ts
export interface ISummarizerService {
    summarize(text: string): Promise<string>;
}

// Shared "is this worth summarizing" threshold — used by both FeedController
// and TelegramController for the pre-call 400 guard, and duplicated by hand
// in the frontend cards (same convention as the Category union between here
// and frontend/src/types.ts: kept in sync deliberately, not automatically).
export const MIN_SUMMARIZABLE_LENGTH = 200;

export function isSummarizable(text: string): boolean {
    return text.trim().length >= MIN_SUMMARIZABLE_LENGTH;
}
```

`backend/src/modules/summarizer/services/index.ts`:
```ts
import type { ISummarizerProvider } from '../../../providers/summarizer/interface/summarizerProvider.js';
import type { ISummarizerService } from '../interfaces/index.js';

export default class SummarizerService implements ISummarizerService {
    private readonly summarizerProvider: ISummarizerProvider;

    constructor({ summarizerProvider }: { summarizerProvider: ISummarizerProvider }) {
        this.summarizerProvider = summarizerProvider;
    }

    async summarize(text: string): Promise<string> {
        return this.summarizerProvider.summarize(text.trim());
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- summarizerService`
Expected: PASS (5 tests).

- [ ] **Step 5: Register in the DI container**

Edit `backend/src/modules/container.ts`:
```ts
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
    });
}
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/summarizer backend/src/modules/container.ts backend/src/tests/unit/summarizer/summarizerService.test.ts
git commit -m "feat(backend): add SummarizerService and the shared isSummarizable guard"
```

---

### Task 4: DB layer — `summary` field + `findById`/`setSummary` on both repositories

**Files:**
- Modify: `backend/src/db/models/feed/interface/feedItem.ts`
- Modify: `backend/src/db/models/feed/feedItem.ts`
- Modify: `backend/src/db/models/telegram/interface/telegramPost.ts`
- Modify: `backend/src/db/models/telegram/telegramPost.ts`
- Modify: `backend/src/db/repositories/feed/interface/feedItemRepository.ts`
- Modify: `backend/src/db/repositories/feed/feedItemRepository.ts`
- Modify: `backend/src/db/repositories/telegram/interface/telegramPostRepository.ts`
- Modify: `backend/src/db/repositories/telegram/telegramPostRepository.ts`

**Interfaces:**
- Produces: `IFeedItemRepository.findById(id: string): Promise<IFeedItemDocument | null>`, `.setSummary(id: string, summary: string): Promise<void>`. Same two methods on `ITelegramPostRepository`. Both documents now guarantee `summary: string | null` (never `undefined`) once read back from Mongo. Consumed by Task 5 (feed controller) and Task 6 (telegram controller).

This task has no dedicated unit tests of its own (repository methods are one-line Mongoose calls, exercised end-to-end by the integration tests in Tasks 5–6) — go straight to implementation, then verify with `tsc`.

- [ ] **Step 1: Add `summary` to the feed item model**

Edit `backend/src/db/models/feed/interface/feedItem.ts`:
```ts
import type { Types } from 'mongoose';
import type { Category } from '../../../../modules/categorization/interfaces/index.js';
import type { IRawArticle } from './rawArticle.js';

export interface IFeedItem {
    title: string;
    content: string;
    date: Date;
    rawArticleId: Types.ObjectId;
    category: Category;
    // Optional on create (Mongoose defaults it to null) — every existing
    // FeedItemRepository.create() call site is unaffected by this field.
    summary?: string | null;
}

export interface IFeedItemDocument extends IFeedItem {
    _id: Types.ObjectId;
    summary: string | null;
}

/** Shape returned by FeedItemRepository.getAll(), which populates rawArticleId. */
export interface IPopulatedFeedItem extends Omit<IFeedItem, 'rawArticleId'> {
    _id: Types.ObjectId;
    rawArticleId: (IRawArticle & { _id: Types.ObjectId }) | null;
    summary: string | null;
}
```

Edit `backend/src/db/models/feed/feedItem.ts`:
```ts
import { Schema, model } from 'mongoose';
import { ALL_CATEGORIES } from '../../../modules/categorization/interfaces/index.js';
import type { IFeedItem } from './interface/feedItem.js';

const feedItemSchema = new Schema<IFeedItem>({
    title: { type: String, required: true },
    content: { type: String, required: true },
    date: { type: Date, required: true, index: true },
    rawArticleId: { type: Schema.Types.ObjectId, ref: 'RawArticle', required: true },
    category: { type: String, required: true, enum: ALL_CATEGORIES, index: true },
    summary: { type: String, default: null },
});

export default model<IFeedItem>('FeedItem', feedItemSchema);
```

- [ ] **Step 2: Add `summary` to the telegram post model**

Edit `backend/src/db/models/telegram/interface/telegramPost.ts`:
```ts
import type { Types } from 'mongoose';

export interface ITelegramPost {
    channelId: number;
    messageId: number;
    text: string;
    publishedAt: Date;
    mediaUrls: string[];
    // Optional on create (Mongoose defaults it to null) — every existing
    // TelegramPostRepository.create() call site is unaffected by this field.
    summary?: string | null;
}

export interface ITelegramPostDocument extends ITelegramPost {
    _id: Types.ObjectId;
    summary: string | null;
}
```

Edit `backend/src/db/models/telegram/telegramPost.ts`:
```ts
import { Schema, model } from 'mongoose';
import type { ITelegramPost } from './interface/telegramPost.js';

const telegramPostSchema = new Schema<ITelegramPost>({
    channelId: { type: Number, required: true },
    messageId: { type: Number, required: true },
    text: { type: String, default: '' },
    publishedAt: { type: Date, required: true },
    mediaUrls: { type: [String], default: [] },
    summary: { type: String, default: null },
});

// Dedup key: the same channel/message pair is never stored twice, even if
// the collector re-scrapes a page that still contains an already-saved post.
telegramPostSchema.index({ channelId: 1, messageId: 1 }, { unique: true });

export default model<ITelegramPost>('TelegramPost', telegramPostSchema);
```

- [ ] **Step 3: Add `findById`/`setSummary` to the feed item repository**

Edit `backend/src/db/repositories/feed/interface/feedItemRepository.ts` — add to `IFeedItemRepository`:
```ts
export interface IFeedItemRepository extends IFeedItemCreator, IFeedItemCategoryReader {
    getOne(): Promise<IFeedItemDocument | null>;
    getAll(limit: number, category?: Category): Promise<IPopulatedFeedItem[]>;
    findById(id: string): Promise<IFeedItemDocument | null>;
    setSummary(id: string, summary: string): Promise<void>;
}
```

Edit `backend/src/db/repositories/feed/feedItemRepository.ts` — add methods to the class:
```ts
    async findById(id: string): Promise<IFeedItemDocument | null> {
        return FeedItemModel.findById(id);
    }

    async setSummary(id: string, summary: string): Promise<void> {
        await FeedItemModel.updateOne({ _id: id }, { $set: { summary } });
    }
```

- [ ] **Step 4: Add `findById`/`setSummary` to the telegram post repository**

Edit `backend/src/db/repositories/telegram/interface/telegramPostRepository.ts`:
```ts
import type {
    ITelegramPost,
    ITelegramPostDocument,
} from '../../../models/telegram/interface/telegramPost.js';

export interface ITelegramPostRepository {
    create(post: ITelegramPost): Promise<ITelegramPostDocument>;
    findRecent(limit: number): Promise<ITelegramPostDocument[]>;
    findRecentByChannelIds(
        channelIds: number[],
        limitPerChannel: number
    ): Promise<ITelegramPostDocument[]>;
    findById(id: string): Promise<ITelegramPostDocument | null>;
    setSummary(id: string, summary: string): Promise<void>;
}
```

Edit `backend/src/db/repositories/telegram/telegramPostRepository.ts` — add methods to the class:
```ts
    async findById(id: string): Promise<ITelegramPostDocument | null> {
        return TelegramPostModel.findById(id);
    }

    async setSummary(id: string, summary: string): Promise<void> {
        await TelegramPostModel.updateOne({ _id: id }, { $set: { summary } });
    }
```

- [ ] **Step 5: Type-check**

Run (from `backend/`): `npx tsc --noEmit`
Expected: no errors. (`IPopulatedFeedItem.summary` being newly required will surface a compile error at `mapPopulatedFeedItem` in Task 5's mapper edit if the two tasks are done out of order — that's expected and fixed there.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/db
git commit -m "feat(backend): add summary field + findById/setSummary to feed item and telegram post repositories"
```

---

### Task 5: Feed endpoint — `POST /feed/items/:id/summary`

**Files:**
- Modify: `backend/src/modules/feed/mappers.ts`
- Modify: `backend/src/controller/feed/index.ts`
- Modify: `backend/src/routes/feed.ts`
- Modify: `backend/src/openapi.ts`
- Modify: `backend/src/tests/integration/feed/feedItem.test.ts`

**Interfaces:**
- Consumes: `IFeedItemRepository.findById`/`.setSummary` (Task 4), `ISummarizerService.summarize` (Task 3), `isSummarizable` (Task 3), `SummarizerTimeoutError`/`SummarizerUnavailableError` (Task 2).
- Produces: `POST /feed/items/:id/summary` → `200 {summary: string}` (cache hit or fresh) / `400` (too short) / `404` (not found) / `503` (summarizer unreachable/timed out, not cached). `mapPopulatedFeedItem` now includes `summary: string | null`.

- [ ] **Step 1: Update the mapper**

Edit `backend/src/modules/feed/mappers.ts`:
```ts
import type { IPopulatedFeedItem } from '../../db/models/feed/interface/feedItem.js';

export function mapPopulatedFeedItem(item: IPopulatedFeedItem) {
    return {
        id: item._id.toString(),
        title: item.title,
        content: item.content,
        date: item.date,
        category: item.category,
        url: item.rawArticleId?.url ?? null,
        source: item.rawArticleId?.source ?? null,
        // ?? null, not a bare pass-through: items created before this field
        // existed have no `summary` key at all in Mongo (Mongoose's schema
        // `default` only applies on create, never retroactively on read), so
        // this reads back as undefined for them, not null.
        summary: item.summary ?? null,
    };
}
```

- [ ] **Step 2: Write the failing integration tests**

Append to `backend/src/tests/integration/feed/feedItem.test.ts` (new `describe` block, new imports at top — merge with the existing `import` lines rather than duplicating):
```ts
import { Types } from 'mongoose';
import { SummarizerTimeoutError, SummarizerUnavailableError } from '../../../providers/summarizer/errors.js';
```
```ts
describe('POST /feed/items/:id/summary', () => {
    let app: express.Express;
    let feedItemRepository: {
        findById: ReturnType<typeof vi.fn>;
        setSummary: ReturnType<typeof vi.fn>;
    };
    let summarizerService: { summarize: ReturnType<typeof vi.fn> };
    const id = new Types.ObjectId().toString();
    const longContent = 'a'.repeat(250);

    beforeEach(async () => {
        feedItemRepository = {
            getOne: vi.fn(),
            getAll: vi.fn(),
            getRecentByCategory: vi.fn(),
            findById: vi.fn(),
            setSummary: vi.fn(),
        } as never;
        summarizerService = { summarize: vi.fn() };

        const container = createContainer({
            injectionMode: InjectionMode.PROXY,
            strict: true,
        });

        container.register({
            feedController: asClass(FeedController).scoped(),
            feedService: asClass(FeedService).scoped(),
            rssCollectorService: asValue({ fetchFeed: vi.fn() }),
            htmlParserService: asValue({ parseArticle: vi.fn() }),
            feedItemRepository: asValue(feedItemRepository),
            rawArticleRepository: asValue({ create: vi.fn() }),
            categorizationService: asValue({ categorize: vi.fn() }),
            summarizerService: asValue(summarizerService),
        });

        app = express();
        await handleMiddleware(app, express, container);
    });

    it('returns 404 when the item does not exist', async () => {
        feedItemRepository.findById.mockResolvedValue(null);

        const response = await request(app).post(`/feed/items/${id}/summary`);

        expect(response.status).toBe(404);
        expect(summarizerService.summarize).not.toHaveBeenCalled();
    });

    it('returns the cached summary without calling the summarizer (cache hit)', async () => {
        feedItemRepository.findById.mockResolvedValue({
            _id: id,
            content: longContent,
            summary: 'Already summarized.',
        });

        const response = await request(app).post(`/feed/items/${id}/summary`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ summary: 'Already summarized.' });
        expect(summarizerService.summarize).not.toHaveBeenCalled();
    });

    it('returns 400 without calling the summarizer when content is too short', async () => {
        feedItemRepository.findById.mockResolvedValue({ _id: id, content: 'too short', summary: null });

        const response = await request(app).post(`/feed/items/${id}/summary`);

        expect(response.status).toBe(400);
        expect(summarizerService.summarize).not.toHaveBeenCalled();
    });

    it('calls the summarizer, persists, and returns the summary on a cache miss', async () => {
        feedItemRepository.findById.mockResolvedValue({ _id: id, content: longContent, summary: null });
        summarizerService.summarize.mockResolvedValue('Fresh summary.');

        const response = await request(app).post(`/feed/items/${id}/summary`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ summary: 'Fresh summary.' });
        expect(summarizerService.summarize).toHaveBeenCalledWith(longContent);
        expect(feedItemRepository.setSummary).toHaveBeenCalledWith(id, 'Fresh summary.');
    });

    it('returns 503 and does not cache anything when the summarizer times out', async () => {
        feedItemRepository.findById.mockResolvedValue({ _id: id, content: longContent, summary: null });
        summarizerService.summarize.mockRejectedValue(new SummarizerTimeoutError());

        const response = await request(app).post(`/feed/items/${id}/summary`);

        expect(response.status).toBe(503);
        expect(feedItemRepository.setSummary).not.toHaveBeenCalled();
    });

    it('returns 503 when the summarizer is unavailable', async () => {
        feedItemRepository.findById.mockResolvedValue({ _id: id, content: longContent, summary: null });
        summarizerService.summarize.mockRejectedValue(new SummarizerUnavailableError());

        const response = await request(app).post(`/feed/items/${id}/summary`);

        expect(response.status).toBe(503);
        expect(feedItemRepository.setSummary).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- feedItem`
Expected: FAIL — route `/feed/items/:id/summary` doesn't exist yet (404s where the test expects 200/400/503, or a container resolution error for `summarizerService` since `FeedController` doesn't ask for it yet).

- [ ] **Step 4: Implement the controller and route**

Edit `backend/src/controller/feed/index.ts`:
```ts
import type { Request, Response } from 'express';
import FeedService from '../../modules/feed/services/index.js';
import config from '../../modules/config/index.js';
import type { Category } from '../../modules/categorization/interfaces/index.js';
import type { IFeedItemRepository } from '../../db/repositories/feed/interface/feedItemRepository.js';
import type { ISummarizerService } from '../../modules/summarizer/interfaces/index.js';
import { isSummarizable } from '../../modules/summarizer/interfaces/index.js';
import { SummarizerTimeoutError, SummarizerUnavailableError } from '../../providers/summarizer/errors.js';

export default class FeedController {
    private readonly feedService: FeedService;
    private readonly feedItemRepository: IFeedItemRepository;
    private readonly summarizerService: ISummarizerService;

    constructor({
        feedService,
        feedItemRepository,
        summarizerService,
    }: {
        feedService: FeedService;
        feedItemRepository: IFeedItemRepository;
        summarizerService: ISummarizerService;
    }) {
        this.feedService = feedService;
        this.feedItemRepository = feedItemRepository;
        this.summarizerService = summarizerService;
    }

    async getItem(req: Request, res: Response) {
        const feedItem = await this.feedService.getItem();

        res.json(feedItem);
    }

    async fetchFeedItem(req: Request, res: Response) {
        const feed = await this.feedService.fetchFeedItems();

        res.json(feed);
    }

    async getFeeds(req: Request, res: Response) {
        const feeds = await this.feedService.fetchAllFeeds();

        const limit = feeds.slice(0, config.feedsPageSize);

        res.json(limit);
    }

    async getItems(req: Request, res: Response) {
        const limit = Number(req.query.limit) || config.defaultItemsLimit;
        const category = typeof req.query.category === 'string' ? (req.query.category as Category) : undefined;

        const items = await this.feedService.listItems(limit, category);

        res.json(items);
    }

    async summarizeItem(req: Request, res: Response) {
        const item = await this.feedItemRepository.findById(req.params.id);

        if (!item) {
            res.status(404).json({ error: 'Feed item not found' });
            return;
        }

        if (item.summary) {
            res.json({ summary: item.summary });
            return;
        }

        if (!isSummarizable(item.content)) {
            res.status(400).json({ error: 'Item content is too short to summarize' });
            return;
        }

        let summary: string;
        try {
            summary = await this.summarizerService.summarize(item.content);
        } catch (error) {
            if (error instanceof SummarizerTimeoutError || error instanceof SummarizerUnavailableError) {
                res.status(503).json({ error: error.message });
                return;
            }
            throw error;
        }

        await this.feedItemRepository.setSummary(item._id.toString(), summary);

        res.json({ summary });
    }
}
```

Edit `backend/src/routes/feed.ts`:
```ts
export default class FeedRoutes {
    static path = '/feed';

    static getRoutes() {
        return [
            {
                method: 'get',
                path: '/item',
                handler: 'getItem',
            },
            {
                method: 'get',
                path: '/list',
                handler: 'getFeeds',
            },
            {
                method: 'get',
                path: '/items',
                handler: 'getItems',
            },
            {
                method: 'get',
                path: '/fetch-item',
                handler: 'fetchFeedItem',
            },
            {
                method: 'post',
                path: '/items/:id/summary',
                handler: 'summarizeItem',
            },
        ];
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- feedItem`
Expected: PASS (all `GET /feed/item`, `GET /feed/items`, and the new `POST /feed/items/:id/summary` tests).

- [ ] **Step 6: Update the OpenAPI spec**

Edit `backend/src/openapi.ts` — extend `feedItemSchema`:
```ts
const feedItemSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string', description: 'Full extracted article text.' },
        date: { type: 'string', format: 'date-time' },
        category: { type: 'string', enum: ['Node.js', 'Docker', 'AWS', 'DevOps', 'AI', 'Прочее'] },
        url: { type: 'string', nullable: true },
        source: { type: 'string', nullable: true },
        summary: { type: 'string', nullable: true, description: 'AI-generated summary, null until requested.' },
    },
};
```
Add a new path (after `/feed/fetch-item`, before `/rss/collect`):
```ts
        '/feed/items/{id}/summary': {
            post: {
                summary: 'Сгенерировать (или вернуть закешированную) саммари новости',
                description:
                    'Если summary уже есть — возвращает его без похода в summarizer-service. ' +
                    'Иначе синхронно вызывает summarizer-service, сохраняет результат и возвращает его.',
                tags: ['feed'],
                parameters: [
                    {
                        name: 'id',
                        in: 'path',
                        required: true,
                        schema: { type: 'string' },
                    },
                ],
                responses: {
                    '200': {
                        description: 'OK',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: { summary: { type: 'string' } },
                                },
                            },
                        },
                    },
                    '400': { description: 'Контент слишком короткий для саммаризации' },
                    '404': { description: 'Новость не найдена' },
                    '503': { description: 'summarizer-service недоступен или превышен таймаут' },
                },
            },
        },
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/feed/mappers.ts backend/src/controller/feed/index.ts backend/src/routes/feed.ts backend/src/openapi.ts backend/src/tests/integration/feed/feedItem.test.ts
git commit -m "feat(backend): add POST /feed/items/:id/summary"
```

---

### Task 6: Telegram endpoint — `POST /telegram/posts/:id/summary`

**Files:**
- Modify: `backend/src/controller/telegramController/index.ts`
- Modify: `backend/src/routes/telegram.ts`
- Modify: `backend/src/openapi.ts`
- Modify: `backend/src/tests/integration/telegram/telegramController.test.ts`

**Interfaces:**
- Consumes: `ITelegramPostRepository.findById`/`.setSummary` (Task 4), `ISummarizerService.summarize` (Task 3), `isSummarizable` (Task 3), `SummarizerTimeoutError`/`SummarizerUnavailableError` (Task 2).
- Produces: `POST /telegram/posts/:id/summary` — same status-code contract as Task 5. `toPostDto` now includes `summary: string | null`.

- [ ] **Step 1: Write the failing integration tests**

Edit `backend/src/tests/integration/telegram/telegramController.test.ts` — add an import at the top:
```ts
import { SummarizerTimeoutError, SummarizerUnavailableError } from '../../../providers/summarizer/errors.js';
```
Update `setupApp()` to also register a `summarizerService`:
```ts
function setupApp() {
    const telegramChannelRepository = {
        findAll: vi.fn(),
        findAllWithUsername: vi.fn(),
        findPage: vi.fn(),
        count: vi.fn(),
    };
    const telegramPostRepository = {
        create: vi.fn(),
        findRecent: vi.fn(),
        findRecentByChannelIds: vi.fn(),
        findById: vi.fn(),
        setSummary: vi.fn(),
    };
    const telegramCollectorService = { collect: vi.fn() };
    const summarizerService = { summarize: vi.fn() };

    const container = createContainer({
        injectionMode: InjectionMode.PROXY,
        strict: true,
    });

    container.register({
        telegramController: asClass(TelegramController).scoped(),
        telegramChannelRepository: asValue(telegramChannelRepository),
        telegramPostRepository: asValue(telegramPostRepository),
        telegramCollectorService: asValue(telegramCollectorService),
        summarizerService: asValue(summarizerService),
    });

    return { telegramChannelRepository, telegramPostRepository, summarizerService, container };
}
```
Add a new `describe` block at the end of the file:
```ts
describe('POST /telegram/posts/:id/summary', () => {
    let app: express.Express;
    let telegramPostRepository: ReturnType<typeof setupApp>['telegramPostRepository'];
    let summarizerService: ReturnType<typeof setupApp>['summarizerService'];
    const id = new Types.ObjectId().toString();
    const longText = 'a'.repeat(250);

    beforeEach(async () => {
        const setup = setupApp();
        telegramPostRepository = setup.telegramPostRepository;
        summarizerService = setup.summarizerService;
        app = express();
        await handleMiddleware(app, express, setup.container);
    });

    it('returns 404 when the post does not exist', async () => {
        telegramPostRepository.findById.mockResolvedValue(null);

        const response = await request(app).post(`/telegram/posts/${id}/summary`);

        expect(response.status).toBe(404);
        expect(summarizerService.summarize).not.toHaveBeenCalled();
    });

    it('returns the cached summary without calling the summarizer (cache hit)', async () => {
        telegramPostRepository.findById.mockResolvedValue({ _id: id, text: longText, summary: 'Cached.' });

        const response = await request(app).post(`/telegram/posts/${id}/summary`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ summary: 'Cached.' });
        expect(summarizerService.summarize).not.toHaveBeenCalled();
    });

    it('returns 400 without calling the summarizer when text is too short', async () => {
        telegramPostRepository.findById.mockResolvedValue({ _id: id, text: 'short', summary: null });

        const response = await request(app).post(`/telegram/posts/${id}/summary`);

        expect(response.status).toBe(400);
        expect(summarizerService.summarize).not.toHaveBeenCalled();
    });

    it('calls the summarizer, persists, and returns the summary on a cache miss', async () => {
        telegramPostRepository.findById.mockResolvedValue({ _id: id, text: longText, summary: null });
        summarizerService.summarize.mockResolvedValue('Fresh summary.');

        const response = await request(app).post(`/telegram/posts/${id}/summary`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ summary: 'Fresh summary.' });
        expect(summarizerService.summarize).toHaveBeenCalledWith(longText);
        expect(telegramPostRepository.setSummary).toHaveBeenCalledWith(id, 'Fresh summary.');
    });

    it('returns 503 and does not cache anything when the summarizer fails', async () => {
        telegramPostRepository.findById.mockResolvedValue({ _id: id, text: longText, summary: null });
        summarizerService.summarize.mockRejectedValue(new SummarizerUnavailableError());

        const response = await request(app).post(`/telegram/posts/${id}/summary`);

        expect(response.status).toBe(503);
        expect(telegramPostRepository.setSummary).not.toHaveBeenCalled();
    });

    it('returns 503 when the summarizer times out', async () => {
        telegramPostRepository.findById.mockResolvedValue({ _id: id, text: longText, summary: null });
        summarizerService.summarize.mockRejectedValue(new SummarizerTimeoutError());

        const response = await request(app).post(`/telegram/posts/${id}/summary`);

        expect(response.status).toBe(503);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- telegramController`
Expected: FAIL — route doesn't exist yet, container missing `summarizerService` registration for `TelegramController`.

- [ ] **Step 3: Implement the controller and route**

Edit `backend/src/controller/telegramController/index.ts`:
```ts
import type { Request, Response } from 'express';
import type TelegramCollectorService from '../../modules/telegramCollector/services/index.js';
import config from '../../modules/config/index.js';
import type { ITelegramChannelRepository } from '../../db/repositories/telegram/interface/telegramChannelRepository.js';
import type { ITelegramPostRepository } from '../../db/repositories/telegram/interface/telegramPostRepository.js';
import type { ITelegramChannelDocument } from '../../db/models/telegram/interface/telegramChannel.js';
import type { ITelegramPostDocument } from '../../db/models/telegram/interface/telegramPost.js';
import type { ISummarizerService } from '../../modules/summarizer/interfaces/index.js';
import { isSummarizable } from '../../modules/summarizer/interfaces/index.js';
import { SummarizerTimeoutError, SummarizerUnavailableError } from '../../providers/summarizer/errors.js';

function toChannelDto(channel: ITelegramChannelDocument) {
    return {
        id: channel._id.toString(),
        channelId: channel.channelId,
        username: channel.username,
        title: channel.title,
        addedAt: channel.addedAt,
    };
}

function toPostDto(post: ITelegramPostDocument) {
    return {
        id: post._id.toString(),
        channelId: post.channelId,
        text: post.text,
        publishedAt: post.publishedAt,
        mediaUrls: post.mediaUrls,
        // ?? null, not a bare pass-through: posts collected before this field
        // existed have no `summary` key at all in Mongo (Mongoose's schema
        // `default` only applies on create, never retroactively on read), so
        // this reads back as undefined for them, not null.
        summary: post.summary ?? null,
    };
}

function parseChannelIds(raw: unknown): number[] {
    if (typeof raw !== 'string' || raw.length === 0) {
        return [];
    }

    return raw
        .split(',')
        .map((id) => Number(id.trim()))
        .filter((id) => Number.isInteger(id));
}

export default class TelegramController {
    private readonly telegramCollectorService: TelegramCollectorService;
    private readonly telegramChannelRepository: ITelegramChannelRepository;
    private readonly telegramPostRepository: ITelegramPostRepository;
    private readonly summarizerService: ISummarizerService;

    constructor({
        telegramCollectorService,
        telegramChannelRepository,
        telegramPostRepository,
        summarizerService,
    }: {
        telegramCollectorService: TelegramCollectorService;
        telegramChannelRepository: ITelegramChannelRepository;
        telegramPostRepository: ITelegramPostRepository;
        summarizerService: ISummarizerService;
    }) {
        this.telegramCollectorService = telegramCollectorService;
        this.telegramChannelRepository = telegramChannelRepository;
        this.telegramPostRepository = telegramPostRepository;
        this.summarizerService = summarizerService;
    }

    async collectTelegram(req: Request, res: Response) {
        const saved = await this.telegramCollectorService.collect();

        res.json({ saved });
    }

    async listChannels(req: Request, res: Response) {
        if (req.query.page === undefined) {
            const channels = await this.telegramChannelRepository.findAll();

            res.json(channels.map(toChannelDto));
            return;
        }

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.max(1, Number(req.query.limit) || config.telegramChannelsPageSize);
        const offset = (page - 1) * limit;

        const [channels, total] = await Promise.all([
            this.telegramChannelRepository.findPage(offset, limit),
            this.telegramChannelRepository.count(),
        ]);

        res.json({
            channels: channels.map(toChannelDto),
            total,
            page,
            pageSize: limit,
        });
    }

    async listPosts(req: Request, res: Response) {
        const channelIds = parseChannelIds(req.query.channelIds);

        if (channelIds.length > 0) {
            const posts = await this.telegramPostRepository.findRecentByChannelIds(
                channelIds,
                config.telegramPostsPerChannelLimit
            );

            res.json(posts.map(toPostDto));
            return;
        }

        const limit = Number(req.query.limit) || config.defaultItemsLimit;
        const posts = await this.telegramPostRepository.findRecent(limit);

        res.json(posts.map(toPostDto));
    }

    async summarizePost(req: Request, res: Response) {
        const post = await this.telegramPostRepository.findById(req.params.id);

        if (!post) {
            res.status(404).json({ error: 'Telegram post not found' });
            return;
        }

        if (post.summary) {
            res.json({ summary: post.summary });
            return;
        }

        if (!isSummarizable(post.text)) {
            res.status(400).json({ error: 'Post text is too short to summarize' });
            return;
        }

        let summary: string;
        try {
            summary = await this.summarizerService.summarize(post.text);
        } catch (error) {
            if (error instanceof SummarizerTimeoutError || error instanceof SummarizerUnavailableError) {
                res.status(503).json({ error: error.message });
                return;
            }
            throw error;
        }

        await this.telegramPostRepository.setSummary(post._id.toString(), summary);

        res.json({ summary });
    }
}
```

Edit `backend/src/routes/telegram.ts`:
```ts
export default class TelegramRoutes {
    static path = '/telegram';

    static getRoutes() {
        return [
            {
                method: 'get',
                path: '/collect',
                handler: 'collectTelegram',
            },
            {
                method: 'get',
                path: '/channels',
                handler: 'listChannels',
            },
            {
                method: 'get',
                path: '/posts',
                handler: 'listPosts',
            },
            {
                method: 'post',
                path: '/posts/:id/summary',
                handler: 'summarizePost',
            },
        ];
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- telegramController`
Expected: PASS (all existing `GET /telegram/channels` / `GET /telegram/posts` tests plus the new `POST /telegram/posts/:id/summary` tests).

- [ ] **Step 5: Update the OpenAPI spec**

Edit `backend/src/openapi.ts` — add `summary` to the inline post schema inside `/telegram/posts`'s `200` response:
```ts
                                    type: 'object',
                                        properties: {
                                            id: { type: 'string' },
                                            channelId: { type: 'integer' },
                                            text: { type: 'string' },
                                            publishedAt: { type: 'string', format: 'date-time' },
                                            mediaUrls: {
                                                type: 'array',
                                                items: { type: 'string' },
                                            },
                                            summary: { type: 'string', nullable: true },
                                        },
```
Add a new path (after `/telegram/posts`, before `/digest/latest`):
```ts
        '/telegram/posts/{id}/summary': {
            post: {
                summary: 'Сгенерировать (или вернуть закешированную) саммари поста',
                description:
                    'Если summary уже есть — возвращает его без похода в summarizer-service. ' +
                    'Иначе синхронно вызывает summarizer-service, сохраняет результат и возвращает его.',
                tags: ['telegram'],
                parameters: [
                    {
                        name: 'id',
                        in: 'path',
                        required: true,
                        schema: { type: 'string' },
                    },
                ],
                responses: {
                    '200': {
                        description: 'OK',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: { summary: { type: 'string' } },
                                },
                            },
                        },
                    },
                    '400': { description: 'Текст слишком короткий для саммаризации' },
                    '404': { description: 'Пост не найден' },
                    '503': { description: 'summarizer-service недоступен или превышен таймаут' },
                },
            },
        },
```

- [ ] **Step 6: Full backend test suite + type-check**

Run (from `backend/`): `npm test && npx tsc --noEmit`
Expected: all suites pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/controller/telegramController/index.ts backend/src/routes/telegram.ts backend/src/openapi.ts backend/src/tests/integration/telegram/telegramController.test.ts
git commit -m "feat(backend): add POST /telegram/posts/:id/summary"
```

---

### Task 7: Local dev wiring — `docker-compose.yml` + `.env.example`

**Files:**
- Modify: `docker-compose.yml`
- Modify: `backend/.env.example`

**Interfaces:**
- Produces: a locally runnable `summarizer-service` reachable from `backend-service` at `http://summarizer-service:8000`, matching the k8s DNS pattern the (out-of-scope) `pulsedev-infra` rollout will mirror later. This unblocks the manual verification steps in Tasks 9–10.

- [ ] **Step 1: Add `SUMMARIZER_SERVICE_URL`/`SUMMARIZER_TIMEOUT_MS` documentation**

Edit `backend/.env.example` — append at the end:
```
# Base URL of summarizer-service (Python/FastAPI) used to generate on-demand
# article/post summaries. Overridden to http://summarizer-service:8000 inside
# docker-compose (see docker-compose.yml). This default is for running the
# backend directly (dev.sh) against a locally-run `uvicorn main:app` in
# summarizer-service/. Default: http://localhost:8000.
SUMMARIZER_SERVICE_URL=http://localhost:8000

# How long the backend waits for summarizer-service before giving up and
# responding 503 (the summary is NOT cached as a failure — a retry can
# succeed later). Default: 15000 (15s).
SUMMARIZER_TIMEOUT_MS=15000
```

- [ ] **Step 2: Wire the service into `docker-compose.yml`**

Edit `docker-compose.yml`:
```yaml
services:
    mongo:
        image: mongo:7
        volumes: ['mongodata:/data/db']
        environment:
            MONGO_INITDB_ROOT_USERNAME: ${MONGO_INITDB_ROOT_USERNAME:-digestAdmin}
            MONGO_INITDB_ROOT_PASSWORD: ${MONGO_INITDB_ROOT_PASSWORD:?set MONGO_INITDB_ROOT_PASSWORD in a root .env file, see .env.example}
        # Localhost-only (not 0.0.0.0) so it's reachable from Compass/mongosh on this
        # machine but not from the LAN. Prod never does this — see mongo-service.yaml,
        # which stays headless/cluster-internal on purpose.
        ports: ['127.0.0.1:27017:27017']

    summarizer-service:
        build: ./summarizer-service
        # Not exposed beyond localhost — same reasoning as prod's ClusterIP
        # (see the design spec's Deployment plan): only backend-service needs
        # it, this port mapping is purely for local curl/debugging.
        ports: ['127.0.0.1:8000:8000']

    backend-service:
        build: ./backend
        env_file: ./backend/.env
        environment:
            # Overrides backend/.env's MONGO_URI, which points at localhost:27017 for
            # non-Docker local dev (dev.sh). Inside compose, Mongo is only reachable
            # at the "mongo" service hostname.
            # MONGO_DB_NAME defaults to a distinct "_dev" database so it never collides
            # in name with the prod database (see k8s/base/secret.example.yaml in the
            # nasty666programmer/pulsedev-infra repo).
            MONGO_URI: mongodb://${MONGO_INITDB_ROOT_USERNAME:-digestAdmin}:${MONGO_INITDB_ROOT_PASSWORD}@mongo:27017/${MONGO_DB_NAME:-digital_ai_project_dev}?authSource=admin
            # Overrides backend/.env's localhost default — inside compose,
            # summarizer-service is only reachable at its own service hostname.
            SUMMARIZER_SERVICE_URL: http://summarizer-service:8000
        depends_on: [mongo, summarizer-service]
        ports: ['3000:3000']

    frontend:
        build: ./frontend
        depends_on: [backend-service]
        ports: ['8080:80']

    rss-collect:
        build: ./backend
        command: ['node', 'dist/bin/collect.js']
        env_file: ./backend/.env
        environment:
            MONGO_URI: mongodb://${MONGO_INITDB_ROOT_USERNAME:-digestAdmin}:${MONGO_INITDB_ROOT_PASSWORD}@mongo:27017/${MONGO_DB_NAME:-digital_ai_project_dev}?authSource=admin
        depends_on: [mongo]
        profiles: ['cron'] # run manually: docker compose --profile cron run --rm rss-collect

volumes:
    mongodata:
```

- [ ] **Step 3: Verify the compose file is valid and the stack comes up**

Run (from repo root):
```bash
docker compose config
docker compose up --build -d mongo summarizer-service backend-service
```
Expected: `docker compose config` prints a valid merged config with no errors; `docker compose up` starts all three containers without exiting/crash-looping (`docker compose ps` shows them `Up`). Building `summarizer-service` for the first time is slow (downloads the model during the image build per Task 1's Dockerfile).

- [ ] **Step 4: Verify backend can actually reach the summarizer through compose networking**

With the stack from Step 3 still running:
```bash
curl http://localhost:3000/health
docker compose exec backend-service wget -qO- http://summarizer-service:8000/health
```
Expected: both return healthy responses. Then:
```bash
docker compose down
```

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml backend/.env.example
git commit -m "feat: wire summarizer-service into docker-compose for local dev"
```

---

### Task 8: Frontend — types + API client functions

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api/feed.ts`
- Modify: `frontend/src/api/telegram.ts`

**Interfaces:**
- Produces: `FeedItemDto.summary: string | null`, `TelegramPostDto.summary: string | null`, `summarizeFeedItem(id: string): Promise<string>`, `summarizeTelegramPost(id: string): Promise<string>`. Consumed by Tasks 9–10.

- [ ] **Step 1: Add `summary` to both DTOs**

Edit `frontend/src/types.ts`:
```ts
export type FeedItemDto = {
  id: string;
  title: string;
  /** Full extracted article text (plain text, may be long). */
  content: string;
  /** ISO date string. */
  date: string;
  category: Category;
  url: string | null;
  source: string | null;
  /** AI-generated summary, null until a reader requests one. */
  summary: string | null;
};
```
```ts
export type TelegramPostDto = {
  id: string;
  channelId: number;
  text: string;
  /** ISO date string. */
  publishedAt: string;
  mediaUrls: string[];
  /** AI-generated summary, null until a reader requests one. */
  summary: string | null;
};
```

- [ ] **Step 2: Add `summarizeFeedItem`**

Edit `frontend/src/api/feed.ts` — append:
```ts
// Generous relative to the backend's own SUMMARIZER_TIMEOUT_MS default
// (15s) so the backend's own 503-on-timeout response has time to win the
// race under normal conditions.
const SUMMARIZE_TIMEOUT_MS = 20_000;

export async function summarizeFeedItem(id: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUMMARIZE_TIMEOUT_MS);
  try {
    const res = await fetch(`/feed/items/${id}/summary`, { method: 'POST', signal: controller.signal });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res));
    }
    const body = (await res.json()) as { summary: string };
    return body.summary;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

- [ ] **Step 3: Add `summarizeTelegramPost`**

Edit `frontend/src/api/telegram.ts` — append:
```ts
const SUMMARIZE_TIMEOUT_MS = 20_000;

export async function summarizeTelegramPost(id: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUMMARIZE_TIMEOUT_MS);
  try {
    const res = await fetch(`/telegram/posts/${id}/summary`, { method: 'POST', signal: controller.signal });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res));
    }
    const body = (await res.json()) as { summary: string };
    return body.summary;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

- [ ] **Step 4: Type-check**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: no errors. (Task 9/10 will still need to update `ArticleCard`/`TelegramPostCard` call sites if `tsc` is run in strict mode against unused-import rules — that happens in those tasks; this task's own files type-check cleanly on their own.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types.ts frontend/src/api/feed.ts frontend/src/api/telegram.ts
git commit -m "feat(frontend): add summary field + summarize API functions"
```

---

### Task 9: Frontend — `ArticleCard` summarize button

**Files:**
- Modify: `frontend/src/components/ArticleCard.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `summarizeFeedItem` (Task 8), `FeedItemDto.summary` (Task 8).

- [ ] **Step 1: Add the CSS**

Edit `frontend/src/index.css` — insert immediately after the existing `.link-btn:focus-visible` rule (around line 976–980):
```css
.link-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  border-radius: 4px;
}

.card-footer-actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.card-summary {
  font: 500 14px/1.5 var(--font-ui);
  color: var(--text-primary);
  background: var(--surface-hover);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-4);
  margin: 0 0 var(--space-3) 0;
}

.summary-error {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font: 400 13px var(--font-ui);
  color: var(--danger);
}
```
(Keep the pre-existing `.original-link` rule that follows untouched.)

- [ ] **Step 2: Implement the button and states**

Edit `frontend/src/components/ArticleCard.tsx`:
```tsx
import { useId, useState } from 'react';
import type { FeedItemDto } from '../types';
import { estimateReadingMinutes, formatArticleDate, toExcerpt, toParagraphs } from '../utils/text';
import { summarizeFeedItem } from '../api/feed';
import { ChevronDownIcon, ChevronUpIcon, ExternalLinkIcon } from './icons';

type ArticleCardProps = {
  item: FeedItemDto;
};

// Mirrors backend's MIN_SUMMARIZABLE_LENGTH (modules/summarizer/interfaces/index.ts)
// — kept in sync by hand, same convention as the Category union in types.ts.
const MIN_SUMMARIZABLE_LENGTH = 200;

type SummaryState = { status: 'idle' | 'loading' | 'error'; message?: string };

export function ArticleCard({ item }: ArticleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState(item.summary);
  const [summaryState, setSummaryState] = useState<SummaryState>({ status: 'idle' });
  const bodyId = useId();

  const source = item.source || 'источник неизвестен';
  const dateText = formatArticleDate(item.date);
  const readingMinutes = estimateReadingMinutes(item.content);
  const canSummarize = !summary && item.content.trim().length >= MIN_SUMMARIZABLE_LENGTH;

  const handleSummarize = async () => {
    setSummaryState({ status: 'loading' });
    try {
      const result = await summarizeFeedItem(item.id);
      setSummary(result);
      setSummaryState({ status: 'idle' });
    } catch (error) {
      setSummaryState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Не удалось получить саммари',
      });
    }
  };

  return (
    <article className={`card${expanded ? ' is-expanded' : ''}`}>
      <div className="card-meta">
        <span className="category-badge">{item.category}</span>
        <span className="sep">·</span>
        {source}
        {dateText && <span className="sep">·</span>}
        {dateText}
        <span className="sep">·</span>
        {readingMinutes} мин чтения
      </div>

      <h2 className="card-title">{item.title}</h2>

      {summary && <p className="card-summary">{summary}</p>}

      {!expanded && <p className="card-excerpt">{toExcerpt(item.content)}</p>}

      {expanded && (
        <div className="card-body" id={bodyId}>
          {toParagraphs(item.content).map((paragraph, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      )}

      <div className="card-footer">
        <div className="card-footer-actions">
          <button
            type="button"
            className="link-btn"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? 'Свернуть' : 'Читать дальше'}
            {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </button>
          {canSummarize && summaryState.status !== 'error' && (
            <button
              type="button"
              className="link-btn"
              disabled={summaryState.status === 'loading'}
              aria-busy={summaryState.status === 'loading'}
              onClick={handleSummarize}
            >
              {summaryState.status === 'loading' ? 'Саммаризация…' : 'Саммаризировать'}
            </button>
          )}
          {summaryState.status === 'error' && (
            <span className="summary-error">
              {summaryState.message}
              <button type="button" className="link-btn" onClick={handleSummarize}>
                Повторить
              </button>
            </span>
          )}
        </div>
        {item.url && (
          <a className="original-link" href={item.url} target="_blank" rel="noopener noreferrer">
            Оригинал
            <ExternalLinkIcon />
          </a>
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 3: Type-check**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

With `docker compose up --build` running the full stack (Task 7), or `dev.sh`/`dev.bat` + a locally-run `uvicorn main:app` in `summarizer-service/`:
1. Open the app, find an article card with content ≥ 200 characters and no summary yet — confirm the "Саммаризировать" button is visible.
2. Click it — confirm the button switches to "Саммаризация…" and disables itself, then (after several seconds — `bart-large-cnn` inference is slow, see the spec's latency caveat) the summary box appears above the excerpt and the button disappears.
3. Reload the page (or click a fresh copy of the same card) — confirm the summary now shows immediately with no button (cache hit — check the Network tab, `POST` should return near-instantly with no wait).
4. Stop `summarizer-service` (or the whole stack's `summarizer-service` container) and click the button on a different, not-yet-summarized card — confirm an inline error message plus a "Повторить" button appear after the timeout, and that reloading still shows no button-turned-summary (i.e. nothing got cached on failure).
5. Confirm a card with very little content (e.g. a short HN title-only item, if one exists in test data) never shows the button at all.

Report the outcome (pass/fail per point) before treating this task as done — this is the acceptance check per the spec's Testing section ("no automated test infra... verify manually against a real backend").

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ArticleCard.tsx frontend/src/index.css
git commit -m "feat(frontend): add summarize button + states to ArticleCard"
```

---

### Task 10: Frontend — `TelegramPostCard` summarize button

**Files:**
- Modify: `frontend/src/components/TelegramPostCard.tsx`

**Interfaces:**
- Consumes: `summarizeTelegramPost` (Task 8), `TelegramPostDto.summary` (Task 8), `.card-footer-actions`/`.card-summary`/`.summary-error` (Task 9's CSS — no new CSS needed here).

- [ ] **Step 1: Implement the button and states**

Edit `frontend/src/components/TelegramPostCard.tsx`:
```tsx
import { useEffect, useId, useRef, useState } from 'react';
import type { TelegramPostDto } from '../types';
import { formatArticleDate, toExcerpt, toParagraphs } from '../utils/text';
import { summarizeTelegramPost } from '../api/telegram';
import { ChevronDownIcon, ChevronUpIcon, VolumeOffIcon, VolumeOnIcon } from './icons';

type TelegramPostCardProps = {
  post: TelegramPostDto;
};

// Mirrors backend's MIN_SUMMARIZABLE_LENGTH (modules/summarizer/interfaces/index.ts)
// — kept in sync by hand, same convention as the Category union in types.ts.
const MIN_SUMMARIZABLE_LENGTH = 200;

type SummaryState = { status: 'idle' | 'loading' | 'error'; message?: string };

const isVideoUrl = (url: string) => /\.(mp4|webm|mov)(\?|$)/i.test(url);

function TelegramVideo({ src, className }: { src: string; className?: string }) {
  const [muted, setMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          setMuted(true);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={`telegram-video${className ? ` ${className}` : ''}`}>
      <video src={src} muted={muted} loop autoPlay playsInline className="card-media-item" />
      <button
        type="button"
        className="telegram-video-mute"
        aria-label={muted ? 'Включить звук' : 'Выключить звук'}
        onClick={() => setMuted((prev) => !prev)}
      >
        {muted ? <VolumeOffIcon /> : <VolumeOnIcon />}
      </button>
    </div>
  );
}

function MediaItem({ url, className }: { url: string; className?: string }) {
  return isVideoUrl(url) ? (
    <TelegramVideo src={url} className={className} />
  ) : (
    <img src={url} alt="" loading="lazy" className={`card-media-item${className ? ` ${className}` : ''}`} />
  );
}

export function TelegramPostCard({ post }: TelegramPostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState(post.summary);
  const [summaryState, setSummaryState] = useState<SummaryState>({ status: 'idle' });
  const bodyId = useId();

  const dateText = formatArticleDate(post.publishedAt);
  const hasLongText = post.text.length > 220;
  const hasText = post.text.trim().length > 0;
  const mediaUrls = [...new Set(post.mediaUrls)];
  const hasMedia = mediaUrls.length > 0;
  const isMediaOnly = !hasText && hasMedia;
  const canSummarize = !summary && post.text.trim().length >= MIN_SUMMARIZABLE_LENGTH;

  const handleSummarize = async () => {
    setSummaryState({ status: 'loading' });
    try {
      const result = await summarizeTelegramPost(post.id);
      setSummary(result);
      setSummaryState({ status: 'idle' });
    } catch (error) {
      setSummaryState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Не удалось получить саммари',
      });
    }
  };

  return (
    <article
      className={`card telegram-post-card${expanded ? ' is-expanded' : ''}${isMediaOnly ? ' is-media-only' : ''}`}
    >
      <div className="card-meta">{dateText}</div>

      {hasMedia && (
        <div className="card-media">
          {mediaUrls.map((url, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <MediaItem key={`${url}-${index}`} url={url} />
          ))}
        </div>
      )}

      {summary && <p className="card-summary">{summary}</p>}

      {hasText && !expanded && <p className="card-excerpt">{toExcerpt(post.text)}</p>}

      {hasText && expanded && (
        <div className="card-body" id={bodyId}>
          {toParagraphs(post.text).map((paragraph, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      )}

      {(hasLongText || canSummarize || summaryState.status === 'error') && (
        <div className="card-footer">
          <div className="card-footer-actions">
            {hasLongText && (
              <button
                type="button"
                className="link-btn"
                aria-expanded={expanded}
                aria-controls={bodyId}
                onClick={() => setExpanded((prev) => !prev)}
              >
                {expanded ? 'Свернуть' : 'Читать дальше'}
                {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </button>
            )}
            {canSummarize && summaryState.status !== 'error' && (
              <button
                type="button"
                className="link-btn"
                disabled={summaryState.status === 'loading'}
                aria-busy={summaryState.status === 'loading'}
                onClick={handleSummarize}
              >
                {summaryState.status === 'loading' ? 'Саммаризация…' : 'Саммаризировать'}
              </button>
            )}
            {summaryState.status === 'error' && (
              <span className="summary-error">
                {summaryState.message}
                <button type="button" className="link-btn" onClick={handleSummarize}>
                  Повторить
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 2: Type-check**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Same procedure as Task 9 Step 4, applied to the Telegram tab's post cards instead of the feed's article cards. Additionally confirm:
- A media-only post (no text) never shows the button (guarded by `hasText`/`canSummarize` both requiring `post.text`).
- A post with `hasText` but under 220 chars (so no "Читать дальше") and under 200 chars (so no summarize button) renders a `card-footer`-less card exactly as before this change (regression check on the pre-existing conditional).

Report pass/fail per point before treating this task as done.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TelegramPostCard.tsx
git commit -m "feat(frontend): add summarize button + states to TelegramPostCard"
```

---

### Task 11: Full-stack smoke pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full backend suite + type-check**

Run (from `backend/`): `npm run lint && npx tsc --noEmit && npm test`
Expected: lint clean, no type errors, all suites pass (including the new summarizer unit tests and the extended feed/telegram integration tests).

- [ ] **Step 2: Run the full frontend type-check + lint**

Run (from `frontend/`): `npx tsc --noEmit && npm run lint` (use whatever lint script `frontend/package.json` defines — check it if unsure).
Expected: clean.

- [ ] **Step 3: Full stack up, end-to-end pass**

```bash
docker compose up --build
```
Repeat the golden path once more end-to-end: open the frontend, summarize one RSS article and one Telegram post, reload to confirm both are cached, confirm the digest/other tabs are unaffected (they were never touched by this plan). Then:
```bash
docker compose down
```

- [ ] **Step 4: Report status to the user**

Summarize what was verified (or any failures found and how they were resolved) before considering the DevPulse-repo portion of this feature complete. Remind the user that the `pulsedev-infra` Kubernetes/CI rollout (spec's Deployment plan steps 2–5) is a separate follow-up in that repo, not covered here.
