export class InvalidGoogleTokenError extends Error {
    constructor(message = 'Google ID token failed verification') {
        super(message);
        this.name = 'InvalidGoogleTokenError';
    }
}
