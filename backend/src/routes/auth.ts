export default class AuthRoutes {
    static path = '/auth';

    static getRoutes() {
        return [
            { method: 'post', path: '/google', handler: 'signInWithGoogle' },
            { method: 'get', path: '/me', handler: 'getCurrentUser' },
            { method: 'post', path: '/logout', handler: 'logout' },
        ];
    }
}
