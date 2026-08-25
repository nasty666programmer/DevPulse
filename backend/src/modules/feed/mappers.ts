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
        // ?? null, not a bare pass-through: items created before this field
        // existed have no `summary` key at all in Mongo (Mongoose's schema
        // `default` only applies on create, never retroactively on read), so
        // this reads back as undefined for them, not null.
        summary: item.summary ?? null,
    };
}
