import type { Request, Response } from 'express';
import type { IDigestGenerator, IDigestReader } from '../../modules/digest/interfaces/index.js';

export default class DigestController {
    private readonly digestService: IDigestReader & IDigestGenerator;

    constructor({ digestService }: { digestService: IDigestReader & IDigestGenerator }) {
        this.digestService = digestService;
    }

    async getLatest(req: Request, res: Response) {
        const digest = await this.digestService.getLatestDigest(req.userId as string);

        if (!digest) {
            res.status(204).end();
            return;
        }

        res.json(digest);
    }

    async generate(req: Request, res: Response) {
        const digest = await this.digestService.generateDigest(req.userId as string);

        res.json(digest);
    }
}
