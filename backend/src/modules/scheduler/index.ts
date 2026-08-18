import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import config from '../config/index.js';
import type { IRssCollector } from '../rss/interfaces/index.js';
import type { IDigestGenerator } from '../digest/interfaces/index.js';

export default class SchedulerService {
    private readonly rssCollectorService: IRssCollector;
    private readonly digestService: IDigestGenerator;
    private task: ScheduledTask | null = null;
    private digestTask: ScheduledTask | null = null;
    private isCollecting = false;
    private isGeneratingDigest = false;

    constructor({
        rssCollectorService,
        digestService,
    }: {
        rssCollectorService: IRssCollector;
        digestService: IDigestGenerator;
    }) {
        this.rssCollectorService = rssCollectorService;
        this.digestService = digestService;
    }

    start() {
        if (this.task) {
            return;
        }

        this.task = cron.schedule(config.rssCronSchedule, () => {
            if (this.isCollecting) {
                console.warn('[SchedulerService] Skipping RSS collect tick — previous run still in progress');
                return;
            }

            this.isCollecting = true;

            this.rssCollectorService
                .collect()
                .catch((err) => {
                    console.error('[SchedulerService] Scheduled RSS collect failed:', err);
                })
                .finally(() => {
                    this.isCollecting = false;
                });
        });

        console.log(`🕒 RSS collection scheduled: "${config.rssCronSchedule}"`);

        this.digestTask = cron.schedule(config.digestCronSchedule, () => {
            if (this.isGeneratingDigest) {
                console.warn(
                    '[SchedulerService] Skipping digest generation tick — previous run still in progress'
                );
                return;
            }

            this.isGeneratingDigest = true;

            this.digestService
                .generateDigest()
                .catch((err) => {
                    console.error('[SchedulerService] Scheduled digest generation failed:', err);
                })
                .finally(() => {
                    this.isGeneratingDigest = false;
                });
        });

        console.log(`🕒 Digest generation scheduled: "${config.digestCronSchedule}"`);
    }

    stop() {
        this.task?.stop();
        this.digestTask?.stop();
        this.task = null;
        this.digestTask = null;
    }
}
