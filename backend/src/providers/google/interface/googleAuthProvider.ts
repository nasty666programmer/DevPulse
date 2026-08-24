export interface IGoogleProfile {
    googleId: string;
    email: string;
    name: string;
    avatarUrl: string | null;
}

export interface IGoogleAuthProvider {
    // Verifies a Google Identity Services ID token against Google's public
    // keys and audience. Returns null (never throws) when the token is
    // malformed, expired, or signed for a different client — callers decide
    // how to react, rather than every caller needing its own try/catch.
    verifyIdToken(idToken: string): Promise<IGoogleProfile | null>;
}
