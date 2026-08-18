/** Format a duration since `date` as a Russian relative-time phrase for the header. */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'обновлено только что';
  if (diffMin < 60) return `обновлено ${diffMin} ${pluralMinutes(diffMin)} назад`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `обновлено ${diffHours} ${pluralHours(diffHours)} назад`;

  const diffDays = Math.floor(diffHours / 24);
  return `обновлено ${diffDays} ${pluralDays(diffDays)} назад`;
}

function pluralMinutes(n: number): string {
  return pluralRu(n, 'минуту', 'минуты', 'минут');
}

function pluralHours(n: number): string {
  return pluralRu(n, 'час', 'часа', 'часов');
}

function pluralDays(n: number): string {
  return pluralRu(n, 'день', 'дня', 'дней');
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
