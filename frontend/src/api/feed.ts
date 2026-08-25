import type { Category, CollectResultDto, FeedItemDto } from '../types';
import { parseErrorMessage } from './http';

// All requests use relative paths so the Vite dev-server proxy (see vite.config.ts)
// and any production reverse-proxy both work without code changes.

const DEFAULT_LIMIT = 20;

// The RSS collection step performs real network requests + full-text extraction on the
// backend, so it can legitimately take a while. Keep a generous client-side timeout.
const COLLECT_TIMEOUT_MS = 30_000;

export async function fetchFeedItems(limit = DEFAULT_LIMIT, category?: Category): Promise<FeedItemDto[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (category) {
    params.set('category', category);
  }

  const res = await fetch(`/feed/items?${params}`);
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
