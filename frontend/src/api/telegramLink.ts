import type { TelegramLinkCodeDto } from '../types';
import { parseErrorMessage } from './http';

export async function requestTelegramLinkCode(): Promise<TelegramLinkCodeDto> {
  const res = await fetch('/users/me/telegram-link-code', { method: 'POST' });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as TelegramLinkCodeDto;
}
