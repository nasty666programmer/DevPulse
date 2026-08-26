export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RouteDefinition {
    method: HttpMethod;
    path: string;
    handler: string;
    middleware?: string[];
}

export interface RouteGroup {
    prefix: string;
    controller: string;
    routes: RouteDefinition[];
}

export interface RouteClassStatic {
    path: string;
    getRoutes(): RouteDefinition[];
}
