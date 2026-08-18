export function cleanScrapedText(text: string) {
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => line.replace(/[ \t]+/g, ' '))
        .join('\n\n');
}
