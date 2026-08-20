import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import config from '../config/index.js';
import Logger from '../logger/index.js';
import type { IRssCollector } from '../rss/interfaces/index.js';

export default class SchedulerService {
    private readonly rssCollectorService: IRssCollector;
    private task: ScheduledTask | null = null;
    private isCollecting = false;

    constructor({ rssCollectorService }: { rssCollectorService: IRssCollector }) {
        this.rssCollectorService = rssCollectorService;
    }

    start() {
        if (this.task) {
            return;
        }

        this.task = cron.schedule(config.rssCronSchedule, () => {
            if (this.isCollecting) {
                Logger.warn('[SchedulerService] Skipping RSS collect tick — previous run still in progress');
                return;
            }

            this.isCollecting = true;

            // Digest regeneration happens inside collect() itself, not on a
            // separate schedule — see RssCollectorServices.collect().
            this.rssCollectorService
                .collect()
                .catch((err) => {
                    Logger.error('[SchedulerService] Scheduled RSS collect failed', err);
                })
                .finally(() => {
                    this.isCollecting = false;
                });
        });

        Logger.info(`🕒 RSS collection scheduled: "${config.rssCronSchedule}"`);
    }

    stop() {
        this.task?.stop();
        this.task = null;
    }
}
