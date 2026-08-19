import { ALL_CATEGORIES } from '../../categorization/interfaces/index.js';
import type { IFeedItemCategoryReader } from '../../../db/repositories/feed/interface/feedItemRepository.js';
import { mapPopulatedFeedItem } from '../../feed/mappers.js';
import type { DigestArticle, DigestData, IDigestRepository } from '../interfaces/index.js';

const DIGEST_SIZE = 10;
// Enough per category for round-robin to fill DIGEST_SIZE across all categories
// (ceil(DIGEST_SIZE / ALL_CATEGORIES.length)), without over-fetching.
const PER_CATEGORY_FETCH_LIMIT = Math.ceil(DIGEST_SIZE / ALL_CATEGORIES.length);

export default class DigestService {
    private readonly feedItemRepository: IFeedItemCategoryReader;
    private readonly digestRepository: IDigestRepository;

    constructor({
        feedItemRepository,
        digestRepository,
    }: {
        feedItemRepository: IFeedItemCategoryReader;
        digestRepository: IDigestRepository;
    }) {
        this.feedItemRepository = feedItemRepository;
        this.digestRepository = digestRepository;
    }

    /**
     * Round-robins one article per category per round (most recent first within a
     * category) instead of taking the N most recent overall, so the digest isn't
     * dominated by whichever category happens to have collected the most items.
     */
    async selectArticles(): Promise<DigestArticle[]> {
        const byCategory = await Promise.all(
            ALL_CATEGORIES.map(async (category) => {
                const items = await this.feedItemRepository.getRecentByCategory(category, PER_CATEGORY_FETCH_LIMIT);

                return items.map(mapPopulatedFeedItem);
            })
        );

        const result: DigestArticle[] = [];

        for (let round = 0; result.length < DIGEST_SIZE && round < PER_CATEGORY_FETCH_LIMIT; round++) {
            for (const categoryArticles of byCategory) {
                if (result.length >= DIGEST_SIZE) break;

                const article = categoryArticles[round];

                if (article) {
                    result.push(article);
                }
            }
        }

        return result;
    }

    async generateDigest(): Promise<DigestData> {
        const articles = await this.selectArticles();

        return this.digestRepository.save(articles);
    }

    async getLatestDigest(): Promise<DigestData | null> {
        return this.digestRepository.getLatest();
    }
}
