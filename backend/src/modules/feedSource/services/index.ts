import { Types } from 'mongoose';
import { isDuplicateKeyError } from '../../../common/utils.js';
import { DuplicateFeedSourceError, FeedSourceNotFoundError, InvalidFeedSourceUrlError } from '../errors.js';
import type { IFeedSourceRepository } from '../../../db/repositories/feedSource/interface/feedSourceRepository.js';
import type { IFeedSourceDocument } from '../../../db/models/feedSource/interface/feedSource.js';
import type { IFeedSourceService } from '../interfaces/index.js';

function isValidHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

export default class FeedSourceService implements IFeedSourceService {
    private readonly feedSourceRepository: IFeedSourceRepository;

    constructor({ feedSourceRepository }: { feedSourceRepository: IFeedSourceRepository }) {
        this.feedSourceRepository = feedSourceRepository;
    }

    async add(userId: string, url: string): Promise<IFeedSourceDocument> {
        const trimmed = url.trim();

        if (!isValidHttpUrl(trimmed)) {
            throw new InvalidFeedSourceUrlError();
        }

        try {
            return await this.feedSourceRepository.create({
                userId: new Types.ObjectId(userId),
                url: trimmed,
                addedAt: new Date(),
            });
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                throw new DuplicateFeedSourceError();
            }

            throw error;
        }
    }

    async list(userId: string): Promise<IFeedSourceDocument[]> {
        return this.feedSourceRepository.findByUser(userId);
    }

    async remove(userId: string, id: string): Promise<void> {
        const deleted = await this.feedSourceRepository.deleteByIdForUser(id, userId);

        if (!deleted) {
            throw new FeedSourceNotFoundError();
        }
    }
}
