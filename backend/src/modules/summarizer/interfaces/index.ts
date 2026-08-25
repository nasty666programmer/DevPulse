export interface ISummarizerService {
    summarize(text: string): Promise<string>;
}

// Shared "is this worth summarizing" threshold — used by both FeedController
// and TelegramController for the pre-call 400 guard, and duplicated by hand
// in the frontend cards (same convention as the Category union between here
// and frontend/src/types.ts: kept in sync deliberately, not automatically).
export const MIN_SUMMARIZABLE_LENGTH = 200;

export function isSummarizable(text: string): boolean {
    return text.trim().length >= MIN_SUMMARIZABLE_LENGTH;
}
