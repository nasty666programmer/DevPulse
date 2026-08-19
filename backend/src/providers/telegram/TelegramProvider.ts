import fetch from 'node-fetch';
import { load } from 'cheerio';
import type { IProvider } from '../interfaces.js';

// One channel post scraped from the public https://t.me/s/<username> preview
// page — the only surface that exposes a public channel's recent posts
// without the bot needing to be a member/admin of that channel. It is an
// unofficial page (not part of the documented Bot API) and only exposes a
// rolling window of recent posts, not full history.
export interface TelegramPost {
    messageId: number;
    text: string;
    publishedAt: Date;
    mediaUrls: string[];
}

const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BACKGROUND_IMAGE_URL_PATTERN = /url\(['"]?([^'")]+)['"]?\)/;

export default class TelegramProvider implements IProvider<TelegramPost> {
    async fetch(username: string): Promise<TelegramPost[]> {
        const response = await fetch(`https://t.me/s/${username}`, {
            headers: { 'User-Agent': DEFAULT_USER_AGENT },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch t.me/s/${username}: HTTP ${response.status}`);
        }

        const html = await response.text();
        const $ = load(html);
        const posts: TelegramPost[] = [];

        $('.tgme_widget_message').each((_, el) => {
            const $post = $(el);
            const dataPost = $post.attr('data-post');
            const datetime = $post.find('time.time').attr('datetime');

            if (!dataPost || !datetime) {
                return;
            }

            const messageId = Number(dataPost.split('/')[1]);

            if (!Number.isInteger(messageId)) {
                return;
            }

            const mediaUrls: string[] = [];

            $post.find('.tgme_widget_message_photo_wrap').each((_, photoEl) => {
                const style = $(photoEl).attr('style') ?? '';
                const match = BACKGROUND_IMAGE_URL_PATTERN.exec(style);

                if (match) {
                    mediaUrls.push(match[1]);
                }
            });

            $post.find('video').each((_, videoEl) => {
                const src = $(videoEl).attr('src');

                if (src) {
                    mediaUrls.push(src);
                }
            });

            posts.push({
                messageId,
                text: $post.find('.tgme_widget_message_text').first().text().trim(),
                publishedAt: new Date(datetime),
                mediaUrls,
            });
        });

        return posts;
    }
}
