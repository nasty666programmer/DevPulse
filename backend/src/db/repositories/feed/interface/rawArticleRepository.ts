import type { IRawArticle, IRawArticleDocument } from '../../../models/feed/interface/rawArticle.js';

export interface IRawArticleCreator {
    create(data: IRawArticle): Promise<IRawArticleDocument>;
}

export interface IRawArticleRepository extends IRawArticleCreator {
    findByUrl(url: string): Promise<IRawArticleDocument | null>;
}
