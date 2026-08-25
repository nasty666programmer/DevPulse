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
        summary: { type: 'string', nullable: true, description: 'AI-generated summary, null until requested.' },
    },
};

const digestSchema = {
    type: 'object',
    properties: {
        generatedAt: { type: 'string', format: 'date-time' },
        articles: { type: 'array', items: feedItemSchema },
    },
};

const telegramChannelSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        channelId: { type: 'integer' },
        username: { type: 'string', nullable: true },
        title: { type: 'string' },
        addedAt: { type: 'string', format: 'date-time' },
    },
};

const userSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        name: { type: 'string' },
        avatarUrl: { type: 'string', nullable: true },
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
        '/feed/items/{id}/summary': {
            post: {
                summary: 'Сгенерировать (или вернуть закешированную) саммари новости',
                description:
                    'Если summary уже есть — возвращает его без похода в summarizer-service. ' +
                    'Иначе синхронно вызывает summarizer-service, сохраняет результат и возвращает его.',
                tags: ['feed'],
                parameters: [
                    {
                        name: 'id',
                        in: 'path',
                        required: true,
                        schema: { type: 'string' },
                    },
                ],
                responses: {
                    '200': {
                        description: 'OK',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: { summary: { type: 'string' } },
                                },
                            },
                        },
                    },
                    '400': { description: 'Контент слишком короткий для саммаризации' },
                    '404': { description: 'Новость не найдена' },
                    '503': { description: 'summarizer-service недоступен или превышен таймаут' },
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
        '/telegram/channels': {
            get: {
                summary: 'Зарегистрированные Telegram-каналы — полный список либо постранично',
                description:
                    'Без ?page — полный плоский список (используется чипами-обзором каналов). ' +
                    'С ?page — { channels, total, page, pageSize }, отсортировано как и без пагинации ' +
                    '(по addedAt, самые новые первыми).',
                tags: ['telegram'],
                parameters: [
                    {
                        name: 'page',
                        in: 'query',
                        required: false,
                        schema: { type: 'integer', minimum: 1 },
                        description: '1-based. Присутствие этого параметра переключает форму ответа.',
                    },
                    {
                        name: 'limit',
                        in: 'query',
                        required: false,
                        schema: { type: 'integer', default: 4 },
                        description: 'Размер страницы, только вместе с ?page.',
                    },
                ],
                responses: {
                    '200': {
                        description: 'OK — форма ответа зависит от ?page (см. description)',
                        content: {
                            'application/json': {
                                schema: {
                                    oneOf: [
                                        { type: 'array', items: telegramChannelSchema },
                                        {
                                            type: 'object',
                                            properties: {
                                                channels: {
                                                    type: 'array',
                                                    items: telegramChannelSchema,
                                                },
                                                total: { type: 'integer' },
                                                page: { type: 'integer' },
                                                pageSize: { type: 'integer' },
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                },
            },
        },
        '/telegram/posts': {
            get: {
                summary: 'Последние собранные посты — по всем каналам либо только по указанным',
                tags: ['telegram'],
                parameters: [
                    {
                        name: 'limit',
                        in: 'query',
                        required: false,
                        schema: { type: 'integer' },
                        description: 'Общий лимит. Игнорируется, если передан channelIds.',
                    },
                    {
                        name: 'channelIds',
                        in: 'query',
                        required: false,
                        schema: { type: 'string' },
                        description:
                            'Список channelId через запятую. При наличии — до ' +
                            'TELEGRAM_POSTS_PER_CHANNEL_LIMIT постов на каждый указанный канал, ' +
                            'вместо общего лимита по всем каналам сразу.',
                    },
                ],
                responses: {
                    '200': {
                        description: 'OK',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            id: { type: 'string' },
                                            channelId: { type: 'integer' },
                                            text: { type: 'string' },
                                            publishedAt: { type: 'string', format: 'date-time' },
                                            mediaUrls: {
                                                type: 'array',
                                                items: { type: 'string' },
                                            },
                                        },
                                    },
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
        '/auth/google': {
            post: {
                summary: 'Обменять Google ID-токен на сессию',
                description:
                    'Тело: { idToken }. При успехе ставит httpOnly-сессионную куку и возвращает профиль пользователя.',
                tags: ['auth'],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['idToken'],
                                properties: { idToken: { type: 'string' } },
                            },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'OK',
                        content: {
                            'application/json': {
                                schema: { type: 'object', properties: { user: userSchema } },
                            },
                        },
                    },
                    '400': { description: 'idToken отсутствует в теле запроса' },
                    '401': { description: 'Google ID-токен не прошёл проверку' },
                },
            },
        },
        '/auth/me': {
            get: {
                summary: 'Текущий авторизованный пользователь по сессионной куке',
                tags: ['auth'],
                responses: {
                    '200': {
                        description: 'OK',
                        content: {
                            'application/json': {
                                schema: { type: 'object', properties: { user: userSchema } },
                            },
                        },
                    },
                    '401': { description: 'Кука отсутствует или сессия недействительна' },
                },
            },
        },
        '/auth/logout': {
            post: {
                summary: 'Завершить сессию',
                description: 'Очищает сессионную куку. Стейтлесс — на сервере ничего не инвалидируется.',
                tags: ['auth'],
                responses: {
                    '204': { description: 'Кука очищена' },
                },
            },
        },
    },
};

export default openapiSpec;
