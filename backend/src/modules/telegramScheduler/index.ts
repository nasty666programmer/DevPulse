import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import config from '../config/index.js';
import Logger from '../logger/index.js';
import type { ITelegramCollector } from '../telegramCollector/interfaces/index.js';

export default class TelegramSchedulerService {
    private readonly telegramCollectorService: ITelegramCollector;
    private task: ScheduledTask | null = null;
    private isCollecting = false;

    constructor({ telegramCollectorService }: { telegramCollectorService: ITelegramCollector }) {
        this.telegramCollectorService = telegramCollectorService;
    }

    start() {
        if (this.task) {
            return;
        }

        this.task = cron.schedule(config.telegramCronSchedule, () => {
            if (this.isCollecting) {
                Logger.warn(
                    '[TelegramSchedulerService] Skipping Telegram collect tick — previous run still in progress'
                );
                return;
            }

            this.isCollecting = true;

            this.telegramCollectorService
                .collect()
                .catch((err) => {
                    Logger.error(
                        '[TelegramSchedulerService] Scheduled Telegram collect failed',
                        err
                    );
                })
                .finally(() => {
                    this.isCollecting = false;
                });
        });

        Logger.info(`🕒 Telegram collection scheduled: "${config.telegramCronSchedule}"`);
    }

    stop() {
        this.task?.stop();
        this.task = null;
    }
}
