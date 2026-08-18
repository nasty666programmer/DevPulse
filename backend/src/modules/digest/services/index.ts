import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import config from '../../config/index.js';
import type { DigestArticle, DigestData, IDigestArticleSource, IDigestGenerator } from '../interfaces/index.js';

function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function renderArticleLine(article: DigestArticle): string {
    const label = article.url ? `[${article.title}](${article.url})` : article.title;
    const suffix = article.source ? ` — ${article.source}` : '';

    return `- ${label}${suffix}`;
}

export default class DigestService implements IDigestGenerator {
    private readonly feedArticleSource: IDigestArticleSource;

    constructor({ feedService }: { feedService: IDigestArticleSource }) {
        this.feedArticleSource = feedService;
    }

    async buildDigestData(date: Date): Promise<DigestData> {
        const articles = await this.feedArticleSource.listItemsByDate(date);

        return { date, articles };
    }

    renderDigest(data: DigestData): string {
        const header = `# Дайджест — ${formatDate(data.date)}`;

        if (data.articles.length === 0) {
            return `${header}\n\nСегодня новостей нет.\n`;
        }

        const lines = data.articles.map(renderArticleLine);

        return `${header}\n\n${lines.join('\n')}\n`;
    }

    async writeDigest(content: string, date: Date): Promise<void> {
        const dir = path.resolve(process.cwd(), config.digestOutputDir);
        const filePath = path.join(dir, `${formatDate(date)}.md`);

        await mkdir(dir, { recursive: true });
        await writeFile(filePath, content, 'utf-8');

        console.log(`[DigestService] Wrote digest to ${filePath}`);
    }

    async generateDigest(date: Date = new Date()): Promise<void> {
        const data = await this.buildDigestData(date);
        const content = this.renderDigest(data);

        await this.writeDigest(content, date);
    }
}
