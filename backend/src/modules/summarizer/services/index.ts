import type { ISummarizerProvider } from '../../../providers/summarizer/interface/summarizerProvider.js';
import type { ISummarizerService } from '../interfaces/index.js';

export default class SummarizerService implements ISummarizerService {
    private readonly summarizerProvider: ISummarizerProvider;

    constructor({ summarizerProvider }: { summarizerProvider: ISummarizerProvider }) {
        this.summarizerProvider = summarizerProvider;
    }

    async summarize(text: string): Promise<string> {
        return this.summarizerProvider.summarize(text.trim());
    }
}
