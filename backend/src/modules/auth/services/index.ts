import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import { InvalidGoogleTokenError } from '../errors.js';
import type { IAuthResult, IAuthService, ISessionPayload } from '../interfaces/index.js';
import type { IGoogleAuthProvider } from '../../../providers/google/interface/googleAuthProvider.js';
import type { IUserRepository } from '../../../db/repositories/user/interface/userRepository.js';
import type { IUserDocument } from '../../../db/models/user/interface/user.js';

export default class AuthService implements IAuthService {
    private readonly googleAuthProvider: IGoogleAuthProvider;
    private readonly userRepository: IUserRepository;

    constructor({
        googleAuthProvider,
        userRepository,
    }: {
        googleAuthProvider: IGoogleAuthProvider;
        userRepository: IUserRepository;
    }) {
        this.googleAuthProvider = googleAuthProvider;
        this.userRepository = userRepository;
    }

    async signInWithGoogle(idToken: string): Promise<IAuthResult> {
        const profile = await this.googleAuthProvider.verifyIdToken(idToken);

        if (!profile) {
            throw new InvalidGoogleTokenError();
        }

        const user = await this.userRepository.upsertFromGoogle(profile);
        const sessionToken = this.signSession(user);

        return { user, sessionToken };
    }

    async verifySession(sessionToken: string): Promise<IUserDocument | null> {
        let payload: ISessionPayload;

        try {
            payload = jwt.verify(sessionToken, config.sessionSecret) as ISessionPayload;
        } catch {
            return null;
        }

        return this.userRepository.findById(payload.sub);
    }

    // jsonwebtoken's expiresIn takes seconds when given a number — config keeps
    // the max-age in ms (matching the cookie's maxAge unit), so convert once here.
    private signSession(user: IUserDocument): string {
        return jwt.sign({ sub: user._id.toString() }, config.sessionSecret, {
            expiresIn: Math.floor(config.sessionMaxAgeMs / 1000),
        });
    }
}
