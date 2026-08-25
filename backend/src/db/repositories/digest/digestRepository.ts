import DigestModel from '../../models/digest/digest.js';
import type { DigestArticle, DigestData } from '../../../modules/digest/interfaces/index.js';
import type { IDigestRepository } from './interface/digestRepository.js';

export default class DigestRepository implements IDigestRepository {
    async save(articles: DigestArticle[]): Promise<DigestData> {
        const generatedAt = new Date();

        // Singleton: replaces the one existing digest document wholesale (or
        // creates it on first run) — there's no per-day key to match on anymore.
        await DigestModel.findOneAndReplace({}, { generatedAt, articles }, { upsert: true });

        return { generatedAt, articles };
    }

    async getLatest(): Promise<DigestData | null> {
        const digest = await DigestModel.findOne().lean();

        if (!digest) {
            return null;
        }

        return {
            generatedAt: digest.generatedAt,
            articles: digest.articles.map((article) => ({ ...article, summary: article.summary ?? null })),
        };
    }
}
