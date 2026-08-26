export default class DigestRoutes {
    static path = '/digest';

    static getRoutes() {
        return [
            {
                method: 'get',
                path: '/latest',
                handler: 'getLatest',
                middleware: ['authMiddleware'],
            },
            {
                method: 'get',
                path: '/generate',
                handler: 'generate',
                middleware: ['authMiddleware'],
            },
        ];
    }
}
