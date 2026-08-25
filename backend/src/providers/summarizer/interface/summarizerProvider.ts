export interface ISummarizerProvider {
    // Throws SummarizerTimeoutError on timeout, SummarizerUnavailableError on
    // network failure, a non-200 response, or a malformed response body.
    summarize(text: string): Promise<string>;
}
