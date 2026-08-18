import dotenv from 'dotenv';
import bootstrap from '../src/bootstrap.js';
import type MongoDB from '../src/db/mongo.js';
import type RssCollectorServices from '../src/modules/rss/services/index.js';

dotenv.config();

async function main() {
    const container = await bootstrap();

    const rssCollectorService = container.resolve<RssCollectorServices>('rssCollectorService');
    const saved = await rssCollectorService.collect();

    console.log(`[bin/collect] Saved ${saved} new item(s)`);

    const mongo = container.resolve<MongoDB>('mongo');
    await mongo.disconnect();
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[bin/collect] Fatal error:', err);
        process.exit(1);
    });
