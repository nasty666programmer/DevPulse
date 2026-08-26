import DigestModel from '../../models/digest/digest.js';
import type { DigestArticle, DigestData } from '../../../modules/digest/interfaces/index.js';
import type { IDigestRepository } from './interface/digestRepository.js';

export default class DigestRepository implements IDigestRepository {
    async save(userId: string, articles: DigestArticle[]): Promise<DigestData> {
        const generatedAt = new Date();

        // One per user: replaces that user's existing digest document wholesale
        // (or creates it on first run) — matched on userId, not a per-day key.
        await DigestModel.findOneAndReplace({ userId }, { userId, generatedAt, articles }, { upsert: true });

        return { generatedAt, articles };
    }

    async getLatest(userId: string): Promise<DigestData | null> {
        const digest = await DigestModel.findOne({ userId }).lean();

        if (!digest) {
            return null;
        }

        return {
            generatedAt: digest.generatedAt,
            articles: digest.articles.map((article) => ({ ...article, summary: article.summary ?? null })),
        };
    }
}
