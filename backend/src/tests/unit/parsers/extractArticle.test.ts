import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({
    fetchMock: vi.fn(),
}));

vi.mock('node-fetch', () => ({
    default: fetchMock,
}));

import { extractArticle } from '../../../modules/parsers/services/extractArticle.js';
import { BlockedError, HttpStatusError } from '../../../modules/parsers/errors.js';

function fakeResponse(options: {
    status?: number;
    ok?: boolean;
    body?: string;
    url?: string;
    redirected?: boolean;
    contentType?: string | null;
}) {
    const {
        status = 200,
        ok = status >= 200 && status < 300,
        body = '',
        url = 'https://example.com/article',
        redirected = false,
        contentType = 'text/html; charset=utf-8',
    } = options;

    return {
        status,
        ok,
        url,
        redirected,
        headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
        text: async () => body,
        arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    };
}

const ARTICLE_HTML = `
<!DOCTYPE html>
<html>
<head><title>Node.js Streams Explained</title></head>
<body>
<nav>Home | Blog | About</nav>
<article>
<h1>Node.js Streams Explained</h1>
<p>Streams are one of the fundamental concepts in Node.js that power everything from reading files to
handling HTTP requests. Understanding how backpressure works is essential for building reliable
services that process large amounts of data without exhausting available memory.</p>
<p>In this article we walk through readable, writable, duplex and transform streams, and show how
piping multiple streams together lets you build efficient processing pipelines without buffering
entire payloads in memory at once. We also cover common pitfalls developers run into.</p>
</article>
<footer>Copyright 2026</footer>
</body>
</html>
`;

const GARBAGE_HTML = `
<!DOCTYPE html>
<html>
<head><title>Empty</title></head>
<body></body>
</html>
`;

describe('extractArticle', () => {
    beforeEach(() => {
        fetchMock.mockReset();
    });

    it('extracts the main article text from a well-formed page', async () => {
        fetchMock.mockResolvedValue(fakeResponse({ body: ARTICLE_HTML }));

        const result = await extractArticle('https://example.com/streams');

        expect(result).not.toBeNull();
        expect(result?.title).toBe('Node.js Streams Explained');
        expect(result?.textContent).toContain('backpressure');
        expect(result?.textContent.length).toBeGreaterThan(200);
    });

    it('returns null when the page body has no content at all', async () => {
        fetchMock.mockResolvedValue(fakeResponse({ body: GARBAGE_HTML }));

        const result = await extractArticle('https://example.com/empty');

        expect(result).toBeNull();
    });

    it('throws BlockedError on 403/429 responses', async () => {
        fetchMock.mockResolvedValue(fakeResponse({ status: 403, ok: false }));

        await expect(extractArticle('https://example.com/blocked')).rejects.toBeInstanceOf(BlockedError);
    });

    it('throws HttpStatusError on other non-ok responses', async () => {
        fetchMock.mockResolvedValue(fakeResponse({ status: 500, ok: false }));

        await expect(extractArticle('https://example.com/error')).rejects.toBeInstanceOf(HttpStatusError);
    });
});
