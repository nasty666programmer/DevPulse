import dotenv from 'dotenv';
import bootstrap from '../src/bootstrap.js';
import type MongoDB from '../src/db/mongo.js';
import type TelegramCollectorService from '../src/modules/telegramCollector/services/index.js';

dotenv.config();

async function main() {
    const container = await bootstrap();

    const telegramCollectorService = container.resolve<TelegramCollectorService>(
        'telegramCollectorService'
    );
    const saved = await telegramCollectorService.collect();

    console.log(`[bin/telegram-collect] Saved ${saved} new post(s)`);

    const mongo = container.resolve<MongoDB>('mongo');
    await mongo.disconnect();
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[bin/telegram-collect] Fatal error:', err);
        process.exit(1);
    });
