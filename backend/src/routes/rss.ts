export default class RssRoutes {
    static path = '/rss';

    static getRoutes() {
        return [
            {
                method: 'get',
                path: '/collect',
                handler: 'collectRss',
            },
        ];
    }
}
