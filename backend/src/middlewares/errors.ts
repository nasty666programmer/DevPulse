export class UnauthorizedError extends Error {
    constructor(message = 'Not authenticated') {
        super(message);
        this.name = 'UnauthorizedError';
    }
}
