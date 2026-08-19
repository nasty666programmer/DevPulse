# Telegram Channel Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `TelegramProvider.fetch()` stub with a real pull-based collector that periodically scrapes the public `t.me/s/<username>` preview page for every registered Telegram channel and stores new posts in Mongo, plus a text-username registration path in the bot.

**Architecture:** `TelegramProvider.fetch(username)` becomes a genuine pull source (GET + cheerio parse), symmetric with `RssProvider.fetch(url)` — `IProvider<TItem>` needs no changes. A new `TelegramCollectorService` iterates registered channels (mirrors `RssCollectorServices`), a new `TelegramSchedulerService` runs it on its own cron (mirrors `SchedulerService`), and posts land in a new `TelegramPost` collection. `TelegramBotService` gains a second registration path: any plain-text message that looks like a username is resolved via Bot API `getChat` and upserted the same way a forwarded message already is. Nothing in the RSS/digest pipeline is touched.

**Tech Stack:** Node.js/TypeScript (ESM), Express, Mongoose, Awilix DI, Vitest, `cheerio` (HTML parsing), `node-fetch` (HTTP), `grammy` (Telegram Bot API) — all already dependencies, no new installs needed.

**Spec:** `docs/superpowers/specs/2026-08-20-telegram-channel-collector-design.md`

## Global Constraints

- TDD Iron Law: no production code without a failing test first (per `superpowers:test-driven-development`). Repository classes that are thin Mongoose wrappers (`TelegramPostRepository.create`, `TelegramChannelRepository.findAllWithUsername`) are the one deliberate exception, matching this codebase's existing convention — `RawArticleRepository`, `DigestRepository`, and `TelegramChannelRepository.upsertByChannelId` have no dedicated unit tests either; they're exercised through the services that consume them (via mocked interfaces) and verified live in Task 9.
- Code style (from `.prettierrc`): single quotes, semicolons, 4-space indent, trailing commas (es5), 100-char print width. Match surrounding code exactly.
- All internal imports use explicit `.js` extensions (NodeNext ESM), e.g. `import x from './y.js'`.
- Grammy types (`ChatFullInfo`, `MessageOriginChannel`, etc.) import from `'grammy/types'`, not `'grammy'` — the main `'grammy'` entry point does not re-export them (confirmed: `grammy/out/mod.d.ts` does not `export * from './types.js'`; only the `grammy/types` subpath does).
- Telegram work stays fully isolated from the RSS/digest pipeline: no shared files, no shared DB collections, no shared cron schedule/config key.
- Use `isDuplicateKeyError` from `src/common/utils.ts` for Mongo duplicate-key handling — don't reimplement it.
- Every task ends with `npx vitest run <path>` passing and a commit. Run commands from the `backend/` directory.

---

### Task 1: TelegramProvider — real `t.me/s/<username>` scraper

**Files:**
- Modify: `backend/src/providers/telegram/TelegramProvider.ts`
- Modify (full rewrite): `backend/src/tests/unit/providers/telegramProvider.test.ts`

**Interfaces:**
- Consumes: `IProvider<TItem>` from `backend/src/providers/interfaces.ts` (unchanged: `{ fetch(source: string): Promise<TItem[]> }`).
- Produces: `TelegramPost` type — `{ messageId: number; text: string; publishedAt: Date; mediaUrls: string[] }` — exported from `TelegramProvider.ts`, consumed by Task 5 (`TelegramCollectorService`).

- [ ] **Step 1: Replace the stub test with real behavior tests (RED)**

Replace the entire contents of `backend/src/tests/unit/providers/telegramProvider.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({
    fetchMock: vi.fn(),
}));

vi.mock('node-fetch', () => ({
    default: fetchMock,
}));

import TelegramProvider from '../../../providers/telegram/TelegramProvider.js';

function htmlResponse(html: string, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => html,
    };
}

const SAMPLE_HTML = `
<div class="tgme_widget_message_wrap">
  <div class="tgme_widget_message" data-post="testchannel/101">
    <div class="tgme_widget_message_text">Hello <b>world</b></div>
    <a class="tgme_widget_message_date" href="https://t.me/testchannel/101">
      <time class="time" datetime="2026-08-19T10:00:00+00:00">10:00</time>
    </a>
  </div>
</div>
<div class="tgme_widget_message_wrap">
  <div class="tgme_widget_message" data-post="testchannel/102">
    <a class="tgme_widget_message_photo_wrap" style="background-image:url('https://cdn.example/photo.jpg')" href="https://t.me/testchannel/102"></a>
    <a class="tgme_widget_message_date" href="https://t.me/testchannel/102">
      <time class="time" datetime="2026-08-19T11:00:00+00:00">11:00</time>
    </a>
  </div>
</div>
`;

describe('TelegramProvider.fetch', () => {
    let provider: TelegramProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        provider = new TelegramProvider();
    });

    it('requests the public preview page for the given username', async () => {
        fetchMock.mockResolvedValue(htmlResponse(SAMPLE_HTML));

        await provider.fetch('testchannel');

        expect(fetchMock).toHaveBeenCalledWith(
            'https://t.me/s/testchannel',
            expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': expect.any(String) }) })
        );
    });

    it('parses a text post into a TelegramPost', async () => {
        fetchMock.mockResolvedValue(htmlResponse(SAMPLE_HTML));

        const posts = await provider.fetch('testchannel');

        expect(posts).toHaveLength(2);
        expect(posts[0]).toEqual({
            messageId: 101,
            text: 'Hello world',
            publishedAt: new Date('2026-08-19T10:00:00+00:00'),
            mediaUrls: [],
        });
    });

    it('extracts photo media URLs from the background-image style', async () => {
        fetchMock.mockResolvedValue(htmlResponse(SAMPLE_HTML));

        const posts = await provider.fetch('testchannel');

        expect(posts[1].mediaUrls).toEqual(['https://cdn.example/photo.jpg']);
        expect(posts[1].text).toBe('');
    });

    it('skips a message missing a data-post id or a timestamp instead of throwing', async () => {
        const malformedHtml = `
          <div class="tgme_widget_message">
            <div class="tgme_widget_message_text">No post id or timestamp</div>
          </div>
        `;
        fetchMock.mockResolvedValue(htmlResponse(malformedHtml));

        const posts = await provider.fetch('testchannel');

        expect(posts).toEqual([]);
    });

    it('throws a clear error when the channel page request fails', async () => {
        fetchMock.mockResolvedValue(htmlResponse('', 404));

        await expect(provider.fetch('missingchannel')).rejects.toThrow('HTTP 404');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/unit/providers/telegramProvider.test.ts`
