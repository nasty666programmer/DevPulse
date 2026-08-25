import fetch from 'node-fetch';
import config from '../../modules/config/index.js';
import Logger from '../../modules/logger/index.js';
import { SummarizerTimeoutError, SummarizerUnavailableError } from './errors.js';
import type { ISummarizerProvider } from './interface/summarizerProvider.js';

type SummarizeResponseBody = { summary: string };

function isSummarizeResponseBody(value: unknown): value is SummarizeResponseBody {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { summary: unknown }).summary === 'string'
    );
}

export default class SummarizerProvider implements ISummarizerProvider {
    async summarize(text: string): Promise<string> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.summarizerTimeoutMs);

        let response;
        try {
            response = await fetch(`${config.summarizerServiceUrl}/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
                signal: controller.signal,
            });
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new SummarizerTimeoutError();
            }

            Logger.warn('[SummarizerProvider] request to summarizer-service failed', {
                error: error instanceof Error ? error.message : error,
            });
            throw new SummarizerUnavailableError();
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            Logger.warn('[SummarizerProvider] summarizer-service returned an error status', {
                status: response.status,
            });
            throw new SummarizerUnavailableError(`summarizer-service responded with ${response.status}`);
        }

        let body: unknown;
        try {
            body = await response.json();
        } catch (error) {
            Logger.warn('[SummarizerProvider] summarizer-service returned a non-JSON response body', {
                error: error instanceof Error ? error.message : error,
            });
            throw new SummarizerUnavailableError('summarizer-service returned a malformed response');
        }

        if (!isSummarizeResponseBody(body)) {
            throw new SummarizerUnavailableError('summarizer-service returned a malformed response');
        }

        return body.summary;
    }
}
