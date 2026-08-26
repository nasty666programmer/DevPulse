import type { Request, Response } from 'express';
import { DuplicateFeedSourceError, FeedSourceNotFoundError, InvalidFeedSourceUrlError } from '../../modules/feedSource/errors.js';
import { toFeedSourceDto } from '../../modules/feedSource/mappers.js';
import type { IFeedSourceService } from '../../modules/feedSource/interfaces/index.js';

export default class FeedSourceController {
    private readonly feedSourceService: IFeedSourceService;

    constructor({ feedSourceService }: { feedSourceService: IFeedSourceService }) {
        this.feedSourceService = feedSourceService;
    }

    async add(req: Request, res: Response) {
        const url = req.body?.url;

        if (typeof url !== 'string' || !url.trim()) {
            res.status(400).json({ error: 'url is required' });
            return;
        }

        try {
            const source = await this.feedSourceService.add(req.userId as string, url);
            res.status(201).json(toFeedSourceDto(source));
        } catch (error) {
            if (error instanceof InvalidFeedSourceUrlError) {
                res.status(400).json({ error: 'invalid_url' });
                return;
            }

            if (error instanceof DuplicateFeedSourceError) {
                res.status(409).json({ error: 'already_added' });
                return;
            }

            throw error;
        }
    }

    async list(req: Request, res: Response) {
        const sources = await this.feedSourceService.list(req.userId as string);
        res.json(sources.map(toFeedSourceDto));
    }

    async remove(req: Request, res: Response) {
        try {
            await this.feedSourceService.remove(req.userId as string, req.params.id as string);
            res.status(204).end();
        } catch (error) {
            if (error instanceof FeedSourceNotFoundError) {
                res.status(404).json({ error: 'not_found' });
                return;
            }

            throw error;
        }
    }
}
