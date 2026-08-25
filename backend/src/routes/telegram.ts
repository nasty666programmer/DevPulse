export default class TelegramRoutes {
    static path = '/telegram';

    static getRoutes() {
        return [
            {
                method: 'get',
                path: '/collect',
                handler: 'collectTelegram',
            },
            {
                method: 'get',
                path: '/channels',
                handler: 'listChannels',
            },
            {
                method: 'get',
                path: '/posts',
                handler: 'listPosts',
            },
            {
                method: 'post',
                path: '/posts/:id/summary',
                handler: 'summarizePost',
            },
        ];
    }
}
