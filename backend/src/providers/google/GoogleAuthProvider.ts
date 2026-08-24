import { OAuth2Client } from 'google-auth-library';
import config from '../../modules/config/index.js';
import Logger from '../../modules/logger/index.js';
import type { IGoogleAuthProvider, IGoogleProfile } from './interface/googleAuthProvider.js';

export default class GoogleAuthProvider implements IGoogleAuthProvider {
    private readonly client = new OAuth2Client(config.googleClientId);

    async verifyIdToken(idToken: string): Promise<IGoogleProfile | null> {
        try {
            const ticket = await this.client.verifyIdToken({
                idToken,
                audience: config.googleClientId,
            });
            const payload = ticket.getPayload();

            if (!payload || !payload.sub || !payload.email) {
                return null;
            }

            return {
                googleId: payload.sub,
                email: payload.email,
                name: payload.name ?? payload.email,
                avatarUrl: payload.picture ?? null,
            };
        } catch (error) {
            Logger.warn('[GoogleAuthProvider] ID token verification failed', {
                error: error instanceof Error ? error.message : error,
            });
            return null;
        }
    }
}
