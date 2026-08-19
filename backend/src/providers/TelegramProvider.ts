import type { IProvider } from './interfaces.js';

// One channel post, once there's a real Bot API integration to produce them.
export interface TelegramPost {
    channelHandle: string;
    messageId: number;
    text: string;
    publishedAt: Date;
    mediaUrls: string[];
}

/**
 * Stub — no real Telegram Bot API integration yet.
 *
 * Unlike RssProvider, Telegram bots are push-based: updates arrive via
 * webhook (a channel post, or a user forwarding a message to the bot), not
 * pulled on demand. This fetch(source) shape mirrors IProvider for now as a
 * placeholder; the real implementation will likely need an event-driven
 * interface instead once it's actually built, not a fetch-on-demand one.
 */
export default class TelegramProvider implements IProvider<TelegramPost> {
    async fetch(channelHandle: string): Promise<TelegramPost[]> {
        throw new Error(
            `TelegramProvider.fetch is not implemented yet (requested channel: ${channelHandle})`
        );
    }
}
