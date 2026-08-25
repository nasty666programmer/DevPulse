export class SummarizerTimeoutError extends Error {
    constructor(message = 'Summarizer service timed out') {
        super(message);
        this.name = 'SummarizerTimeoutError';
    }
}

export class SummarizerUnavailableError extends Error {
    constructor(message = 'Summarizer service unavailable') {
        super(message);
        this.name = 'SummarizerUnavailableError';
    }
}
