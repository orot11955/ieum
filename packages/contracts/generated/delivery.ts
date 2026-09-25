export interface paths {
    "/delivery/v1/publications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listPublications"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/delivery/v1/publications/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getPublicPublication"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/delivery/v1/publications/by-slug/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getPublicPublicationBySlug"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/delivery/v1/publications/{id}/revisions/{revision}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getCurrentPublicRevision"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/delivery/v1/publications/{id}/assets/{assetId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getCurrentPublicAsset"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listPublications: {
        parameters: {
            query?: {
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Published summaries */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            /** Format: uuid */
                            id: string;
                            publicRevision: number;
                            title: string;
                            slug: string;
                            /** Format: date-time */
                            publishedAt: string;
                        }[];
                        nextCursor: string | null;
                    };
                };
            };
            /** @description Current published state is unchanged */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid page request or cursor */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing, expired or revoked server credential */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getPublicPublication: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current public revision */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        publicRevision: number;
                        title: string;
                        slug: string;
                        /** Format: date-time */
                        publishedAt: string;
                        /** @enum {string} */
                        bodyFormat: "markdown";
                        body: string;
                        /** Format: date-time */
                        updatedAt: string;
                        assets: {
                            /** Format: uuid */
                            id: string;
                            mime: string;
                            byteSize: number;
                            /** Format: starts_with */
                            url: string;
                        }[];
                    };
                };
            };
            /** @description Current published state is unchanged */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing, expired or revoked server credential */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description No currently published resource */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getPublicPublicationBySlug: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current public revision */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        publicRevision: number;
                        title: string;
                        slug: string;
                        /** Format: date-time */
                        publishedAt: string;
                        /** @enum {string} */
                        bodyFormat: "markdown";
                        body: string;
                        /** Format: date-time */
                        updatedAt: string;
                        assets: {
                            /** Format: uuid */
                            id: string;
                            mime: string;
                            byteSize: number;
                            /** Format: starts_with */
                            url: string;
                        }[];
                    };
                };
            };
            /** @description Current published state is unchanged */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing, expired or revoked server credential */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description No currently published resource */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getCurrentPublicRevision: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                revision: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Only the current revision */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        publicRevision: number;
                        title: string;
                        slug: string;
                        /** Format: date-time */
                        publishedAt: string;
                        /** @enum {string} */
                        bodyFormat: "markdown";
                        body: string;
                        /** Format: date-time */
                        updatedAt: string;
                        assets: {
                            /** Format: uuid */
                            id: string;
                            mime: string;
                            byteSize: number;
                            /** Format: starts_with */
                            url: string;
                        }[];
                    };
                };
            };
            /** @description Current published state is unchanged */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing, expired or revoked server credential */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description No currently published resource */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getCurrentPublicAsset: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                assetId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Verified derivative of the current public revision */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "text/plain": string;
                    "image/png": string;
                };
            };
            /** @description Current published state is unchanged */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing, expired or revoked server credential */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description No currently published resource */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
}
