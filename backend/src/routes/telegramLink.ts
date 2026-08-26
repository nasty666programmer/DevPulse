export default class TelegramLinkRoutes {
    static path = '/users/me';

    static getRoutes() {
        return [
            {
                method: 'post',
                path: '/telegram-link-code',
                handler: 'requestCode',
                middleware: ['authMiddleware'],
            },
        ];
    }
}
