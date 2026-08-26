export default class TelegramRoutes {
    static path = '/telegram';

    static getRoutes() {
        return [
            {
                method: 'get',
                path: '/collect',
                handler: 'collectTelegram',
                middleware: ['authMiddleware'],
            },
            {
                method: 'get',
                path: '/channels',
                handler: 'listChannels',
                middleware: ['authMiddleware'],
            },
            {
                method: 'get',
                path: '/posts',
                handler: 'listPosts',
                middleware: ['authMiddleware'],
            },
            {
                method: 'post',
                path: '/posts/:id/summary',
                handler: 'summarizePost',
                middleware: ['authMiddleware'],
            },
        ];
    }
}
