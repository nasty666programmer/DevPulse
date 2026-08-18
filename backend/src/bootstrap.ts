import { createContainer, InjectionMode } from 'awilix';
import { createControllersContainer } from './controller/container.js';
import { createServicesContainer } from './modules/container.js';
import { createDatabaseContainer } from './db/container.js';
import MongoDB from './db/mongo.js';

export default function bootstrap() {
    const container = createContainer({
        injectionMode: InjectionMode.PROXY,
        strict: true,
    });

    createControllersContainer(container);
    createServicesContainer(container);
    createDatabaseContainer(container);

    // Connect to databases
    connectDatabases();

    return container;
}

async function connectDatabases() {
    const mongo = new MongoDB();

    console.log('Application started');

    return mongo.connect();
}
