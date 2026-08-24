import path from 'path';
import fs from 'fs';

import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import type { Express, Router, Request, Response, NextFunction } from 'express';
import type { AwilixContainer } from 'awilix';
import type { RouteClassStatic, RouteGroup } from './interfaces/route.js';
import type { ResolvedController } from './interfaces/express.js';
import Logger from './modules/logger/index.js';
import config from './modules/config/index.js';

type ExpressModule = typeof import('express');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function handleMiddleware(
    app: Express,
    express: ExpressModule,
    container: AwilixContainer
) {
    // credentials: true + an explicit origin (never "*") — the session cookie
    // set by /auth/google is httpOnly, so the browser must be allowed to send
    // it cross-origin when the frontend isn't served from the same host.
    app.use(cors({ origin: config.corsOrigin, credentials: true }));
    app.use(cookieParser());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Создаем новый DI scope на каждый запрос
    app.use((req, _res, next) => {
        req.scope = container.createScope();
        next();
    });

    const router = express.Router();

    // Загружаем все маршруты один раз
    const routes = await buildRoutes();

    // Регистрируем маршруты
    registerRoutes(router, routes);

    // Подключаем роутер
    app.use(router);

    // Единая точка логирования и обработки ошибок, дошедших до next(error).
    app.use(errorHandler);
}

function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
    Logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, err);

    if (res.headersSent) {
        return next(err);
    }

    res.status(500).json({ error: 'Internal Server Error' });
}

async function buildRoutes(): Promise<RouteGroup[]> {
    const routesPath = path.join(__dirname, 'routes');

    const files = fs
        .readdirSync(routesPath)
        .filter((file) => file.endsWith('.js') || file.endsWith('.ts'));

    const routes: RouteGroup[] = [];

    for (const file of files) {
        const module = await import(pathToFileURL(path.join(routesPath, file)).href);

        const RouteClass: RouteClassStatic | undefined = module.default;

        if (!RouteClass) {
            continue;
        }

        routes.push({
            prefix: RouteClass.path,

            controller: path.parse(file).name + 'Controller',

            routes: RouteClass.getRoutes(),
        });
    }

    return routes;
}

function registerRoutes(router: Router, routes: RouteGroup[]) {
    for (const routeGroup of routes) {
        const { prefix, controller, routes: definitions } = routeGroup;

        for (const route of definitions) {
            const { method, path, handler } = route;

            Logger.info(`🚀 ${method.toUpperCase()} ${prefix + path}`);

            router[method](
                prefix + path,

                async (req, res, next) => {
                    Logger.info(`${req.method} ${req.originalUrl}`);

                    try {
                        const controllerInstance = req.scope.resolve<ResolvedController>(controller);
                        const controllerMethod = controllerInstance[handler];

                        if (typeof controllerMethod !== 'function') {
                            throw new Error(`${controller}.${handler} is not a function`);
                        }

                        return await controllerMethod.call(controllerInstance, req, res, next);
                    } catch (error) {
                        next(error);
                    }
                }
            );
        }
    }
}