Expected: FAIL — the old stub throws `"not implemented yet"` instead of returning parsed posts, and `node-fetch`'s mock is never called (stub doesn't fetch anything). Specifically the "requests the public preview page..." test fails because `fetchMock` was never called.

- [ ] **Step 3: Implement the real provider (GREEN)**

Replace the entire contents of `backend/src/providers/telegram/TelegramProvider.ts`:

```ts
import fetch from 'node-fetch';
import { load } from 'cheerio';
import type { IProvider } from '../interfaces.js';

// One channel post scraped from the public https://t.me/s/<username> preview
// page — the only surface that exposes a public channel's recent posts
// without the bot needing to be a member/admin of that channel. It is an
// unofficial page (not part of the documented Bot API) and only exposes a
// rolling window of recent posts, not full history.
export interface TelegramPost {
    messageId: number;
    text: string;
    publishedAt: Date;
    mediaUrls: string[];
}

const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BACKGROUND_IMAGE_URL_PATTERN = /url\(['"]?([^'")]+)['"]?\)/;

export default class TelegramProvider implements IProvider<TelegramPost> {
    async fetch(username: string): Promise<TelegramPost[]> {
        const response = await fetch(`https://t.me/s/${username}`, {
            headers: { 'User-Agent': DEFAULT_USER_AGENT },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch t.me/s/${username}: HTTP ${response.status}`);
        }

        const html = await response.text();
        const $ = load(html);
        const posts: TelegramPost[] = [];

        $('.tgme_widget_message').each((_, el) => {
            const $post = $(el);
            const dataPost = $post.attr('data-post');
            const datetime = $post.find('time.time').attr('datetime');

            if (!dataPost || !datetime) {
                return;
            }

            const messageId = Number(dataPost.split('/')[1]);

            if (!Number.isInteger(messageId)) {
                return;
            }

            const mediaUrls: string[] = [];

            $post.find('.tgme_widget_message_photo_wrap').each((_, photoEl) => {
                const style = $(photoEl).attr('style') ?? '';
                const match = BACKGROUND_IMAGE_URL_PATTERN.exec(style);

                if (match) {
                    mediaUrls.push(match[1]);
                }
            });

            $post.find('video').each((_, videoEl) => {
                const src = $(videoEl).attr('src');

                if (src) {
                    mediaUrls.push(src);
                }
            });

            posts.push({
                messageId,
                text: $post.find('.tgme_widget_message_text').first().text().trim(),
                publishedAt: new Date(datetime),
                mediaUrls,
            });
        });

        return posts;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/unit/providers/telegramProvider.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/providers/telegram src/tests/unit/providers`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/providers/telegram/TelegramProvider.ts src/tests/unit/providers/telegramProvider.test.ts
git commit -m "$(cat <<'EOF'
feat: implement TelegramProvider via t.me/s/<username> scraping

Replaces the not-implemented stub. Pulls a public channel's recent
posts from Telegram's unofficial public preview page (no bot
membership required), parsed with cheerio — mirrors RssProvider's
pull shape.
EOF
)"
```

---

### Task 2: TelegramPost model, repository, and DI registration

**Files:**
- Create: `backend/src/db/models/telegram/interface/telegramPost.ts`
- Create: `backend/src/db/models/telegram/telegramPost.ts`
- Create: `backend/src/db/repositories/telegram/interface/telegramPostRepository.ts`
- Create: `backend/src/db/repositories/telegram/telegramPostRepository.ts`
- Modify: `backend/src/db/container.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ITelegramPost`, `ITelegramPostDocument` (models/telegram/interface/telegramPost.ts); `ITelegramPostRepository { create(post: ITelegramPost): Promise<ITelegramPostDocument> }` — consumed by Task 5. DI key `telegramPostRepository`.

No dedicated unit test for this task — see the "Repository classes..." line under Global Constraints. This mirrors how `TelegramChannelRepository` and `RawArticleRepository` were built in this codebase.

- [ ] **Step 1: Create the model interfaces**

Create `backend/src/db/models/telegram/interface/telegramPost.ts`:

```ts
import type { Types } from 'mongoose';

export interface ITelegramPost {
    channelId: number;
    messageId: number;
    text: string;
    publishedAt: Date;
    mediaUrls: string[];
}

export interface ITelegramPostDocument extends ITelegramPost {
    _id: Types.ObjectId;
}
```

- [ ] **Step 2: Create the Mongoose model**

Create `backend/src/db/models/telegram/telegramPost.ts`:

```ts
import { Schema, model } from 'mongoose';
import type { ITelegramPost } from './interface/telegramPost.js';

const telegramPostSchema = new Schema<ITelegramPost>({
    channelId: { type: Number, required: true },
    messageId: { type: Number, required: true },
    text: { type: String, default: '' },
    publishedAt: { type: Date, required: true },
    mediaUrls: { type: [String], default: [] },
});

// Dedup key: the same channel/message pair is never stored twice, even if
// the collector re-scrapes a page that still contains an already-saved post.
telegramPostSchema.index({ channelId: 1, messageId: 1 }, { unique: true });

export default model<ITelegramPost>('TelegramPost', telegramPostSchema);
```

- [ ] **Step 3: Create the repository interface**

Create `backend/src/db/repositories/telegram/interface/telegramPostRepository.ts`:

```ts
import type { ITelegramPost, ITelegramPostDocument } from '../../../models/telegram/interface/telegramPost.js';

export interface ITelegramPostRepository {
    create(post: ITelegramPost): Promise<ITelegramPostDocument>;
}
```

- [ ] **Step 4: Create the repository implementation**

Create `backend/src/db/repositories/telegram/telegramPostRepository.ts`:

```ts
import TelegramPostModel from '../../models/telegram/telegramPost.js';
import type { ITelegramPost, ITelegramPostDocument } from '../../models/telegram/interface/telegramPost.js';
import type { ITelegramPostRepository } from './interface/telegramPostRepository.js';

export default class TelegramPostRepository implements ITelegramPostRepository {
    async create(post: ITelegramPost): Promise<ITelegramPostDocument> {
        return TelegramPostModel.create(post);
    }
}
```

- [ ] **Step 5: Register in the database DI container**

Modify `backend/src/db/container.ts` — add the import and registration:

```ts
import { asClass } from 'awilix';
import type { AwilixContainer } from 'awilix';
import MongoDB from './mongo.js';
import RawArticleRepository from './repositories/feed/rawArticleRepository.js';
import FeedItemRepository from './repositories/feed/feedItemRepository.js';
import DigestRepository from './repositories/digest/digestRepository.js';
import TelegramChannelRepository from './repositories/telegram/telegramChannelRepository.js';
import TelegramPostRepository from './repositories/telegram/telegramPostRepository.js';

