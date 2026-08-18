import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

const { scheduleMock, stopMock } = vi.hoisted(() => ({
    scheduleMock: vi.fn(),
    stopMock: vi.fn(),
}));

vi.mock('node-cron', () => ({
    default: {
        schedule: scheduleMock,
    },
}));

vi.mock('../../../modules/config/index.js', () => ({
    default: {
        feedSources: ['https://source.example/rss'],
        rssCronSchedule: '*/30 * * * *',
        digestCronSchedule: '0 8 * * *',
    },
}));

import SchedulerService from '../../../modules/scheduler/index.js';
import type { IRssCollector } from '../../../modules/rss/interfaces/index.js';
import type { IDigestGenerator } from '../../../modules/digest/interfaces/index.js';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

describe('SchedulerService', () => {
    let rssCollectorService: { collect: Mock<IRssCollector['collect']> };
    let digestService: { generateDigest: Mock<IDigestGenerator['generateDigest']> };
    let service: SchedulerService;

    beforeEach(() => {
        vi.clearAllMocks();
        scheduleMock.mockReturnValue({ stop: stopMock });

        rssCollectorService = { collect: vi.fn<IRssCollector['collect']>().mockResolvedValue(0) };
        digestService = { generateDigest: vi.fn<IDigestGenerator['generateDigest']>().mockResolvedValue(undefined) };
        service = new SchedulerService({ rssCollectorService, digestService });
    });

    it('schedules both RSS collection and digest generation using the configured cron expressions', () => {
        service.start();

        expect(scheduleMock).toHaveBeenCalledTimes(2);
        expect(scheduleMock).toHaveBeenNthCalledWith(1, '*/30 * * * *', expect.any(Function));
        expect(scheduleMock).toHaveBeenNthCalledWith(2, '0 8 * * *', expect.any(Function));
    });

    it('does not schedule twice if start() is called again', () => {
        service.start();
        service.start();

        expect(scheduleMock).toHaveBeenCalledTimes(2);
    });

    it('triggers rssCollectorService.collect() when the RSS scheduled task fires', async () => {
        service.start();

        const scheduledFn = scheduleMock.mock.calls[0][1];
        await scheduledFn();

        expect(rssCollectorService.collect).toHaveBeenCalledTimes(1);
    });

    it('triggers digestService.generateDigest() when the digest scheduled task fires', async () => {
        service.start();

        const scheduledFn = scheduleMock.mock.calls[1][1];
        await scheduledFn();

        expect(digestService.generateDigest).toHaveBeenCalledTimes(1);
    });

    it('skips an RSS tick that fires while the previous collect() run is still in progress', async () => {
        const { promise, resolve } = deferred<number>();
        rssCollectorService.collect.mockReturnValue(promise);

        service.start();
        const scheduledFn = scheduleMock.mock.calls[0][1];

        scheduledFn();
        scheduledFn();

        expect(rssCollectorService.collect).toHaveBeenCalledTimes(1);

        resolve(0);
        await promise;
    });

    it('skips a digest tick that fires while the previous generateDigest() run is still in progress', async () => {
        const { promise, resolve } = deferred<void>();
        digestService.generateDigest.mockReturnValue(promise);

        service.start();
        const scheduledFn = scheduleMock.mock.calls[1][1];

        scheduledFn();
        scheduledFn();

        expect(digestService.generateDigest).toHaveBeenCalledTimes(1);

        resolve();
        await promise;
    });

    it('stops both underlying tasks', () => {
        service.start();
        service.stop();

        expect(stopMock).toHaveBeenCalledTimes(2);
    });
});
