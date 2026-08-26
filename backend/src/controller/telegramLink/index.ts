import type { Request, Response } from 'express';
import type { ITelegramLinkService } from '../../modules/telegramLink/interfaces/index.js';

export default class TelegramLinkController {
    private readonly telegramLinkService: ITelegramLinkService;

    constructor({ telegramLinkService }: { telegramLinkService: ITelegramLinkService }) {
        this.telegramLinkService = telegramLinkService;
    }

    async requestCode(req: Request, res: Response) {
        const { code, expiresAt } = await this.telegramLinkService.generateCode(req.userId as string);

        res.json({ code, expiresAt });
    }
}
