import type { IToken, ITokenDocument } from '../../../models/token/interface/token.js';

export interface ITokenRepository {
    create(data: IToken): Promise<ITokenDocument>;
    findByToken(token: string): Promise<ITokenDocument | null>;
    deleteByToken(token: string): Promise<void>;
}
