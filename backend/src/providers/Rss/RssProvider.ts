import Parser from 'rss-parser';
import type { FeedItem } from '../../modules/parsers/interfaces/index.js';
import type { IProvider } from '../interfaces.js';

export default class RssProvider implements IProvider<FeedItem> {
    private readonly parser: Parser;

    constructor() {
        this.parser = new Parser();
    }

    async fetch(sourceUrl: string): Promise<FeedItem[]> {
        // TODO: Implement logic for retry mechanism from config or maybe wrapper
        const feed = await this.parser.parseURL(sourceUrl);

        return feed.items as FeedItem[];
    }
}
