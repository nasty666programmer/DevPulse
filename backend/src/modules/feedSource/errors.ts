export class InvalidFeedSourceUrlError extends Error {
    constructor(message = 'Not a valid http(s) URL') {
        super(message);
        this.name = 'InvalidFeedSourceUrlError';
    }
}

export class DuplicateFeedSourceError extends Error {
    constructor(message = 'This source is already added') {
        super(message);
        this.name = 'DuplicateFeedSourceError';
    }
}

export class FeedSourceNotFoundError extends Error {
    constructor(message = 'Feed source not found') {
        super(message);
        this.name = 'FeedSourceNotFoundError';
    }
}
