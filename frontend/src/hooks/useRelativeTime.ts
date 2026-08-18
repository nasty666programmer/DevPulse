import { useEffect, useState } from 'react';
import { formatRelativeTime } from '../utils/relativeTime';

const TICK_MS = 60_000;

/**
 * Returns a live "обновлено N минут назад" string for `since`, re-computed once a
 * minute. Returns null when `since` is null (nothing fetched yet).
 */
export function useRelativeTime(since: Date | null): string | null {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, [since]);

  if (!since) return null;
  return formatRelativeTime(since);
}
