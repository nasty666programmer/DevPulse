// Static OpenAPI 3.0 spec for local testing via Swagger UI (see index.ts —
// mounted at /docs, dev-only). Hand-written rather than generated from
// JSDoc comments: the route classes (routes/*.ts) are plain declarative
// arrays with no natural place to hang per-endpoint doc-comments, and with
// ~8 endpoints total, keeping this in sync by hand is simpler than adding
// a doc-comment parser.

const feedItemSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string', description: 'Full extracted article text.' },
        date: { type: 'string', format: 'date-time' },
        category: { type: 'string', enum: ['Node.js', 'Docker', 'AWS', 'DevOps', 'AI', 'Прочее'] },
        url: { type: 'string', nullable: true },
        source: { type: 'string', nullable: true },
    },
};

const digestSchema = {
    type: 'object',
    properties: {
        generatedAt: { type: 'string', format: 'date-time' },
        articles: { type: 'array', items: feedItemSchema },
    },
};

const openapiSpec = {
    openapi: '3.0.3',
    info: {
        title: 'DevPulse API',
        version: '1.0.0',
        description: 'Локальная документация для ручного тестирования — не выкатывается в прод.',
    },
    servers: [{ url: '/', description: 'Текущий хост' }],
    paths: {
        '/health': {
            get: {
                summary: 'Health-check',
                tags: ['health'],
                responses: {
                    '200': { description: 'Mongo подключена' },
                    '503': { description: 'Mongo недоступна' },
                },
            },
        },
        '/feed/items': {
            get: {
                summary: 'Список сохранённых новостей',
                tags: ['feed'],
                parameters: [
                    {
                        name: 'limit',
                        in: 'query',
                        schema: { type: 'integer', default: 20 },
                        description: 'Сколько записей вернуть.',
                    },
                    {
                        name: 'category',
                        in: 'query',
                        schema: {
                            type: 'string',
                            enum: ['Node.js', 'Docker', 'AWS', 'DevOps', 'AI', 'Прочее'],
                        },
                        description: 'Фильтр по категории (точное совпадение).',
                    },
                ],
                responses: {
                    '200': {
                        description: 'OK',
                        content: {
                            'application/json': {
                                schema: { type: 'array', items: feedItemSchema },
                            },
                        },
                    },
                },
            },
        },
        '/feed/list': {
            get: {
                summary: 'Пейджинированный список сконфигурированных RSS-фидов',
                tags: ['feed'],
                responses: { '200': { description: 'OK' } },
            },
        },
        '/feed/item': {
            get: {
                summary: 'Последняя сохранённая новость (сырое поле из БД)',
                tags: ['feed'],
                responses: { '200': { description: 'OK' } },
            },
        },
        '/feed/fetch-item': {
            get: {
                summary: 'Забрать первый айтем первого сконфигурированного фида и сохранить его',
                tags: ['feed'],
                responses: {
                    '200': { description: 'OK' },
                    '500': { description: 'Сбой похода в фид' },
                },
            },
        },
        '/rss/collect': {
            get: {
                summary: 'Полный сбор RSS по всем источникам + пересборка дайджеста',
                description:
                    'Медленный — реальные сетевые запросы к источникам и полнотекстовое извлечение статей. ' +
                    'После сбора автоматически пересобирает дайджест (см. /digest/generate).',
                tags: ['rss'],
                responses: {
                    '200': {
                        description: 'OK',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: { saved: { type: 'integer' } },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/telegram/collect': {
            get: {
                summary: 'Сбор новых постов по всем зарегистрированным Telegram-каналам',
                tags: ['telegram'],
                responses: {
                    '200': {
                        description: 'OK',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: { saved: { type: 'integer' } },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/digest/latest': {
            get: {
                summary: 'Последний сгенерированный дайджест',
                tags: ['digest'],
                responses: {
                    '200': {
                        description: 'OK',
                        content: { 'application/json': { schema: digestSchema } },
                    },
                    '204': { description: 'Дайджест ещё ни разу не генерировался' },
                },
            },
        },
        '/digest/generate': {
            get: {
                summary: 'Пересобрать дайджест прямо сейчас — только из БД, без RSS-сбора',
                description:
                    'Round-robin по категориям (по одной новости из каждой за раунд, самые свежие первыми), ' +
                    'пока не наберётся 10.',
                tags: ['digest'],
                responses: {
                    '200': {
                        description: 'OK',
                        content: { 'application/json': { schema: digestSchema } },
                    },
                },
            },
        },
    },
};

export default openapiSpec;
