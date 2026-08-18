import { createContainer, InjectionMode } from 'awilix';
import { createControllersContainer } from './controller/container.js';
import { createServicesContainer } from './modules/container.js';
import { createDatabaseContainer } from './db/container.js';
import type MongoDB from './db/mongo.js';

export default async function bootstrap() {
    const container = createContainer({
        injectionMode: InjectionMode.PROXY,
        strict: true,
    });

    createControllersContainer(container);
    createServicesContainer(container);
    createDatabaseContainer(container);

    // Resolve the DI-registered singleton (not a throwaway instance) so callers —
    // health checks, graceful shutdown, bin/collect.ts — see the same connection.
    const mongo = container.resolve<MongoDB>('mongo');
    await mongo.connect();

    console.log('Application started');

    return container;
}
