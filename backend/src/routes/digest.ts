export default class DigestRoutes {
    static path = '/digest';

    static getRoutes() {
        return [
            {
                method: 'get',
                path: '/latest',
                handler: 'getLatest',
            },
            {
                method: 'get',
                path: '/generate',
                handler: 'generate',
            },
        ];
    }
}
