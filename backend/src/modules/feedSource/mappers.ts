import type { IFeedSourceDocument } from '../../db/models/feedSource/interface/feedSource.js';

export function toFeedSourceDto(source: IFeedSourceDocument) {
    return {
        id: source._id.toString(),
        url: source.url,
        addedAt: source.addedAt,
    };
}
