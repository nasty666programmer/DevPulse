export class InvalidLinkCodeError extends Error {
    constructor(message = 'Code is invalid or has expired') {
        super(message);
        this.name = 'InvalidLinkCodeError';
    }
}
