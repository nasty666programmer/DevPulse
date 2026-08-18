import pLimit from 'p-limit';
import { JSDOM } from 'jsdom';
import { extractArticle } from './extractArticle.js';
import { BlockedError } from '../errors.js';
import type { FeedItem, ProcessedFeedItem, ProcessFeedItemsOptions } from '../interfaces/index.js';

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minMs: number, maxMs: number) {
    const ms = minMs + Math.random() * Math.max(0, maxMs - minMs);
    return delay(ms);
}

function htmlToText(html: string): string {
    try {
        return new JSDOM(html).window.document.body.textContent?.trim() ?? '';
    } catch {
        return html.replace(/<[^>]+>/g, ' ').trim();
    }
}

function fallbackContent(item: FeedItem): { fullText: string; cleanHtml: string } {
    const rawHtml =
        (item['content:encoded'] as string | undefined) ||
        item.content ||
        item.description ||
        item.contentSnippet ||
        '';

    return {
        fullText: htmlToText(rawHtml),
        cleanHtml: rawHtml,
    };
}

async function processSingleItem(
    item: FeedItem,
    options: ProcessFeedItemsOptions
): Promise<ProcessedFeedItem> {
    const url = item.link;

    if (!url) {
        const fallback = fallbackContent(item);
        return { ...item, ...fallback, extractionStatus: 'error', extractionError: 'Missing item.link' };
    }

    try {
        const article = await extractArticle(url, {
            timeoutMs: options.timeoutMs,
            userAgent: options.userAgent,
            retryOnNetworkError: options.retryOnNetworkError,
        });

        if (!article) {
            const fallback = fallbackContent(item);
            return { ...item, ...fallback, extractionStatus: 'fallback' };
        }

        return {
            ...item,
            fullText: article.textContent,
            cleanHtml: article.contentHtml,
            extractionStatus: 'ok',
        };
    } catch (err) {
        const status = err instanceof BlockedError ? 'blocked' : 'error';
        const message = err instanceof Error ? err.message : String(err);

        options.onError?.(url, err);
        console.error(`[processFeedItems] Failed to extract "${url}": ${message}`);

        const fallback = fallbackContent(item);
        return { ...item, ...fallback, extractionStatus: status, extractionError: message };
    }
}

/**
 * Enriches feed items with full article text extracted from item.link.
 * Falls back to item.description / content:encoded when extraction fails
 * or Readability can't find article content. Never throws for a single item.
 */
export async function processFeedItems(
    items: FeedItem[],
    options: ProcessFeedItemsOptions = {}
): Promise<ProcessedFeedItem[]> {
    const concurrency = options.concurrency ?? 3;
    const delayMinMs = options.delayMinMs ?? 300;
    const delayMaxMs = options.delayMaxMs ?? 500;

    const limit = pLimit(concurrency);

    const tasks = items.map((item) =>
        limit(async () => {
            await randomDelay(delayMinMs, delayMaxMs);
            return processSingleItem(item, options);
        })
    );

    return Promise.all(tasks);
}

export default processFeedItems;
