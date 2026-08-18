import RawArticleModel from '../../models/feed/rawArticle.js';
import type { IRawArticle, IRawArticleDocument } from '../../models/feed/interface/rawArticle.js';
import type { IRawArticleRepository } from './interface/rawArticleRepository.js';

export default class RawArticleRepository implements IRawArticleRepository {
    async create(data: IRawArticle): Promise<IRawArticleDocument> {
        return RawArticleModel.create(data);
    }

    async findByUrl(url: string): Promise<IRawArticleDocument | null> {
        return RawArticleModel.findOne({ url });
    }
}
