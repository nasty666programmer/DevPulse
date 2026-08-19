const DUPLICATE_KEY_ERROR_CODE = 11000;

export function isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: number }).code === DUPLICATE_KEY_ERROR_CODE;
}

export function cleanScrapedText(text: string) {
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => line.replace(/[ \t]+/g, ' '))
        .join('\n\n');
}
