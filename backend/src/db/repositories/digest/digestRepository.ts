import DigestModel from '../../models/digest/digest.js';
import type { DigestArticle, DigestData } from '../../../modules/digest/interfaces/index.js';
import type { IDigestRepository } from './interface/digestRepository.js';

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export default class DigestRepository implements IDigestRepository {
    async upsertByDate(date: Date, articles: DigestArticle[]): Promise<void> {
        const day = startOfDay(date);

        await DigestModel.findOneAndUpdate(
            { date: day },
            { date: day, articles },
            { upsert: true }
        );
    }

    async getLatest(): Promise<DigestData | null> {
        const digest = await DigestModel.findOne().sort({ date: -1 }).lean();

        if (!digest) {
            return null;
        }

        return { date: digest.date, articles: digest.articles };
    }
}
