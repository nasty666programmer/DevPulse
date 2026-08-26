import { randomBytes } from 'crypto';
import config from '../../config/index.js';
import { InvalidGoogleTokenError } from '../errors.js';
import type { IAuthResult, IAuthService } from '../interfaces/index.js';
import type { IGoogleAuthProvider } from '../../../providers/google/interface/googleAuthProvider.js';
import type { IUserRepository } from '../../../db/repositories/user/interface/userRepository.js';
import type { ITokenRepository } from '../../../db/repositories/token/interface/tokenRepository.js';
import type { IUserDocument } from '../../../db/models/user/interface/user.js';

export default class AuthService implements IAuthService {
    private readonly googleAuthProvider: IGoogleAuthProvider;
    private readonly userRepository: IUserRepository;
    private readonly tokenRepository: ITokenRepository;

    constructor({
        googleAuthProvider,
        userRepository,
        tokenRepository,
    }: {
        googleAuthProvider: IGoogleAuthProvider;
        userRepository: IUserRepository;
        tokenRepository: ITokenRepository;
    }) {
        this.googleAuthProvider = googleAuthProvider;
        this.userRepository = userRepository;
        this.tokenRepository = tokenRepository;
    }

    async signInWithGoogle(idToken: string): Promise<IAuthResult> {
        const profile = await this.googleAuthProvider.verifyIdToken(idToken);

        if (!profile) {
            throw new InvalidGoogleTokenError();
        }

        const user = await this.userRepository.upsertFromGoogle(profile);
        const sessionToken = await this.issueToken(user);

        return { user, sessionToken };
    }

    async verifySession(sessionToken: string): Promise<IUserDocument | null> {
        const record = await this.tokenRepository.findByToken(sessionToken);

        if (!record || record.expiresAt.getTime() < Date.now()) {
            return null;
        }

        return this.userRepository.findById(record.userId.toString());
    }

    async logout(sessionToken: string): Promise<void> {
        await this.tokenRepository.deleteByToken(sessionToken);
    }

    // A raw random string, not a JWT — the token only means anything by
    // existing in the Token table, so a session can be revoked by deleting
    // the row instead of just waiting out an expiry baked into the token.
    private async issueToken(user: IUserDocument): Promise<string> {
        const token = randomBytes(32).toString('hex');

        await this.tokenRepository.create({
            token,
            userId: user._id,
            expiresAt: new Date(Date.now() + config.sessionMaxAgeMs),
            createdAt: new Date(),
        });

        return token;
    }
}
