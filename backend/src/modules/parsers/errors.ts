export class HttpStatusError extends Error {
    readonly status: number;

    constructor(status: number, message = `Unexpected HTTP status ${status}`) {
        super(message);
        this.name = 'HttpStatusError';
        this.status = status;
    }
}

export class BlockedError extends HttpStatusError {
    constructor(status: number) {
        super(status, `Blocked by target site (status ${status})`);
        this.name = 'BlockedError';
    }
}

export class TimeoutError extends Error {
    constructor(url: string, timeoutMs: number) {
        super(`Request to ${url} timed out after ${timeoutMs}ms`);
        this.name = 'TimeoutError';
    }
}

export class NetworkError extends Error {
    constructor(url: string, cause: unknown) {
        super(`Network error while fetching ${url}: ${(cause as Error)?.message ?? cause}`);
        this.name = 'NetworkError';
    }
}
