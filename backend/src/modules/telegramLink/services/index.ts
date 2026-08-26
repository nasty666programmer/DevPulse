import { Types } from 'mongoose';
import { isDuplicateKeyError } from '../../../common/utils.js';
import { InvalidLinkCodeError } from '../errors.js';
import type { ITelegramLinkCodeRepository } from '../../../db/repositories/telegramLinkCode/interface/telegramLinkCodeRepository.js';
import type { ITelegramLinkService, TelegramLinkCodeResult } from '../interfaces/index.js';

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes — short-lived, re-requestable.
const MAX_GENERATE_ATTEMPTS = 5;

function randomSixDigitCode(): string {
    // 100000-999999 — always exactly 6 digits, never a leading zero to worry about.
    return String(Math.floor(100000 + Math.random() * 900000));
}

export default class TelegramLinkService implements ITelegramLinkService {
    private readonly telegramLinkCodeRepository: ITelegramLinkCodeRepository;

    constructor({
        telegramLinkCodeRepository,
    }: {
        telegramLinkCodeRepository: ITelegramLinkCodeRepository;
    }) {
        this.telegramLinkCodeRepository = telegramLinkCodeRepository;
    }

    async generateCode(userId: string): Promise<TelegramLinkCodeResult> {
        // Only one outstanding code per user — a fresh request supersedes
        // whatever code they were shown before.
        await this.telegramLinkCodeRepository.deleteByUser(userId);

        const expiresAt = new Date(Date.now() + CODE_TTL_MS);

        for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt++) {
            const code = randomSixDigitCode();

            try {
                await this.telegramLinkCodeRepository.create({
                    userId: new Types.ObjectId(userId),
                    code,
                    expiresAt,
                    createdAt: new Date(),
                });

                return { code, expiresAt };
            } catch (error) {
                if (!isDuplicateKeyError(error)) {
                    throw error;
                }
                // Another user already holds this exact 6-digit code right now — retry with a new one.
            }
        }

        throw new Error('Could not generate a unique link code after several attempts');
    }

    async consumeCode(code: string): Promise<string> {
        const record = await this.telegramLinkCodeRepository.findByCode(code);

        if (!record || record.expiresAt.getTime() < Date.now()) {
            throw new InvalidLinkCodeError();
        }

        await this.telegramLinkCodeRepository.deleteByCode(code);

        return record.userId.toString();
    }
}
