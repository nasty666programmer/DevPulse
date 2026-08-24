const EXCERPT_MAX_LENGTH = 220;
const READING_WPM = 200;

/**
 * Trim `content` to roughly `EXCERPT_MAX_LENGTH` characters, cutting on a word boundary
 * and appending an ellipsis. Used for the collapsed card excerpt.
 */
export function toExcerpt(content: string, maxLength = EXCERPT_MAX_LENGTH): string {
  const normalized = content.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) return normalized;

  const sliced = normalized.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(' ');
  const boundary = lastSpace > maxLength * 0.6 ? lastSpace : maxLength;
  return `${sliced.slice(0, boundary).trimEnd()}…`;
}

/**
 * Split full article content into paragraphs. Splits on double newlines when present;
 * otherwise falls back to a single paragraph block.
 */
export function toParagraphs(content: string): string[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const byDoubleNewline = trimmed
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (byDoubleNewline.length > 1) return byDoubleNewline;

  // No double-newline paragraphs found — try single newlines as a fallback,
  // otherwise treat the whole thing as one paragraph.
  const bySingleNewline = trimmed
    .split(/\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return bySingleNewline.length > 1 ? bySingleNewline : [trimmed];
}

/** Rough reading time estimate in whole minutes (minimum 1). */
export function estimateReadingMinutes(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / READING_WPM));
}

/** First letter of a display name, uppercased — the fallback avatar glyph. */
export function userInitial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || '?';
}

/** Format an ISO date string as "17 авг, 08:14" (ru locale, short month). */
export function formatArticleDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const datePart = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(date);
  const timePart = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  return `${datePart.replace('.', '')}, ${timePart}`;
}
