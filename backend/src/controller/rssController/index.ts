import type { Request, Response } from 'express';
import type RssCollectorServices from '../../modules/rss/services/index.js';

export default class RssController {
    private readonly rssCollectorService: RssCollectorServices;

    constructor({ rssCollectorService }: { rssCollectorService: RssCollectorServices }) {
        this.rssCollectorService = rssCollectorService;
    }

    async collectRss(req: Request, res: Response) {
        const saved = await this.rssCollectorService.collect();

        res.json({ saved });
    }
}
