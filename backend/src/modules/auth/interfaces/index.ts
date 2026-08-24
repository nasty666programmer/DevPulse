import type { IUserDocument } from '../../../db/models/user/interface/user.js';

export interface ISessionPayload {
    sub: string;
}

export interface IAuthResult {
    user: IUserDocument;
    sessionToken: string;
}

export interface IAuthService {
    signInWithGoogle(idToken: string): Promise<IAuthResult>;
    verifySession(sessionToken: string): Promise<IUserDocument | null>;
}
