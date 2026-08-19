export interface ITelegramCollector {
    collect(): Promise<number>;
}