export function createDatabaseContainer(container: AwilixContainer) {
    return container.register({
        mongo: asClass(MongoDB).singleton(),
        rawArticleRepository: asClass(RawArticleRepository).scoped(),
        feedItemRepository: asClass(FeedItemRepository).scoped(),
        digestRepository: asClass(DigestRepository).scoped(),
        telegramChannelRepository: asClass(TelegramChannelRepository).scoped(),
        telegramPostRepository: asClass(TelegramPostRepository).scoped(),
    });
}
```

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/db`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/db/models/telegram/interface/telegramPost.ts src/db/models/telegram/telegramPost.ts src/db/repositories/telegram/interface/telegramPostRepository.ts src/db/repositories/telegram/telegramPostRepository.ts src/db/container.ts
git commit -m "$(cat <<'EOF'
feat: add TelegramPost model and repository

New collection for scraped channel posts, deduped on
(channelId, messageId). Registered in the database DI container.
EOF
)"
```

---

### Task 3: `TelegramChannelRepository.findAllWithUsername`

**Files:**
- Modify: `backend/src/db/repositories/telegram/interface/telegramChannelRepository.ts`
- Modify: `backend/src/db/repositories/telegram/telegramChannelRepository.ts`

**Interfaces:**
- Consumes: `ITelegramChannelDocument` (existing, from `db/models/telegram/interface/telegramChannel.ts`).
- Produces: `ITelegramChannelRepository.findAllWithUsername(): Promise<ITelegramChannelDocument[]>` — consumed by Task 5.

No dedicated unit test — same reasoning as Task 2 (thin Mongoose wrapper; exercised via Task 5's mocked-interface tests and Task 9's live check).

- [ ] **Step 1: Add the method to the interface**

Modify `backend/src/db/repositories/telegram/interface/telegramChannelRepository.ts` to:

```ts
import type { ITelegramChannel, ITelegramChannelDocument } from '../../../models/telegram/interface/telegramChannel.js';

export interface ITelegramChannelRepository {
    upsertByChannelId(channel: ITelegramChannel): Promise<ITelegramChannelDocument>;
    findAllWithUsername(): Promise<ITelegramChannelDocument[]>;
}
```

- [ ] **Step 2: Implement it**

Modify `backend/src/db/repositories/telegram/telegramChannelRepository.ts` to:

```ts
import TelegramChannelModel from '../../models/telegram/telegramChannel.js';
import type { ITelegramChannel, ITelegramChannelDocument } from '../../models/telegram/interface/telegramChannel.js';
import type { ITelegramChannelRepository } from './interface/telegramChannelRepository.js';

export default class TelegramChannelRepository implements ITelegramChannelRepository {
    async upsertByChannelId(channel: ITelegramChannel): Promise<ITelegramChannelDocument> {
        const updated = await TelegramChannelModel.findOneAndUpdate(
            { channelId: channel.channelId },
            { $set: channel },
            { upsert: true, new: true }
        );

        // findOneAndUpdate with upsert:true, new:true always resolves a document.
        return updated as ITelegramChannelDocument;
    }

    async findAllWithUsername(): Promise<ITelegramChannelDocument[]> {
        return TelegramChannelModel.find({ username: { $ne: null } });
    }
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/db`
Expected: no errors (note: this will currently fail until Task 5 also exists, because nothing implements the interface's new method requirement yet outside this file itself — actually `tsc --noEmit` only checks that `TelegramChannelRepository` satisfies `ITelegramChannelRepository`, which it now does after Step 2. It passes standalone.)

- [ ] **Step 4: Commit**

```bash
git add src/db/repositories/telegram/interface/telegramChannelRepository.ts src/db/repositories/telegram/telegramChannelRepository.ts
git commit -m "$(cat <<'EOF'
feat: add TelegramChannelRepository.findAllWithUsername

Lets the collector (next task) iterate only channels that have a
public username — private channels registered via a forwarded
message have nothing to scrape and are excluded.
EOF
)"
```

---

### Task 4: `TelegramBotService` — register a channel by plain-text username

**Files:**
- Modify: `backend/src/modules/telegramBot/services/index.ts`
- Modify (full rewrite): `backend/src/tests/unit/telegramBot/telegramBotService.test.ts`

**Interfaces:**
- Consumes: `ITelegramChannelRepository.upsertByChannelId` (existing, unchanged signature).
- Produces: `extractChannelUsername(text: string): string | null` (named export) and `TelegramBotService.registerChannelByUsername(username: string): Promise<ITelegramChannelDocument>` — not consumed by later tasks, but part of the bot's public surface.

- [ ] **Step 1: Replace the test file with the extended test suite (RED)**

Replace the entire contents of `backend/src/tests/unit/telegramBot/telegramBotService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { Types } from 'mongoose';
import type { ChatFullInfo, MessageOriginChannel } from 'grammy/types';

const { getChatMock, botOnMock, botStartMock, botStopMock, mockConfig } = vi.hoisted(() => ({
    getChatMock: vi.fn(),
    botOnMock: vi.fn(),
    botStartMock: vi.fn(),
    botStopMock: vi.fn(),
    mockConfig: { telegramBotToken: undefined as string | undefined },
}));

vi.mock('grammy', () => ({
    Bot: vi.fn().mockImplementation(() => ({
        on: botOnMock,
        start: botStartMock,
        stop: botStopMock,
        api: { getChat: getChatMock },
    })),
}));

vi.mock('../../../modules/config/index.js', () => ({
    default: mockConfig,
}));

import TelegramBotService, { extractChannelUsername } from '../../../modules/telegramBot/services/index.js';
import type { ITelegramChannelRepository } from '../../../db/repositories/telegram/interface/telegramChannelRepository.js';

function channelOrigin(overrides: Partial<MessageOriginChannel['chat']> = {}): MessageOriginChannel {
    return {
        type: 'channel',
        date: 1_700_000_000,
        message_id: 42,
        chat: {
            id: -1001234567890,
            type: 'channel',
            title: 'Дизайн-канал',
            username: 'design_channel',
            ...overrides,
        },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.telegramBotToken = undefined;
});

