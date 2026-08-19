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
        telegramCronSchedule: '*/45 * * * *',
    },
}));

import TelegramSchedulerService from '../../../modules/telegramScheduler/index.js';
import type { ITelegramCollector } from '../../../modules/telegramCollector/interfaces/index.js';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

describe('TelegramSchedulerService', () => {
    let telegramCollectorService: { collect: Mock<ITelegramCollector['collect']> };
    let service: TelegramSchedulerService;

    beforeEach(() => {
        vi.clearAllMocks();
        scheduleMock.mockReturnValue({ stop: stopMock });

        telegramCollectorService = {
            collect: vi.fn<ITelegramCollector['collect']>().mockResolvedValue(0),
        };
        service = new TelegramSchedulerService({ telegramCollectorService });
    });

    it('schedules Telegram collection using the configured cron expression', () => {
        service.start();

        expect(scheduleMock).toHaveBeenCalledTimes(1);
        expect(scheduleMock).toHaveBeenCalledWith('*/45 * * * *', expect.any(Function));
    });

    it('does not schedule twice if start() is called again', () => {
        service.start();
        service.start();

        expect(scheduleMock).toHaveBeenCalledTimes(1);
    });

    it('triggers telegramCollectorService.collect() when the scheduled task fires', async () => {
        service.start();

        const scheduledFn = scheduleMock.mock.calls[0][1];
        await scheduledFn();

        expect(telegramCollectorService.collect).toHaveBeenCalledTimes(1);
    });

    it('skips a tick that fires while the previous collect() run is still in progress', async () => {
        const { promise, resolve } = deferred<number>();
        telegramCollectorService.collect.mockReturnValue(promise);

        service.start();
        const scheduledFn = scheduleMock.mock.calls[0][1];

        scheduledFn();
        scheduledFn();

        expect(telegramCollectorService.collect).toHaveBeenCalledTimes(1);

        resolve(0);
        await promise;
    });

    it('stops the underlying task', () => {
        service.start();
        service.stop();

        expect(stopMock).toHaveBeenCalledTimes(1);
    });
});
