import { describe, it, expect } from 'vitest';
import TelegramProvider from '../../../providers/TelegramProvider.js';

describe('TelegramProvider', () => {
    it('rejects with a clear "not implemented yet" error, naming the requested channel', async () => {
        const provider = new TelegramProvider();

        await expect(provider.fetch('@some_channel')).rejects.toThrow(/not implemented yet.*@some_channel/);
    });
});
