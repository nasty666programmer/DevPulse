import type { IPopulatedFeedItem } from '../../db/models/feed/interface/feedItem.js';

export function mapPopulatedFeedItem(item: IPopulatedFeedItem) {
    return {
        id: item._id.toString(),
        title: item.title,
        content: item.content,
        date: item.date,
        category: item.category,
        url: item.rawArticleId?.url ?? null,
        source: item.rawArticleId?.source ?? null,
    };
}
