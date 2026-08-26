import { Types } from 'mongoose';
import { processFeedItems } from '../../parsers/services/processFeedItems.js';
import config from '../../config/index.js';
import Logger from '../../logger/index.js';
import { isDuplicateKeyError } from '../../../common/utils.js';
import type { IRawArticleRepository } from '../../../db/repositories/feed/interface/rawArticleRepository.js';
import type { IFeedItemCreator } from '../../../db/repositories/feed/interface/feedItemRepository.js';
import type { IFeedSourceLister } from '../../../db/repositories/feedSource/interface/feedSourceRepository.js';
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
    private readonly feedSourceRepository: IFeedSourceLister;
    private readonly categorizationService: ICategorizationService;
    private readonly digestService: IDigestGenerator;

    constructor({
        rssProvider,
        rawArticleRepository,
        feedItemRepository,
        feedSourceRepository,
        categorizationService,
        digestService,
    }: {
        rssProvider: IProvider<FeedItem>;
        rawArticleRepository: IRawArticleRepository;
        feedItemRepository: IFeedItemCreator;
        feedSourceRepository: IFeedSourceLister;
        categorizationService: ICategorizationService;
        digestService: IDigestGenerator;
    }) {
        this.rssProvider = rssProvider;
        this.rawArticleRepository = rawArticleRepository;
        this.feedItemRepository = feedItemRepository;
        this.feedSourceRepository = feedSourceRepository;
        this.categorizationService = categorizationService;
        this.digestService = digestService;
    }

    async fetchFeed(sourceUrl: string) {
        return this.rssProvider.fetch(sourceUrl);
    }

    /**
     * Fetches every user's configured RSS sources, extracts full article
     * text and persists items that this user doesn't already have (deduped
     * per-user by rawArticle — see collectFromSource). A single (user,
     * source) pair failing never aborts the others.
     */
    async collect(): Promise<number> {
        const sources = await this.feedSourceRepository.findAll();

        Logger.info('[RssCollectorServices] Collect started', { sources: sources.length });

        const results = await Promise.allSettled(
            sources.map((source) => this.collectFromSource(source.url, source.userId.toString()))
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
                const source = sources[i];
                failedSources.push(source.url);
                Logger.error(
                    `[RssCollectorServices] Failed to collect from "${source.url}" (user ${source.userId.toString()})`,
                    result.reason
                );
            }
        }

        Logger.info('[RssCollectorServices] Collect finished', { ...summary, failedSources });

        // Digest regeneration runs off the back of every collect, once per
        // affected user — a single global digest no longer makes sense now
        // that each user's feedItems are their own. One user's regeneration
        // failing shouldn't affect anyone else's, or turn an otherwise
        // successful collect into an error.
        const userIds = [...new Set(sources.map((source) => source.userId.toString()))];

        await Promise.allSettled(
            userIds.map((userId) =>
                this.digestService.generateDigest(userId).catch((error) => {
                    Logger.error(`[RssCollectorServices] Digest generation failed for user ${userId}`, error);
                })
            )
        );

        return summary.saved;
    }

    private async collectFromSource(sourceUrl: string, userId: string): Promise<SourceCollectResult> {
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

            // rawArticle (parsed HTML content) is shared/deduped by URL across
            // every user — only the feedItem below is per-user.
            let rawArticle = await this.rawArticleRepository.findByUrl(item.link);

            if (!rawArticle) {
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
                        rawArticle = await this.rawArticleRepository.findByUrl(item.link);
                    } else {
                        throw error;
                    }
                }
            }

            if (!rawArticle) {
                result.skipped += 1;
                continue;
            }

            try {
                await this.feedItemRepository.create({
                    title: rawArticle.title,
                    content: rawArticle.content,
                    date: rawArticle.publishedAt,
                    rawArticleId: rawArticle._id,
                    userId: new Types.ObjectId(userId),
                    category: this.categorizationService.categorize({
                        title: rawArticle.title,
                        content: rawArticle.content,
                    }),
                });

                result.saved += 1;
            } catch (error) {
                if (isDuplicateKeyError(error)) {
                    // This user already has a feedItem for this (shared) rawArticle.
                    result.skipped += 1;
                    continue;
                }

                throw error;
            }
        }

        return result;
    }
}
