import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({
    fetchMock: vi.fn(),
}));

vi.mock('node-fetch', () => ({
    default: fetchMock,
}));

vi.mock('../../../modules/config/index.js', () => ({
    default: {
        summarizerServiceUrl: 'http://summarizer-service:8000',
        summarizerTimeoutMs: 15000,
    },
}));

import SummarizerProvider from '../../../providers/summarizer/SummarizerProvider.js';
import { SummarizerTimeoutError, SummarizerUnavailableError } from '../../../providers/summarizer/errors.js';

function jsonResponse(body: unknown, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    };
}

describe('SummarizerProvider.summarize', () => {
    let provider: SummarizerProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        provider = new SummarizerProvider();
    });

    it('POSTs the text to summarizer-service and returns the summary', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ summary: 'A short summary.' }));

        const result = await provider.summarize('some article text');

        expect(result).toBe('A short summary.');
        expect(fetchMock).toHaveBeenCalledWith(
            'http://summarizer-service:8000/summarize',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ text: 'some article text' }),
            })
        );
    });

    it('throws SummarizerUnavailableError on a non-200 response', async () => {
        fetchMock.mockResolvedValue(jsonResponse({}, 500));

        await expect(provider.summarize('text')).rejects.toThrow(SummarizerUnavailableError);
    });

    it('throws SummarizerUnavailableError on a malformed response body', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ notSummary: 'oops' }));

        await expect(provider.summarize('text')).rejects.toThrow(SummarizerUnavailableError);
    });

    it('throws SummarizerUnavailableError when the response body is not valid JSON', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => {
                throw new SyntaxError('Unexpected token');
            },
        });

        await expect(provider.summarize('text')).rejects.toThrow(SummarizerUnavailableError);
    });

    it('throws SummarizerUnavailableError on a network failure', async () => {
        fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(provider.summarize('text')).rejects.toThrow(SummarizerUnavailableError);
    });

    it('throws SummarizerTimeoutError when the request is aborted', async () => {
        fetchMock.mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));

        await expect(provider.summarize('text')).rejects.toThrow(SummarizerTimeoutError);
    });
});
