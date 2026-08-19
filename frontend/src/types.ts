// Backend API contract — see design/DESIGN_SPEC.md and backend routes under /feed, /rss and /digest.

export type FeedItemDto = {
  id: string;
  title: string;
  /** Full extracted article text (plain text, may be long). */
  content: string;
  /** ISO date string. */
  date: string;
  url: string | null;
  source: string | null;
};

export type CollectResultDto = {
  saved: number;
};

export type DigestDto = {
  /** ISO date string — the day this digest covers. */
  date: string;
  articles: FeedItemDto[];
};
