import { readFile, writeFile } from 'node:fs/promises';
import { extractArticle } from '../src/modules/parsers/services/extractArticle.js';
import { processFeedItems } from '../src/modules/parsers/services/processFeedItems.js';
import type { FeedItem } from '../src/modules/parsers/interfaces/index.js';

function parseArgs(argv: string[]) {
    const [input] = argv;
    const outIndex = argv.indexOf('--out');
    const outFile = outIndex !== -1 ? argv[outIndex + 1] : undefined;
    const concurrencyIndex = argv.indexOf('--concurrency');
    const concurrency = concurrencyIndex !== -1 ? Number(argv[concurrencyIndex + 1]) : undefined;

    return { input, outFile, concurrency };
}

async function main() {
    const { input, outFile, concurrency } = parseArgs(process.argv.slice(2));

    if (!input) {
        console.error('Usage:\n  tsx bin/extract.ts <url> [--out output.json]\n  tsx bin/extract.ts <items.json> [--out output.json] [--concurrency 3]');
        process.exit(1);
    }

    let result: unknown;

    if (/^https?:\/\//i.test(input)) {
        console.log(`Extracting single URL: ${input}`);
        result = await extractArticle(input);
    } else {
        console.log(`Reading feed items from: ${input}`);
        const raw = await readFile(input, 'utf-8');
        const items: FeedItem[] = JSON.parse(raw);
        result = await processFeedItems(items, { concurrency });
    }

    const json = JSON.stringify(result, null, 2);

    if (outFile) {
        await writeFile(outFile, json, 'utf-8');
        console.log(`Saved result to ${outFile}`);
    } else {
        console.log(json);
    }
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