describe('extractChannelUsername', () => {
    it.each([
        ['@design_channel', 'design_channel'],
        ['t.me/design_channel', 'design_channel'],
        ['https://t.me/design_channel', 'design_channel'],
        ['design_channel', 'design_channel'],
    ])('extracts a username from %s', (input, expected) => {
        expect(extractChannelUsername(input)).toBe(expected);
    });

    it.each([['hello world'], ['abc'], ['']])('returns null for non-matching text: %s', (input) => {
        expect(extractChannelUsername(input)).toBeNull();
    });
});

describe('TelegramBotService.registerForwardedChannel', () => {
    let telegramChannelRepository: { upsertByChannelId: Mock<ITelegramChannelRepository['upsertByChannelId']> };
    let service: TelegramBotService;

    beforeEach(() => {
        telegramChannelRepository = {
            upsertByChannelId: vi.fn<ITelegramChannelRepository['upsertByChannelId']>(),
        };
        service = new TelegramBotService({ telegramChannelRepository });
    });

    it('upserts the channel from a channel-post forward origin', async () => {
        const saved = {
            _id: new Types.ObjectId(),
            channelId: -1001234567890,
            username: 'design_channel',
            title: 'Дизайн-канал',
            addedAt: new Date(),
        };
        telegramChannelRepository.upsertByChannelId.mockResolvedValue(saved);

        const result = await service.registerForwardedChannel(channelOrigin());

        expect(telegramChannelRepository.upsertByChannelId).toHaveBeenCalledWith({
            channelId: -1001234567890,
            username: 'design_channel',
            title: 'Дизайн-канал',
            addedAt: expect.any(Date),
        });
        expect(result).toBe(saved);
    });

    it('stores null username for channels without a public handle', async () => {
        telegramChannelRepository.upsertByChannelId.mockResolvedValue({
            _id: new Types.ObjectId(),
            channelId: -1009999999999,
            username: null,
            title: 'Приватный канал',
            addedAt: new Date(),
        });

        await service.registerForwardedChannel(
            channelOrigin({ id: -1009999999999, title: 'Приватный канал', username: undefined })
        );

        expect(telegramChannelRepository.upsertByChannelId).toHaveBeenCalledWith(
            expect.objectContaining({ username: null })
        );
    });
});

describe('TelegramBotService.start', () => {
    it('does not start polling when no bot token is configured', () => {
        const telegramChannelRepository = { upsertByChannelId: vi.fn() };
        const service = new TelegramBotService({ telegramChannelRepository });

        expect(() => service.start()).not.toThrow();
        expect(botStartMock).not.toHaveBeenCalled();
    });

    it('starts long polling when a bot token is configured', () => {
        mockConfig.telegramBotToken = 'test-token';
        const telegramChannelRepository = { upsertByChannelId: vi.fn() };
        const service = new TelegramBotService({ telegramChannelRepository });

        service.start();

        expect(botStartMock).toHaveBeenCalledTimes(1);
    });
});

