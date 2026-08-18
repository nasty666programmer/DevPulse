import type { CollectResultDto, FeedItemDto } from '../types';

// All requests use relative paths so the Vite dev-server proxy (see vite.config.ts)
// and any production reverse-proxy both work without code changes.

const DEFAULT_LIMIT = 20;

// The RSS collection step performs real network requests + full-text extraction on the
// backend, so it can legitimately take a while. Keep a generous client-side timeout.
const COLLECT_TIMEOUT_MS = 30_000;

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (text) return `${res.status} ${res.statusText}: ${text.slice(0, 200)}`;
  } catch {
    // ignore
  }
  return `${res.status} ${res.statusText}`;
}

export async function fetchFeedItems(limit = DEFAULT_LIMIT): Promise<FeedItemDto[]> {
  const res = await fetch(`/feed/items?limit=${limit}`);
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as FeedItemDto[];
}

export async function collectFeed(): Promise<CollectResultDto> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), COLLECT_TIMEOUT_MS);
  try {
    const res = await fetch('/rss/collect', { signal: controller.signal });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res));
    }
    return (await res.json()) as CollectResultDto;
  } finally {
    clearTimeout(timeoutId);
  }
}
