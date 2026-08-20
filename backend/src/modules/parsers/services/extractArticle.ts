import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import iconv from 'iconv-lite';
import type { ExtractArticleOptions, ExtractedArticle } from '../interfaces/index.js';
import { BlockedError, HttpStatusError, NetworkError, TimeoutError } from '../errors.js';
import Logger from '../../logger/index.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractCharset(contentType: string | null): string | null {
    if (!contentType) return null;
    const match = /charset=([^;]+)/i.exec(contentType);
    return match ? match[1].trim().toLowerCase() : null;
}

async function decodeBody(response: import('node-fetch').Response): Promise<string> {
    const contentType = response.headers.get('content-type');
    const charset = extractCharset(contentType);

    if (!charset || charset === 'utf-8' || charset === 'utf8') {
        return response.text();
    }

    if (!iconv.encodingExists(charset)) {
        return response.text();
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return iconv.decode(buffer, charset);
}

async function fetchHtml(
    url: string,
    timeoutMs: number,
    userAgent: string
): Promise<{ html: string; finalUrl: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
        response = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': userAgent,
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
            },
        });
    } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') {
            throw new TimeoutError(url, timeoutMs);
        }
        throw new NetworkError(url, err);
    } finally {
        clearTimeout(timer);
    }

    if (response.status === 403 || response.status === 429) {
        throw new BlockedError(response.status);
    }

    if (!response.ok) {
        throw new HttpStatusError(response.status);
    }

    try {
        const originalHost = new URL(url).hostname;
        const finalHost = new URL(response.url).hostname;
        if (response.redirected && originalHost !== finalHost) {
            Logger.warn(`[extractArticle] Redirected cross-domain: ${originalHost} -> ${finalHost} (${url})`);
        }
    } catch {
        // ignore malformed URL comparison, not fatal
    }

    const html = await decodeBody(response);
    return { html, finalUrl: response.url || url };
}

async function fetchHtmlWithRetry(
    url: string,
    timeoutMs: number,
    userAgent: string,
    retryOnNetworkError: boolean
): Promise<{ html: string; finalUrl: string }> {
    try {
        return await fetchHtml(url, timeoutMs, userAgent);
    } catch (err) {
        const isRetryable = err instanceof TimeoutError || err instanceof NetworkError;
        if (retryOnNetworkError && isRetryable) {
            await delay(500);
            return fetchHtml(url, timeoutMs, userAgent);
        }
        throw err;
    }
}

/**
 * Downloads a page and extracts its main article content via Readability.
 * Returns null if Readability could not find article content.
 * Throws BlockedError / HttpStatusError / TimeoutError / NetworkError on failure.
 */
export async function extractArticle(
    url: string,
    options: ExtractArticleOptions = {}
): Promise<ExtractedArticle | null> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    const retryOnNetworkError = options.retryOnNetworkError ?? true;

    const { html, finalUrl } = await fetchHtmlWithRetry(url, timeoutMs, userAgent, retryOnNetworkError);

    const dom = new JSDOM(html, { url: finalUrl });
    const article = new Readability(dom.window.document).parse();

    if (!article) {
        return null;
    }

    return {
        title: article.title ?? null,
        textContent: article.textContent?.trim() ?? '',
        contentHtml: article.content ?? '',
        excerpt: article.excerpt ?? null,
        siteName: article.siteName ?? null,
        length: article.length ?? 0,
    };
}

export default extractArticle;
