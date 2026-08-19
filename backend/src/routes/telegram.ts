export default class TelegramRoutes {
    static path = '/telegram';

    static getRoutes() {
        return [
            {
                method: 'get',
                path: '/collect',
                handler: 'collectTelegram',
            },
        ];
    }
}
