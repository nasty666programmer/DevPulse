import Parser from 'rss-parser';
import type { FeedItem } from '../../modules/parsers/interfaces/index.js';
import type { IProvider } from '../interfaces.js';

export default class RssProvider implements IProvider<FeedItem> {
    private readonly parser: Parser;

    constructor() {
        // Some sources reject requests with no/generic User-Agent as bot
        // traffic (seen in practice: dou.ua returning a bare 403). Identify
        // honestly as a feed aggregator rather than spoofing a browser.
        this.parser = new Parser({
            headers: {
                'User-Agent': 'DevPulse/1.0 (+https://github.com/nasty666programmer/DevPulse; RSS aggregator)',
            },
        });
    }

    async fetch(sourceUrl: string): Promise<FeedItem[]> {
        // TODO: Implement logic for retry mechanism from config or maybe wrapper
        const feed = await this.parser.parseURL(sourceUrl);

        return feed.items as FeedItem[];
    }
}
