import { asClass } from 'awilix';
import type { AwilixContainer } from 'awilix';
import AuthMiddleware from './authMiddleware.js';

export function createMiddlewareContainer(container: AwilixContainer) {
    return container.register({
        authMiddleware: asClass(AuthMiddleware).scoped(),
    });
}
