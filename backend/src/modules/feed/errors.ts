export class FeedItemNotFoundError extends Error {
    constructor(message = 'Feed item not found') {
        super(message);
        this.name = 'FeedItemNotFoundError';
    }
}

export class FeedItemNotSummarizableError extends Error {
    constructor(message = 'Item content is too short to summarize') {
        super(message);
        this.name = 'FeedItemNotSummarizableError';
    }
}
