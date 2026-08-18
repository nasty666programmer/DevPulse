export default class HealthRoutes {
    static path = '';

    static getRoutes() {
        return [
            {
                method: 'get',
                path: '/health',
                handler: 'getHealth',
            },
        ];
    }
}
