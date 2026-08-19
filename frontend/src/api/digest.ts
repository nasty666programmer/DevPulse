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

// Regenerates the digest straight from the database — doesn't touch RSS
// collection, so it's fast and safe to call on its own.
export async function generateDigest(): Promise<DigestDto> {
  const res = await fetch('/digest/generate');
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as DigestDto;
}
