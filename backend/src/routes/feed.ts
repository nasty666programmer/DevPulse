export default class FeedRoutes {
    static path = '/feed';

    static getRoutes() {
        return [
            {
                method: 'get',
                path: '/item',
                handler: 'getItem',
                middleware: ['authMiddleware'],
            },
            {
                method: 'get',
                path: '/list',
                handler: 'getFeeds',
                middleware: ['authMiddleware'],
            },
            {
                method: 'get',
                path: '/items',
                handler: 'getItems',
                middleware: ['authMiddleware'],
            },
            {
                method: 'get',
                path: '/fetch-item',
                handler: 'fetchFeedItem',
                middleware: ['authMiddleware'],
            },
            {
                method: 'post',
                path: '/items/:id/summary',
                handler: 'summarizeItem',
                middleware: ['authMiddleware'],
            },
        ];
    }
}
