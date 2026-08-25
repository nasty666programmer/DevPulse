import { describe, it, expect, vi } from 'vitest';
import SummarizerService from '../../../modules/summarizer/services/index.js';
import { MIN_SUMMARIZABLE_LENGTH, isSummarizable } from '../../../modules/summarizer/interfaces/index.js';

describe('SummarizerService.summarize', () => {
    it('delegates to the provider with trimmed text', async () => {
        const summarizerProvider = { summarize: vi.fn().mockResolvedValue('A summary.') };
        const service = new SummarizerService({ summarizerProvider });

        const result = await service.summarize('  some text with padding  ');

        expect(result).toBe('A summary.');
        expect(summarizerProvider.summarize).toHaveBeenCalledWith('some text with padding');
    });

    it('propagates provider errors', async () => {
        const error = new Error('boom');
        const summarizerProvider = { summarize: vi.fn().mockRejectedValue(error) };
        const service = new SummarizerService({ summarizerProvider });

        await expect(service.summarize('text')).rejects.toThrow(error);
    });
});

describe('isSummarizable', () => {
    it('is false for text shorter than MIN_SUMMARIZABLE_LENGTH', () => {
        expect(isSummarizable('a'.repeat(MIN_SUMMARIZABLE_LENGTH - 1))).toBe(false);
    });

    it('is true for text exactly at MIN_SUMMARIZABLE_LENGTH', () => {
        expect(isSummarizable('a'.repeat(MIN_SUMMARIZABLE_LENGTH))).toBe(true);
    });

    it('trims before measuring, so padding whitespace does not count', () => {
        const padded = ` ${'a'.repeat(MIN_SUMMARIZABLE_LENGTH - 1)} `;
        expect(isSummarizable(padded)).toBe(false);
    });
});
