import type { FeedSourceDto } from '../types';
import { parseErrorMessage } from './http';

const ADD_ERROR_MESSAGES: Record<number, string> = {
  400: 'Некорректный адрес — укажите ссылку на RSS-ленту (http/https).',
  409: 'Этот источник уже добавлен.',
};

export async function fetchFeedSources(): Promise<FeedSourceDto[]> {
  const res = await fetch('/feed-sources');
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as FeedSourceDto[];
}

export async function addFeedSource(url: string): Promise<FeedSourceDto> {
  const res = await fetch('/feed-sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    throw new Error(ADD_ERROR_MESSAGES[res.status] ?? (await parseErrorMessage(res)));
  }
  return (await res.json()) as FeedSourceDto;
}

export async function removeFeedSource(id: string): Promise<void> {
  const res = await fetch(`/feed-sources/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
}
