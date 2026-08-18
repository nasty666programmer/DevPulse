import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { mkdtemp, readFile, rm } from 'fs/promises';
import path from 'path';
import os from 'os';

vi.mock('../../../modules/config/index.js', () => ({
    default: {
        digestOutputDir: 'digests',
    },
}));

import DigestService from '../../../modules/digest/services/index.js';
import config from '../../../modules/config/index.js';
import type { DigestArticle, IDigestArticleSource } from '../../../modules/digest/interfaces/index.js';

describe('DigestService.renderDigest', () => {
    const service = new DigestService({ feedService: { listItemsByDate: vi.fn() } });

    it('renders a markdown list of articles', () => {
        const articles: DigestArticle[] = [
            { title: 'Node.js 26 released', url: 'https://example.com/node-26', source: 'example.com' },
            { title: 'Docker update', url: null, source: null },
        ];

        const markdown = service.renderDigest({ date: new Date('2026-08-18'), articles });

        expect(markdown).toContain('# Дайджест — 2026-08-18');
        expect(markdown).toContain('- [Node.js 26 released](https://example.com/node-26) — example.com');
        expect(markdown).toContain('- Docker update');
    });

    it('renders a fallback message when there are no articles', () => {
        const markdown = service.renderDigest({ date: new Date('2026-08-18'), articles: [] });

        expect(markdown).toContain('# Дайджест — 2026-08-18');
        expect(markdown).toContain('Сегодня новостей нет.');
    });
});

describe('DigestService.buildDigestData / generateDigest', () => {
    let feedService: { listItemsByDate: Mock<IDigestArticleSource['listItemsByDate']> };
    let service: DigestService;
    let tmpDir: string;

    beforeEach(async () => {
        feedService = { listItemsByDate: vi.fn<IDigestArticleSource['listItemsByDate']>() };
        service = new DigestService({ feedService });

        tmpDir = await mkdtemp(path.join(os.tmpdir(), 'digest-test-'));
        vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await rm(tmpDir, { recursive: true, force: true });
    });

    it('builds digest data from the injected article source', async () => {
        const date = new Date('2026-08-18');
        const articles: DigestArticle[] = [{ title: 'Post', url: 'https://example.com/post', source: 'example.com' }];
        feedService.listItemsByDate.mockResolvedValue(articles);

        const data = await service.buildDigestData(date);

        expect(feedService.listItemsByDate).toHaveBeenCalledWith(date);
        expect(data).toEqual({ date, articles });
    });

    it('writes digests/YYYY-MM-DD.md relative to the configured output dir', async () => {
        const date = new Date('2026-08-18');
        feedService.listItemsByDate.mockResolvedValue([
            { title: 'Post', url: 'https://example.com/post', source: 'example.com' },
        ]);

        await service.generateDigest(date);

        const filePath = path.join(tmpDir, config.digestOutputDir, '2026-08-18.md');
        const content = await readFile(filePath, 'utf-8');

        expect(content).toContain('# Дайджест — 2026-08-18');
        expect(content).toContain('[Post](https://example.com/post)');
    });

    it('does not fail when there are no articles for the day', async () => {
        const date = new Date('2026-08-19');
        feedService.listItemsByDate.mockResolvedValue([]);

        await expect(service.generateDigest(date)).resolves.toBeUndefined();

        const filePath = path.join(tmpDir, config.digestOutputDir, '2026-08-19.md');
        const content = await readFile(filePath, 'utf-8');

        expect(content).toContain('Сегодня новостей нет.');
    });
});
