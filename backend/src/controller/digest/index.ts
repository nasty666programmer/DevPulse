import type { Request, Response } from 'express';
import type { IDigestReader } from '../../modules/digest/interfaces/index.js';

export default class DigestController {
    private readonly digestService: IDigestReader;

    constructor({ digestService }: { digestService: IDigestReader }) {
        this.digestService = digestService;
    }

    async getLatest(req: Request, res: Response) {
        const digest = await this.digestService.getLatestDigest();

        if (!digest) {
            res.status(204).end();
            return;
        }

        res.json(digest);
    }
}
