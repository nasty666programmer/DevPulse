import type { TelegramChannelDto, TelegramPostDto } from '../types';
import { parseErrorMessage } from './http';

export type TelegramChannelsPage = {
  channels: TelegramChannelDto[];
  total: number;
  page: number;
  pageSize: number;
};

// Full, unpaginated list — used by the channel-chip overview row, which
// shows every registered channel at once regardless of the column view's
// current page.
export async function fetchTelegramChannels(): Promise<TelegramChannelDto[]> {
  const res = await fetch('/telegram/channels');
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as TelegramChannelDto[];
}

export async function fetchTelegramChannelsPage(page: number, limit: number): Promise<TelegramChannelsPage> {
  const res = await fetch(`/telegram/channels?page=${page}&limit=${limit}`);
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as TelegramChannelsPage;
}

// Scoped to exactly the given channels (one page's worth) — the backend caps
// each channel's own post count independently, so a quiet channel doesn't
// get crowded out of a shared limit by a more active one on the same page.
export async function fetchTelegramPostsForChannels(channelIds: number[]): Promise<TelegramPostDto[]> {
  if (channelIds.length === 0) {
    return [];
  }
  const res = await fetch(`/telegram/posts?channelIds=${channelIds.join(',')}`);
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as TelegramPostDto[];
}
