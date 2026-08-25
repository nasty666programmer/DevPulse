// Backend API contract — see design/DESIGN_SPEC.md and backend routes under /feed, /rss and /digest.

// Mirrors backend's Category union (modules/categorization/interfaces/index.ts) — kept in
// sync by hand since it's a small, rarely-changing set tied to CategorizationService's rules.
export type Category = 'Node.js' | 'Docker' | 'AWS' | 'DevOps' | 'AI' | 'Прочее';

export const CATEGORIES: Category[] = ['Node.js', 'Docker', 'AWS', 'DevOps', 'AI', 'Прочее'];

export type FeedItemDto = {
  id: string;
  title: string;
  /** Full extracted article text (plain text, may be long). */
  content: string;
  /** ISO date string. */
  date: string;
  category: Category;
  url: string | null;
  source: string | null;
  /** AI-generated summary, null until a reader requests one. */
  summary: string | null;
};

export type CollectResultDto = {
  saved: number;
};

export type DigestDto = {
  /** ISO date string — when this digest snapshot was generated. */
  generatedAt: string;
  articles: FeedItemDto[];
};

export type TelegramChannelDto = {
  id: string;
  channelId: number;
  username: string | null;
  title: string;
  /** ISO date string — when the channel was registered via the bot. */
  addedAt: string;
};

export type TelegramPostDto = {
  id: string;
  channelId: number;
  text: string;
  /** ISO date string. */
  publishedAt: string;
  mediaUrls: string[];
  /** AI-generated summary, null until a reader requests one. */
  summary: string | null;
};

export type AuthUserDto = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};
