import TokenModel from '../../models/token/token.js';
import type { IToken, ITokenDocument } from '../../models/token/interface/token.js';
import type { ITokenRepository } from './interface/tokenRepository.js';

export default class TokenRepository implements ITokenRepository {
    async create(data: IToken): Promise<ITokenDocument> {
        return await TokenModel.create(data);
    }

    async findByToken(token: string): Promise<ITokenDocument | null> {
        return await TokenModel.findOne({ token });
    }

    async deleteByToken(token: string): Promise<void> {
        await TokenModel.deleteOne({ token });
    }
}
