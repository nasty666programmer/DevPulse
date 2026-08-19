import type { Request, Response } from 'express';
import type TelegramCollectorService from '../../modules/telegramCollector/services/index.js';

export default class TelegramController {
    private readonly telegramCollectorService: TelegramCollectorService;

    constructor({
        telegramCollectorService,
    }: {
        telegramCollectorService: TelegramCollectorService;
    }) {
        this.telegramCollectorService = telegramCollectorService;
    }

    async collectTelegram(req: Request, res: Response) {
        const saved = await this.telegramCollectorService.collect();

        res.json({ saved });
    }
}
