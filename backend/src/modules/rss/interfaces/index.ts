import type { FeedItem } from '../../parsers/interfaces/index.js';

export interface IFeedFetcher {
    fetchFeed(sourceUrl: string): Promise<FeedItem[]>;
}

export interface IRssCollector {
    collect(): Promise<number>;
}
