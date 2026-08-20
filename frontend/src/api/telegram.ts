import type { TelegramChannelDto, TelegramPostDto } from '../types';
import { parseErrorMessage } from './http';

const DEFAULT_POSTS_LIMIT = 20;

export async function fetchTelegramChannels(): Promise<TelegramChannelDto[]> {
  const res = await fetch('/telegram/channels');
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as TelegramChannelDto[];
}

export async function fetchTelegramPosts(limit = DEFAULT_POSTS_LIMIT): Promise<TelegramPostDto[]> {
  const res = await fetch(`/telegram/posts?limit=${limit}`);
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as TelegramPostDto[];
}
