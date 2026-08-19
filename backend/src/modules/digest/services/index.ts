import type { IFeedItemDateReader } from '../../../db/repositories/feed/interface/feedItemRepository.js';
import { mapPopulatedFeedItem } from '../../feed/mappers.js';
import type { DigestData, IDigestRepository } from '../interfaces/index.js';

export default class DigestService {
    private readonly feedItemRepository: IFeedItemDateReader;
    private readonly digestRepository: IDigestRepository;

    constructor({
        feedItemRepository,
        digestRepository,
    }: {
        feedItemRepository: IFeedItemDateReader;
        digestRepository: IDigestRepository;
    }) {
        this.feedItemRepository = feedItemRepository;
        this.digestRepository = digestRepository;
    }

    async buildDigestData(date: Date): Promise<DigestData> {
        const items = await this.feedItemRepository.getByDate(date);
        const articles = items.map(mapPopulatedFeedItem);

        return { date, articles };
    }

    async generateDigest(date: Date = new Date()): Promise<void> {
        const data = await this.buildDigestData(date);

        await this.digestRepository.upsertByDate(data.date, data.articles);
    }

    async getLatestDigest(): Promise<DigestData | null> {
        return this.digestRepository.getLatest();
    }
}
