import { processFeedItems } from '../../parsers/services/processFeedItems.js';
import config from '../../config/index.js';
import { isDuplicateKeyError } from '../../../common/utils.js';
import type { IRawArticleRepository } from '../../../db/repositories/feed/interface/rawArticleRepository.js';
import type { IFeedItemCreator } from '../../../db/repositories/feed/interface/feedItemRepository.js';
import type { FeedItem } from '../../parsers/interfaces/index.js';
import type { IFeedFetcher, IRssCollector } from '../interfaces/index.js';
import type { ICategorizationService } from '../../categorization/interfaces/index.js';
import type { IDigestGenerator } from '../../digest/interfaces/index.js';
import type { IProvider } from '../../../providers/interfaces.js';

type SourceCollectResult = {
    total: number;
    saved: number;
    skipped: number;
    htmlParseFailures: number;
};

export default class RssCollectorServices implements IFeedFetcher, IRssCollector {
    private readonly rssProvider: IProvider<FeedItem>;
    private readonly rawArticleRepository: IRawArticleRepository;
    private readonly feedItemRepository: IFeedItemCreator;
    private readonly categorizationService: ICategorizationService;
    private readonly digestService: IDigestGenerator;

    constructor({
        rssProvider,
        rawArticleRepository,
        feedItemRepository,
        categorizationService,
        digestService,
    }: {
        rssProvider: IProvider<FeedItem>;
        rawArticleRepository: IRawArticleRepository;
        feedItemRepository: IFeedItemCreator;
        categorizationService: ICategorizationService;
        digestService: IDigestGenerator;
    }) {
        this.rssProvider = rssProvider;
        this.rawArticleRepository = rawArticleRepository;
        this.feedItemRepository = feedItemRepository;
        this.categorizationService = categorizationService;
        this.digestService = digestService;
    }

    async fetchFeed(sourceUrl: string) {
        return this.rssProvider.fetch(sourceUrl);
    }

    /**
     * Fetches every configured RSS source, extracts full article text and
     * persists items that aren't already stored (deduped by article URL).
     * A single source failing never aborts the others.
     */
    async collect(): Promise<number> {
        const results = await Promise.allSettled(
            config.feedSources.map((sourceUrl) => this.collectFromSource(sourceUrl))
        );

        const summary: SourceCollectResult = { total: 0, saved: 0, skipped: 0, htmlParseFailures: 0 };
        const failedSources: string[] = [];

        for (let i = 0; i < results.length; i++) {
            const result = results[i];

            if (result.status === 'fulfilled') {
                summary.total += result.value.total;
                summary.saved += result.value.saved;
                summary.skipped += result.value.skipped;
                summary.htmlParseFailures += result.value.htmlParseFailures;
            } else {
                failedSources.push(config.feedSources[i]);
                console.error(
                    `[RssCollectorServices] Failed to collect from "${config.feedSources[i]}":`,
                    result.reason
                );
            }
        }

        console.log('[RssCollectorServices] Collect finished:', { ...summary, failedSources });

        // Digest generation runs off the back of every collect — from the cron
        // tick, the manual /rss/collect endpoint, or bin/collect.ts — rather than
        // on its own separate schedule. A failure here shouldn't turn an otherwise
        // successful collect into an error.
        try {
            await this.digestService.generateDigest();
        } catch (error) {
            console.error('[RssCollectorServices] Digest generation failed:', error);
        }

        return summary.saved;
    }

    private async collectFromSource(sourceUrl: string): Promise<SourceCollectResult> {
        const items = await this.fetchFeed(sourceUrl);
        const enriched = await processFeedItems(items, { concurrency: config.rssFetchConcurrency });

        const result: SourceCollectResult = { total: enriched.length, saved: 0, skipped: 0, htmlParseFailures: 0 };

        for (const item of enriched) {
            if (item.extractionStatus !== 'ok') {
                result.htmlParseFailures += 1;
            }

            if (!item.link) {
                result.skipped += 1;
                continue;
            }

            const existing = await this.rawArticleRepository.findByUrl(item.link);

            if (existing) {
                result.skipped += 1;
                continue;
            }

            let rawArticle;

            try {
                rawArticle = await this.rawArticleRepository.create({
                    title: item.title ?? 'Untitled',
                    url: item.link,
                    content: item.fullText,
                    publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
                    source: new URL(item.link).hostname,
                });
            } catch (error) {
                if (isDuplicateKeyError(error)) {
                    // Lost a race with another concurrent collection run inserting the same url.
                    result.skipped += 1;
                    continue;
                }

                throw error;
            }

            await this.feedItemRepository.create({
                title: rawArticle.title,
                content: rawArticle.content,
                date: rawArticle.publishedAt,
                rawArticleId: rawArticle._id,
                category: this.categorizationService.categorize({
                    title: rawArticle.title,
                    content: rawArticle.content,
                }),
            });

            result.saved += 1;
        }

        return result;
    }
}
