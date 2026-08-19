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
    },
}));

import SchedulerService from '../../../modules/scheduler/index.js';
import type { IRssCollector } from '../../../modules/rss/interfaces/index.js';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

describe('SchedulerService', () => {
    let rssCollectorService: { collect: Mock<IRssCollector['collect']> };
    let service: SchedulerService;

    beforeEach(() => {
        vi.clearAllMocks();
        scheduleMock.mockReturnValue({ stop: stopMock });

        rssCollectorService = { collect: vi.fn<IRssCollector['collect']>().mockResolvedValue(0) };
        service = new SchedulerService({ rssCollectorService });
    });

    it('schedules only RSS collection using the configured cron expression', () => {
        service.start();

        expect(scheduleMock).toHaveBeenCalledTimes(1);
        expect(scheduleMock).toHaveBeenCalledWith('*/30 * * * *', expect.any(Function));
    });

    it('does not schedule twice if start() is called again', () => {
        service.start();
        service.start();

        expect(scheduleMock).toHaveBeenCalledTimes(1);
    });

    it('triggers rssCollectorService.collect() when the scheduled task fires', async () => {
        service.start();

        const scheduledFn = scheduleMock.mock.calls[0][1];
        await scheduledFn();

        expect(rssCollectorService.collect).toHaveBeenCalledTimes(1);
    });

    it('skips a tick that fires while the previous collect() run is still in progress', async () => {
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

    it('stops the underlying task', () => {
        service.start();
        service.stop();

        expect(stopMock).toHaveBeenCalledTimes(1);
    });
});
