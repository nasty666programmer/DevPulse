import type { DigestDto } from '../types';
import { parseErrorMessage } from './http';

export async function fetchLatestDigest(): Promise<DigestDto | null> {
  const res = await fetch('/digest/latest');
  if (res.status === 204) {
    return null;
  }
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as DigestDto;
}
