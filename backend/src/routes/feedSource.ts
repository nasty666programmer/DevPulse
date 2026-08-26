export default class FeedSourceRoutes {
    static path = '/feed-sources';

    static getRoutes() {
        return [
            {
                method: 'post',
                path: '',
                handler: 'add',
                middleware: ['authMiddleware'],
            },
            {
                method: 'get',
                path: '',
                handler: 'list',
                middleware: ['authMiddleware'],
            },
            {
                method: 'delete',
                path: '/:id',
                handler: 'remove',
                middleware: ['authMiddleware'],
            },
        ];
    }
}