describe('TelegramBotService.registerChannelByUsername', () => {
    let telegramChannelRepository: { upsertByChannelId: Mock<ITelegramChannelRepository['upsertByChannelId']> };
    let service: TelegramBotService;

    beforeEach(() => {
        mockConfig.telegramBotToken = 'test-token';
        telegramChannelRepository = {
            upsertByChannelId: vi.fn<ITelegramChannelRepository['upsertByChannelId']>(),
        };
        service = new TelegramBotService({ telegramChannelRepository });
    });

    it('resolves the channel via getChat and upserts it', async () => {
        getChatMock.mockResolvedValue({
            id: -1009876543210,
            type: 'channel',
            title: 'Публичный канал',
            username: 'public_channel',
        } as ChatFullInfo);
        const saved = {
            _id: new Types.ObjectId(),
            channelId: -1009876543210,
            username: 'public_channel',
            title: 'Публичный канал',
            addedAt: new Date(),
        };
        telegramChannelRepository.upsertByChannelId.mockResolvedValue(saved);

        const result = await service.registerChannelByUsername('public_channel');

        expect(getChatMock).toHaveBeenCalledWith({ chat_id: '@public_channel' });
        expect(telegramChannelRepository.upsertByChannelId).toHaveBeenCalledWith({
            channelId: -1009876543210,
            username: 'public_channel',
            title: 'Публичный канал',
            addedAt: expect.any(Date),
        });
        expect(result).toBe(saved);
    });

    it('rejects when the resolved chat is not a channel', async () => {
        getChatMock.mockResolvedValue({ id: 123, type: 'private', first_name: 'Not a channel' } as ChatFullInfo);

        await expect(service.registerChannelByUsername('some_user')).rejects.toThrow('is not a channel');
        expect(telegramChannelRepository.upsertByChannelId).not.toHaveBeenCalled();
    });

    it('propagates a getChat failure (e.g. channel not found)', async () => {
        getChatMock.mockRejectedValue(new Error('Bad Request: chat not found'));

        await expect(service.registerChannelByUsername('missing_channel')).rejects.toThrow(
            'chat not found'
        );
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/unit/telegramBot/telegramBotService.test.ts`
Expected: FAIL — `extractChannelUsername` is not exported and `registerChannelByUsername` does not exist yet (TypeScript/import error, or undefined-is-not-a-function at runtime depending on how vitest reports it).

- [ ] **Step 3: Implement the extended service (GREEN)**

Replace the entire contents of `backend/src/modules/telegramBot/services/index.ts`:

```ts
import { Bot } from 'grammy';
import type { Context } from 'grammy';
import type { ChatFullInfo, MessageOriginChannel } from 'grammy/types';
import config from '../../config/index.js';
import type { ITelegramChannelRepository } from '../../../db/repositories/telegram/interface/telegramChannelRepository.js';
import type { ITelegramChannelDocument } from '../../../db/models/telegram/interface/telegramChannel.js';

// Telegram public usernames are 5-32 chars of letters, digits and underscore.
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{5,32}$/;

// Accepts "@name", "t.me/name", "https://t.me/name", or bare "name".
export function extractChannelUsername(text: string): string | null {
    const withoutUrl = text.trim().replace(/^(https?:\/\/)?t\.me\//i, '');
    const withoutAt = withoutUrl.replace(/^@/, '');

    return USERNAME_PATTERN.test(withoutAt) ? withoutAt : null;
}

export default class TelegramBotService {
    private readonly telegramChannelRepository: ITelegramChannelRepository;
    private readonly bot: Bot | null;

    constructor({ telegramChannelRepository }: { telegramChannelRepository: ITelegramChannelRepository }) {
        this.telegramChannelRepository = telegramChannelRepository;
        this.bot = config.telegramBotToken ? new Bot(config.telegramBotToken) : null;

        this.bot?.on('message', (ctx) => this.handleMessage(ctx));
    }

    start() {
        if (!this.bot) {
            console.warn('[TelegramBotService] TELEGRAM_BOT_TOKEN not set — bot not started.');
            return;
        }

        // Long polling — not a webhook. Works identically in local dev and in
        // the cluster without needing an inbound Ingress route or public DNS,
        // unlike a webhook which would need both.
        void this.bot.start();
        console.log('🤖 Telegram bot started (long polling)');
    }

    stop() {
        void this.bot?.stop();
    }

    private async handleMessage(ctx: Context): Promise<void> {
        const origin = ctx.message?.forward_origin;

        if (origin && origin.type === 'channel') {
            const channel = await this.registerForwardedChannel(origin);
            await ctx.reply(`Канал «${channel.title}» добавлен как источник ✅`);
            return;
        }

        const text = ctx.message?.text;
        const username = text ? extractChannelUsername(text) : null;

        if (!username) {
            return;
        }

        try {
            const channel = await this.registerChannelByUsername(username);
            await ctx.reply(`Канал «${channel.title}» добавлен как источник ✅`);
        } catch {
            await ctx.reply('Канал не найден. Проверьте username и попробуйте снова.');
        }
    }

    async registerForwardedChannel(origin: MessageOriginChannel): Promise<ITelegramChannelDocument> {
        return this.telegramChannelRepository.upsertByChannelId({
            channelId: origin.chat.id,
            username: origin.chat.username ?? null,
            title: origin.chat.title,
            addedAt: new Date(),
        });
    }

    async registerChannelByUsername(username: string): Promise<ITelegramChannelDocument> {
        if (!this.bot) {
            throw new Error('Telegram bot is not configured');
        }

        const chat: ChatFullInfo = await this.bot.api.getChat({ chat_id: `@${username}` });

        if (chat.type !== 'channel') {
            throw new Error(`"@${username}" is not a channel`);
        }

        return this.telegramChannelRepository.upsertByChannelId({
            channelId: chat.id,
            username: chat.username ?? null,
            title: chat.title,
            addedAt: new Date(),
        });
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/unit/telegramBot/telegramBotService.test.ts`
Expected: PASS (all tests across all four describe blocks)

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/modules/telegramBot src/tests/unit/telegramBot`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/modules/telegramBot/services/index.ts src/tests/unit/telegramBot/telegramBotService.test.ts
git commit -m "$(cat <<'EOF'
feat: register a Telegram channel from a plain-text username

Users can now send @username, t.me/username, or a bare username to
the bot (in addition to forwarding a channel post). Resolves via Bot
API getChat, which also validates the channel exists before it's
saved.
EOF
)"
```

---

### Task 5: `TelegramCollectorService`

**Files:**
- Create: `backend/src/modules/telegramCollector/interfaces/index.ts`
- Create: `backend/src/modules/telegramCollector/services/index.ts`
- Create: `backend/src/tests/unit/telegramCollector/telegramCollectorService.test.ts`

**Interfaces:**
- Consumes: `IProvider<TelegramPost>` (`telegramProvider`, Task 1), `ITelegramChannelRepository.findAllWithUsername` (Task 3), `ITelegramPostRepository.create` (Task 2), `isDuplicateKeyError` from `src/common/utils.ts` (existing).
- Produces: `ITelegramCollector { collect(): Promise<number> }`, default-exported `TelegramCollectorService` implementing it — consumed by Task 6 and Task 7 (DI key `telegramCollectorService`).

- [ ] **Step 1: Write the failing test (RED)**

Create `backend/src/tests/unit/telegramCollector/telegramCollectorService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { Types } from 'mongoose';
import TelegramCollectorService from '../../../modules/telegramCollector/services/index.js';
import type { ITelegramChannelRepository } from '../../../db/repositories/telegram/interface/telegramChannelRepository.js';
import type { ITelegramPostRepository } from '../../../db/repositories/telegram/interface/telegramPostRepository.js';
import type { IProvider } from '../../../providers/interfaces.js';
import type { TelegramPost } from '../../../providers/telegram/TelegramProvider.js';

function channel(overrides: Partial<{ channelId: number; username: string | null; title: string }> = {}) {
    return {
        _id: new Types.ObjectId(),
        channelId: -1001111111111,
        username: 'channel_a',
        title: 'Channel A',
        addedAt: new Date(),
        ...overrides,
    };
}

describe('TelegramCollectorService.collect', () => {
    let telegramProvider: { fetch: Mock<IProvider<TelegramPost>['fetch']> };
    let telegramChannelRepository: {
        findAllWithUsername: Mock<ITelegramChannelRepository['findAllWithUsername']>;
        upsertByChannelId: Mock<ITelegramChannelRepository['upsertByChannelId']>;
    };
    let telegramPostRepository: { create: Mock<ITelegramPostRepository['create']> };
    let service: TelegramCollectorService;

    beforeEach(() => {
        vi.clearAllMocks();

        telegramProvider = { fetch: vi.fn<IProvider<TelegramPost>['fetch']>() };
        telegramChannelRepository = {
            findAllWithUsername: vi.fn<ITelegramChannelRepository['findAllWithUsername']>(),
            upsertByChannelId: vi.fn<ITelegramChannelRepository['upsertByChannelId']>(),
        };
        telegramPostRepository = { create: vi.fn<ITelegramPostRepository['create']>() };

        service = new TelegramCollectorService({
            telegramProvider,
            telegramChannelRepository,
            telegramPostRepository,
        });
    });

    it('fetches and saves posts for every channel that has a public username', async () => {
        telegramChannelRepository.findAllWithUsername.mockResolvedValue([channel()]);
        telegramProvider.fetch.mockResolvedValue([
            { messageId: 1, text: 'Hello', publishedAt: new Date('2026-08-19'), mediaUrls: [] },
        ]);
        telegramPostRepository.create.mockResolvedValue({
            _id: new Types.ObjectId(),
            channelId: -1001111111111,
            messageId: 1,
            text: 'Hello',
            publishedAt: new Date('2026-08-19'),
            mediaUrls: [],
        });

        const saved = await service.collect();

        expect(telegramProvider.fetch).toHaveBeenCalledWith('channel_a');
        expect(telegramPostRepository.create).toHaveBeenCalledWith({
            channelId: -1001111111111,
            messageId: 1,
            text: 'Hello',
            publishedAt: new Date('2026-08-19'),
            mediaUrls: [],
        });
        expect(saved).toBe(1);
    });

    it('does not let one failing channel abort collection of the others', async () => {
        telegramChannelRepository.findAllWithUsername.mockResolvedValue([
            channel({ channelId: -1, username: 'channel_a' }),
            channel({ channelId: -2, username: 'channel_b' }),
        ]);
        telegramProvider.fetch
            .mockRejectedValueOnce(new Error('scrape failed'))
            .mockResolvedValueOnce([
                { messageId: 5, text: 'B post', publishedAt: new Date('2026-08-19'), mediaUrls: [] },
            ]);
        telegramPostRepository.create.mockResolvedValue({
            _id: new Types.ObjectId(),
            channelId: -2,
            messageId: 5,
            text: 'B post',
            publishedAt: new Date('2026-08-19'),
            mediaUrls: [],
        });

        const saved = await service.collect();

        expect(saved).toBe(1);
    });

    it('skips a post gracefully when it was already collected (duplicate key)', async () => {
        telegramChannelRepository.findAllWithUsername.mockResolvedValue([channel()]);
        telegramProvider.fetch.mockResolvedValue([
            { messageId: 1, text: 'Hello', publishedAt: new Date('2026-08-19'), mediaUrls: [] },
        ]);
        telegramPostRepository.create.mockRejectedValue(
            Object.assign(new Error('E11000 duplicate key error'), { code: 11000 })
        );

        const saved = await service.collect();

        expect(saved).toBe(0);
    });

    it('propagates a non-duplicate-key error from the post repository as a channel failure', async () => {
        telegramChannelRepository.findAllWithUsername.mockResolvedValue([channel()]);
        telegramProvider.fetch.mockResolvedValue([
            { messageId: 1, text: 'Hello', publishedAt: new Date('2026-08-19'), mediaUrls: [] },
        ]);
        telegramPostRepository.create.mockRejectedValue(new Error('connection reset'));

        const saved = await service.collect();

        expect(saved).toBe(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/unit/telegramCollector/telegramCollectorService.test.ts`
Expected: FAIL with "Cannot find module '../../../modules/telegramCollector/services/index.js'"

- [ ] **Step 3: Write the interfaces file**

Create `backend/src/modules/telegramCollector/interfaces/index.ts`:

```ts
export interface ITelegramCollector {
    collect(): Promise<number>;
}
```

- [ ] **Step 4: Write the minimal implementation (GREEN)**

Create `backend/src/modules/telegramCollector/services/index.ts`:

```ts
import { isDuplicateKeyError } from '../../../common/utils.js';
import type { IProvider } from '../../../providers/interfaces.js';
import type { TelegramPost } from '../../../providers/telegram/TelegramProvider.js';
import type { ITelegramChannelRepository } from '../../../db/repositories/telegram/interface/telegramChannelRepository.js';
import type { ITelegramChannelDocument } from '../../../db/models/telegram/interface/telegramChannel.js';
import type { ITelegramPostRepository } from '../../../db/repositories/telegram/interface/telegramPostRepository.js';
import type { ITelegramCollector } from '../interfaces/index.js';

export default class TelegramCollectorService implements ITelegramCollector {
    private readonly telegramProvider: IProvider<TelegramPost>;
    private readonly telegramChannelRepository: ITelegramChannelRepository;
    private readonly telegramPostRepository: ITelegramPostRepository;

    constructor({
        telegramProvider,
        telegramChannelRepository,
        telegramPostRepository,
    }: {
        telegramProvider: IProvider<TelegramPost>;
        telegramChannelRepository: ITelegramChannelRepository;
        telegramPostRepository: ITelegramPostRepository;
    }) {
        this.telegramProvider = telegramProvider;
        this.telegramChannelRepository = telegramChannelRepository;
        this.telegramPostRepository = telegramPostRepository;
    }

    /**
     * Fetches every registered channel that has a public username and
     * persists posts that aren't already stored (deduped by channelId +
     * messageId). One channel failing never aborts the others.
     */
    async collect(): Promise<number> {
        const channels = await this.telegramChannelRepository.findAllWithUsername();

        const results = await Promise.allSettled(
            channels.map((channel) => this.collectFromChannel(channel))
        );

        let saved = 0;

        for (let i = 0; i < results.length; i++) {
            const result = results[i];

            if (result.status === 'fulfilled') {
                saved += result.value;
            } else {
                console.error(
                    `[TelegramCollectorService] Failed to collect from "@${channels[i].username}":`,
                    result.reason
                );
            }
        }

        return saved;
    }

    private async collectFromChannel(channel: ITelegramChannelDocument): Promise<number> {
        // channel.username is guaranteed non-null: findAllWithUsername filters for it.
        const posts = await this.telegramProvider.fetch(channel.username as string);

        let saved = 0;

        for (const post of posts) {
            try {
                await this.telegramPostRepository.create({
                    channelId: channel.channelId,
                    messageId: post.messageId,
                    text: post.text,
                    publishedAt: post.publishedAt,
                    mediaUrls: post.mediaUrls,
                });
                saved += 1;
            } catch (error) {
                if (isDuplicateKeyError(error)) {
                    continue;
                }

                throw error;
            }
        }

        return saved;
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/tests/unit/telegramCollector/telegramCollectorService.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/modules/telegramCollector src/tests/unit/telegramCollector`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/modules/telegramCollector/interfaces/index.ts src/modules/telegramCollector/services/index.ts src/tests/unit/telegramCollector/telegramCollectorService.test.ts
git commit -m "$(cat <<'EOF'
feat: add TelegramCollectorService

Iterates registered channels with a public username, pulls their
recent posts via TelegramProvider, and persists new ones. Mirrors
RssCollectorServices.collect(): Promise.allSettled per channel,
duplicate-key errors treated as expected steady state, not failures.
EOF
)"
```

---

### Task 6: `TelegramSchedulerService`

**Files:**
- Modify: `backend/src/modules/config/index.ts`
- Create: `backend/src/modules/telegramScheduler/index.ts`
- Create: `backend/src/tests/unit/telegramScheduler/telegramSchedulerService.test.ts`

**Interfaces:**
- Consumes: `ITelegramCollector` (Task 5), `config.telegramCronSchedule: string` (this task).
- Produces: `TelegramSchedulerService` with `start()`/`stop()` — consumed by Task 7 (DI key `telegramSchedulerService`) and Task 8 (`index.ts`).

- [ ] **Step 1: Write the failing test (RED)**

Create `backend/src/tests/unit/telegramScheduler/telegramSchedulerService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

const { scheduleMock, stopMock } = vi.hoisted(() => ({
    scheduleMock: vi.fn(),
    stopMock: vi.fn(),
}));

vi.mock('node-cron', () => ({
    default: {
        schedule: scheduleMock,
    },
}));

vi.mock('../../../modules/config/index.js', () => ({
    default: {
        telegramCronSchedule: '*/45 * * * *',
    },
}));

import TelegramSchedulerService from '../../../modules/telegramScheduler/index.js';
import type { ITelegramCollector } from '../../../modules/telegramCollector/interfaces/index.js';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

describe('TelegramSchedulerService', () => {
    let telegramCollectorService: { collect: Mock<ITelegramCollector['collect']> };
    let service: TelegramSchedulerService;

    beforeEach(() => {
        vi.clearAllMocks();
        scheduleMock.mockReturnValue({ stop: stopMock });

        telegramCollectorService = { collect: vi.fn<ITelegramCollector['collect']>().mockResolvedValue(0) };
        service = new TelegramSchedulerService({ telegramCollectorService });
    });

    it('schedules Telegram collection using the configured cron expression', () => {
        service.start();

        expect(scheduleMock).toHaveBeenCalledTimes(1);
        expect(scheduleMock).toHaveBeenCalledWith('*/45 * * * *', expect.any(Function));
    });

    it('does not schedule twice if start() is called again', () => {
        service.start();
        service.start();

        expect(scheduleMock).toHaveBeenCalledTimes(1);
    });

    it('triggers telegramCollectorService.collect() when the scheduled task fires', async () => {
        service.start();

        const scheduledFn = scheduleMock.mock.calls[0][1];
        await scheduledFn();

        expect(telegramCollectorService.collect).toHaveBeenCalledTimes(1);
    });

    it('skips a tick that fires while the previous collect() run is still in progress', async () => {
        const { promise, resolve } = deferred<number>();
        telegramCollectorService.collect.mockReturnValue(promise);

        service.start();
        const scheduledFn = scheduleMock.mock.calls[0][1];

        scheduledFn();
        scheduledFn();

        expect(telegramCollectorService.collect).toHaveBeenCalledTimes(1);

        resolve(0);
        await promise;
    });

    it('stops the underlying task', () => {
        service.start();
        service.stop();

        expect(stopMock).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/unit/telegramScheduler/telegramSchedulerService.test.ts`
Expected: FAIL with "Cannot find module '../../../modules/telegramScheduler/index.js'"

- [ ] **Step 3: Add the config getter**

Modify `backend/src/modules/config/index.ts` — add the default constant near the top (next to `DEFAULT_RSS_CRON_SCHEDULE`):

```ts
const DEFAULT_RSS_CRON_SCHEDULE = '0 * * * *';
const DEFAULT_TELEGRAM_CRON_SCHEDULE = '0 * * * *';
```

And add the getter to the `config` object, after `telegramBotToken`:

```ts
    get telegramBotToken(): string | undefined {
        return process.env.TELEGRAM_BOT_TOKEN || undefined;
    },
    // Independent of RSS_CRON_SCHEDULE — t.me/s/<username> is an unofficial
    // page, not a rate-limited API we're meant to hit as often as RSS.
    get telegramCronSchedule(): string {
        return process.env.TELEGRAM_CRON_SCHEDULE || DEFAULT_TELEGRAM_CRON_SCHEDULE;
    },
};
```

- [ ] **Step 4: Write the minimal implementation (GREEN)**

Create `backend/src/modules/telegramScheduler/index.ts`:

```ts
import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import config from '../config/index.js';
import type { ITelegramCollector } from '../telegramCollector/interfaces/index.js';

export default class TelegramSchedulerService {
    private readonly telegramCollectorService: ITelegramCollector;
    private task: ScheduledTask | null = null;
    private isCollecting = false;

    constructor({ telegramCollectorService }: { telegramCollectorService: ITelegramCollector }) {
        this.telegramCollectorService = telegramCollectorService;
    }

    start() {
        if (this.task) {
            return;
        }

        this.task = cron.schedule(config.telegramCronSchedule, () => {
            if (this.isCollecting) {
                console.warn('[TelegramSchedulerService] Skipping Telegram collect tick — previous run still in progress');
                return;
            }

            this.isCollecting = true;

            this.telegramCollectorService
                .collect()
                .catch((err) => {
                    console.error('[TelegramSchedulerService] Scheduled Telegram collect failed:', err);
                })
                .finally(() => {
                    this.isCollecting = false;
                });
        });

        console.log(`🕒 Telegram collection scheduled: "${config.telegramCronSchedule}"`);
    }

    stop() {
        this.task?.stop();
        this.task = null;
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/tests/unit/telegramScheduler/telegramSchedulerService.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Type-check, lint, and run the full suite**

Run: `npx tsc --noEmit && npx eslint src/modules/telegramScheduler src/modules/config src/tests/unit/telegramScheduler && npx vitest run`
Expected: no errors; all test files pass (this also re-confirms Task 1-5 tests still pass with the config file change)

- [ ] **Step 7: Commit**

```bash
git add src/modules/config/index.ts src/modules/telegramScheduler/index.ts src/tests/unit/telegramScheduler/telegramSchedulerService.test.ts
git commit -m "$(cat <<'EOF'
feat: add TelegramSchedulerService

Own cron schedule (TELEGRAM_CRON_SCHEDULE, default hourly),
independent of RSS_CRON_SCHEDULE. Mirrors SchedulerService's
re-entrancy guard so overlapping ticks never run collect() twice
concurrently.
EOF
)"
```

---

### Task 7: Controller, route, and remaining DI wiring

**Files:**
- Create: `backend/src/controller/telegramController/index.ts`
- Create: `backend/src/routes/telegram.ts`
- Modify: `backend/src/controller/container.ts`
- Modify: `backend/src/modules/container.ts`

**Interfaces:**
- Consumes: `TelegramCollectorService` (Task 5), `TelegramSchedulerService` (Task 6).
- Produces: `GET /telegram/collect` HTTP endpoint; DI keys `telegramController`, `telegramCollectorService`, `telegramSchedulerService` — the latter two consumed by Task 8 (`index.ts`).

No new unit test: this task is pure wiring, matching how `RssController`/`rssController` registration has no dedicated test either (it's covered by `tsc --noEmit` catching any DI/type mismatch, and Task 9's live Docker check exercises the route for real).

- [ ] **Step 1: Create the controller**

Create `backend/src/controller/telegramController/index.ts`:

```ts
import type { Request, Response } from 'express';
import type TelegramCollectorService from '../../modules/telegramCollector/services/index.js';

export default class TelegramController {
    private readonly telegramCollectorService: TelegramCollectorService;

    constructor({ telegramCollectorService }: { telegramCollectorService: TelegramCollectorService }) {
        this.telegramCollectorService = telegramCollectorService;
    }

    async collectTelegram(req: Request, res: Response) {
        const saved = await this.telegramCollectorService.collect();

        res.json({ saved });
    }
}
```

- [ ] **Step 2: Create the route definition**

Create `backend/src/routes/telegram.ts`:

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
        ];
    }
}
```

- [ ] **Step 3: Register the controller in the controllers DI container**

Modify `backend/src/controller/container.ts` to:

```ts
import { asClass } from 'awilix';
import type { AwilixContainer } from 'awilix';
import RssController from './rssController/index.js';
import FeedController from './feed/index.js';
import HealthController from './health/index.js';
import DigestController from './digest/index.js';
import TelegramController from './telegramController/index.js';

export function createControllersContainer(container: AwilixContainer) {
    return container.register({
        rssController: asClass(RssController).scoped(),
        feedController: asClass(FeedController).scoped(),
        healthController: asClass(HealthController).scoped(),
        digestController: asClass(DigestController).scoped(),
        telegramController: asClass(TelegramController).scoped(),
    });
}
```

- [ ] **Step 4: Register the collector and scheduler in the services DI container**

Modify `backend/src/modules/container.ts` to:

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
    });
}
```

- [ ] **Step 5: Type-check, lint, and run the full suite**

Run: `npx tsc --noEmit && npx eslint src/controller src/routes src/modules/container.ts && npx vitest run`
Expected: no errors; all tests still pass

- [ ] **Step 6: Commit**

```bash
git add src/controller/telegramController/index.ts src/routes/telegram.ts src/controller/container.ts src/modules/container.ts
git commit -m "$(cat <<'EOF'
feat: add GET /telegram/collect and wire the collector/scheduler DI

Manual trigger for the Telegram collector, mirroring GET /rss/collect.
EOF
)"
```

---

### Task 8: Start the scheduler from `index.ts`, document the new env var

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: DI key `telegramSchedulerService` (Task 7).
- Produces: nothing further consumed by later tasks — this is the final wiring point.

- [ ] **Step 1: Start the Telegram scheduler alongside the RSS one**

Modify `backend/src/index.ts` — in the `server.listen` callback, change:

```ts
    if (schedulerEnabled) {
        const schedulerService = container.resolve<{ start: () => void }>('schedulerService');
        schedulerService.start();
    }

    // No-op when TELEGRAM_BOT_TOKEN is unset — see TelegramBotService.start().
    const telegramBotService = container.resolve<{ start: () => void }>('telegramBotService');
    telegramBotService.start();
});
```

to:

```ts
    if (schedulerEnabled) {
        const schedulerService = container.resolve<{ start: () => void }>('schedulerService');
        schedulerService.start();

        const telegramSchedulerService = container.resolve<{ start: () => void }>('telegramSchedulerService');
        telegramSchedulerService.start();
    }

    // No-op when TELEGRAM_BOT_TOKEN is unset — see TelegramBotService.start().
    const telegramBotService = container.resolve<{ start: () => void }>('telegramBotService');
    telegramBotService.start();
});
```

(Only the `if (schedulerEnabled)` block changes — the `telegramBotService.start()` call below it, and everything else in the file, stays as-is.)

- [ ] **Step 2: Document the new env var**

Modify `backend/.env.example` — append after the existing `TELEGRAM_BOT_TOKEN` line:

```
# Cron schedule for the Telegram channel collector (TelegramSchedulerService).
# Independent of RSS_CRON_SCHEDULE — t.me/s/<username> is an unofficial page,
# so this defaults to hourly rather than matching RSS's cadence.
TELEGRAM_CRON_SCHEDULE=0 * * * *
```

- [ ] **Step 3: Type-check, lint, and run the full suite**

Run: `npx tsc --noEmit && npx eslint src/index.ts && npx vitest run`
Expected: no errors; all tests pass

- [ ] **Step 4: Commit**

```bash
git add src/index.ts .env.example
git commit -m "$(cat <<'EOF'
feat: start the Telegram scheduler alongside the RSS scheduler

Gated on the same ENABLE_IN_PROCESS_SCHEDULER flag as the RSS
scheduler. Documents TELEGRAM_CRON_SCHEDULE in .env.example.
EOF
)"
```

---

### Task 9: Full verification

**Files:** none (verification only; fix forward in the relevant task's files if something fails).

**Interfaces:** N/A.

- [ ] **Step 1: Full type-check**

Run (from `backend/`): `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Full lint**

Run: `npx eslint src`
Expected: no errors

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: all test files pass, including every file touched in Tasks 1-6

- [ ] **Step 4: Live verification in Docker**

From the project root (`Digest Plans Project/`, not `backend/`):

```bash
docker compose up -d --build backend-service
docker compose logs backend-service --tail 40
```

Expected in the logs: `MongoDB connected`, `Application started`, the route list including `🚀 GET /telegram/collect`, `🕒 Telegram collection scheduled: "0 * * * *"` (alongside the existing RSS scheduler line), and — since no real `TELEGRAM_BOT_TOKEN` is configured locally — `[TelegramBotService] TELEGRAM_BOT_TOKEN not set — bot not started.`. No `AwilixResolutionError` and no crash/exit.

- [ ] **Step 5: Confirm the manual trigger endpoint responds**

```bash
curl -s http://localhost:3000/telegram/collect
```

Expected: `{"saved":0}` (no channels registered yet in this environment, so nothing to collect — a 200 with `saved: 0` confirms the whole DI chain resolves and runs end-to-end without error).

- [ ] **Step 6: Confirm the stack is still healthy**

```bash
curl -s http://localhost:3000/health
docker compose ps
```

Expected: `{"status":"ok","mongo":"connected"}`, and `backend-service` shows `Up` with no restart loop.

No commit for this task unless a fix was needed — in that case, amend the fix into the task it belongs to (per the normal TDD workflow), re-run that task's tests, and re-run Steps 1-6 above.
