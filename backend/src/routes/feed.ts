export default class FeedRoutes {
    static path = '/feed';

    static getRoutes() {
        return [
            {
                method: 'get',
                path: '/item',
                handler: 'getItem',
            },
            {
                method: 'get',
                path: '/list',
                handler: 'getFeeds',
            },
            {
                method: 'get',
                path: '/items',
                handler: 'getItems',
            },
            {
                method: 'get',
                path: '/fetch-item',
                handler: 'fetchFeedItem',
            },
            {
                method: 'post',
                path: '/items/:id/summary',
                handler: 'summarizeItem',
            },
        ];
    }
}
