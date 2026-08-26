export type TelegramLinkCodeResult = {
    code: string;
    expiresAt: Date;
};

export interface ITelegramLinkService {
    generateCode(userId: string): Promise<TelegramLinkCodeResult>;
    // Throws InvalidLinkCodeError when the code doesn't exist or has expired;
    // otherwise consumes it (one-time use) and returns the owning userId.
    consumeCode(code: string): Promise<string>;
}
