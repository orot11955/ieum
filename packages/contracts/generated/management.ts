export interface paths {
    "/api/v1/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getMe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/activity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["recordMyActivity"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listMySessions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/sessions/{sessionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["revokeMySession"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/preferences": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["updateMyPreferences"];
        trace?: never;
    };
    "/api/v1/ops/invitations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["issueInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/invitations/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["acceptInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/ops/users/{userId}/state": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["setUserState"];
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/contexts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listContexts"];
        put?: never;
        post: operations["createContext"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/contexts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getContext"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/contexts/{id}/identity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["changeContextIdentity"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/units/{unitId}/memberships": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getUnitMemberships"];
        put?: never;
        post: operations["setUnitMemberships"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/context-relations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["addContextRelation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/units/{unitId}/relations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getUnitRelations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/thought-relations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["addThoughtRelation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/context-relations/{id}/end": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["endContextRelation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/thought-relations/{id}/end": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["endThoughtRelation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/captures": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listCaptures"];
        put?: never;
        post: operations["createCapture"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/captures/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getCapture"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/captures/{id}/revisions/{revision}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getCaptureRevision"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/captures/{id}/revisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["reviseCapture"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/captures/{id}/units/split": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["splitCaptureUnits"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/captures/{id}/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["archiveCapture"];
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
    getMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current account */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        user: {
                            id: string;
                            /** Format: email */
                            email: string;
                        };
                        workspace: {
                            /** Format: uuid */
                            id: string;
                            /** @enum {string} */
                            role: "OWNER";
                        };
                        operator: boolean;
                        preferences: {
                            timeZone: string;
                            /** @enum {boolean} */
                            externalModelEnabled: false;
                            version: number;
                        };
                    };
                };
            };
        };
    };
    recordMyActivity: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description User activity recorded */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    listMySessions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current account sessions */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        sessions: {
                            id: string;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                            userAgent: string | null;
                            ipAddress: string | null;
                            current: boolean;
                        }[];
                    };
                };
            };
        };
    };
    revokeMySession: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Session revoked */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    updateMyPreferences: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    timeZone: string;
                    baseVersion: number;
                };
            };
        };
        responses: {
            /** @description Updated preferences */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        timeZone: string;
                        /** @enum {boolean} */
                        externalModelEnabled: false;
                        version: number;
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    };
                };
            };
        };
    };
    issueInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: email */
                    email: string;
                };
            };
        };
        responses: {
            /** @description One-time invitation token */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        token: string;
                        /** Format: date-time */
                        expiresAt: string;
                    };
                };
            };
        };
    };
    acceptInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    token: string;
                    name: string;
                    password: string;
                };
            };
        };
        responses: {
            /** @description Personal workspace created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        workspaceId: string;
                    };
                };
            };
        };
    };
    setUserState: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                userId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    suspended: boolean;
                };
            };
        };
        responses: {
            /** @description Account state changed */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    listContexts: {
        parameters: {
            query?: {
                includeArchived?: boolean;
                q?: string;
                cursor?: string;
            };
            header?: never;
            path: {
                wid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Scoped context list */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        contexts: {
                            /** Format: uuid */
                            id: string;
                            name: string;
                            purpose: string;
                            scope: string;
                            /** @enum {string} */
                            kind: "TOPIC" | "FLOW" | "PROJECT" | "COLLECTION";
                            /** @enum {string} */
                            state: "ACTIVE" | "ARCHIVED" | "SUPERSEDED";
                            /** Format: uuid */
                            supersededById: string | null;
                            identityRevision: number;
                            membershipRevision: number;
                            /** Format: date-time */
                            updatedAt: string;
                        }[];
                        nextCursor: string | null;
                    };
                };
            };
        };
    };
    createContext: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                wid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    purpose: string;
                    scope: string;
                    /** @enum {string} */
                    kind: "TOPIC" | "FLOW" | "PROJECT" | "COLLECTION";
                };
            };
        };
        responses: {
            /** @description Context created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                        /** Format: uuid */
                        id: string;
                        identityRevision: number;
                        membershipRevision: number;
                        /** @enum {string} */
                        state: "ACTIVE" | "ARCHIVED" | "SUPERSEDED";
                    };
                };
            };
        };
    };
    getContext: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                wid: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Context detail */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string;
                        purpose: string;
                        scope: string;
                        /** @enum {string} */
                        kind: "TOPIC" | "FLOW" | "PROJECT" | "COLLECTION";
                        /** @enum {string} */
                        state: "ACTIVE" | "ARCHIVED" | "SUPERSEDED";
                        /** Format: uuid */
                        supersededById: string | null;
                        identityRevision: number;
                        membershipRevision: number;
                        /** Format: date-time */
                        updatedAt: string;
                        /** Format: uuid */
                        workspaceId: string;
                        currentIdentityRevision: number;
                        /** Format: date-time */
                        createdAt: string;
                        memberships: {
                            /** Format: uuid */
                            unitId: string;
                            unitRevision: number;
                            /** @enum {string} */
                            role: "PRIMARY" | "SECONDARY" | "BACKGROUND";
                        }[];
                        relations: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            fromContextId: string;
                            /** Format: uuid */
                            toContextId: string;
                            /** @enum {string} */
                            type: "PARENT_OF" | "RELATED_TO";
                        }[];
                    };
                };
            };
        };
    };
    changeContextIdentity: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                wid: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    baseRevision: number;
                    name?: string;
                    purpose?: string;
                    scope?: string;
                    /** @enum {string} */
                    kind?: "TOPIC" | "FLOW" | "PROJECT" | "COLLECTION";
                    /** @enum {string} */
                    state?: "ARCHIVED" | "SUPERSEDED";
                    /** Format: uuid */
                    supersededById?: string;
                };
            };
        };
        responses: {
            /** @description Identity changed */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                        /** Format: uuid */
                        id: string;
                        identityRevision: number;
                        membershipRevision: number;
                        /** @enum {string} */
                        state: "ACTIVE" | "ARCHIVED" | "SUPERSEDED";
                    };
                };
            };
        };
    };
    getUnitMemberships: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                wid: string;
                unitId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Unit memberships */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        unitId: string;
                        membershipVersion: number;
                        memberships: {
                            /** Format: uuid */
                            contextId: string;
                            /** @enum {string} */
                            role: "PRIMARY" | "SECONDARY" | "BACKGROUND";
                            unitRevision: number;
                        }[];
                    };
                };
            };
        };
    };
    setUnitMemberships: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                wid: string;
                unitId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    baseVersion: number;
                    memberships: {
                        /** Format: uuid */
                        contextId: string;
                        /** @enum {string} */
                        role: "PRIMARY" | "SECONDARY" | "BACKGROUND";
                    }[];
                };
            };
        };
        responses: {
            /** @description Memberships replaced */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                        /** Format: uuid */
                        unitId: string;
                        membershipVersion: number;
                        memberships: {
                            /** Format: uuid */
                            contextId: string;
                            /** @enum {string} */
                            role: "PRIMARY" | "SECONDARY" | "BACKGROUND";
                        }[];
                    };
                };
            };
        };
    };
    addContextRelation: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                wid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    fromContextId: string;
                    /** Format: uuid */
                    toContextId: string;
                    /** @enum {string} */
                    type: "PARENT_OF" | "RELATED_TO";
                };
            };
        };
        responses: {
            /** @description Context relation approved */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        fromContextId: string;
                        /** Format: uuid */
                        toContextId: string;
                        /** @enum {string} */
                        type: "PARENT_OF" | "RELATED_TO";
                    };
                };
            };
        };
    };
    getUnitRelations: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                wid: string;
                unitId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Approved unit relations */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        unitId: string;
                        relations: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            fromUnitId: string;
                            fromRevision: number;
                            /** Format: uuid */
                            toUnitId: string;
                            toRevision: number;
                            /** @enum {string} */
                            type: "SUPPORTS" | "CONTRADICTS" | "REFINES" | "RESULT_OF" | "RELATED_TO";
                        }[];
                    };
                };
            };
        };
    };
    addThoughtRelation: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                wid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    fromUnitId: string;
                    fromRevision: number;
                    /** Format: uuid */
                    toUnitId: string;
                    toRevision: number;
                    /** @enum {string} */
                    type: "SUPPORTS" | "CONTRADICTS" | "REFINES" | "RESULT_OF" | "RELATED_TO";
                };
            };
        };
        responses: {
            /** @description Thought relation approved */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        fromUnitId: string;
                        fromRevision: number;
                        /** Format: uuid */
                        toUnitId: string;
                        toRevision: number;
                        /** @enum {string} */
                        type: "SUPPORTS" | "CONTRADICTS" | "REFINES" | "RESULT_OF" | "RELATED_TO";
                    };
                };
            };
        };
    };
    endContextRelation: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                wid: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Context relation ended */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                        /** Format: uuid */
                        id: string;
                        /** @enum {boolean} */
                        ended: true;
                    };
                };
            };
        };
    };
    endThoughtRelation: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                wid: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Thought relation ended */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                        /** Format: uuid */
                        id: string;
                        /** @enum {boolean} */
                        ended: true;
                    };
                };
            };
        };
    };
    listCaptures: {
        parameters: {
            query?: {
                includeArchived?: boolean;
                cursor?: string;
            };
            header?: never;
            path: {
                wid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Capture list */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        captures: {
                            /** Format: uuid */
                            id: string;
                            title: string;
                            /** @enum {string} */
                            state: "ACTIVE" | "ARCHIVED";
                            version: number;
                            currentRevision: number;
                            /** Format: date-time */
                            updatedAt: string;
                        }[];
                        nextCursor: string | null;
                    };
                };
            };
        };
    };
    createCapture: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                wid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    title: string;
                    rawBody: string;
                    source?: {
                        /** @enum {string} */
                        kind: "manual";
                        key?: string;
                    } | {
                        /** @enum {string} */
                        kind: "import";
                        key: string;
                    };
                };
            };
        };
        responses: {
            /** @description Capture created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        revision: number;
                        version: number;
                        /** Format: uuid */
                        unitId: string;
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    };
                };
            };
        };
    };
    getCapture: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                wid: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current capture and units */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        workspaceId: string;
                        title: string;
                        source: {
                            /** @enum {string} */
                            kind: "manual" | "import";
                            key: string | null;
                            originKey: string;
                        };
                        /** @enum {string} */
                        state: "ACTIVE" | "ARCHIVED";
                        version: number;
                        currentRevision: number;
                        unitSetVersion: number;
                        revision: number;
                        rawBody: string;
                        /** Format: date-time */
                        recordedAt: string;
                        units: {
                            /** Format: uuid */
                            id: string;
                            revision: number;
                            captureRevision: number;
                            originKey: string;
                            /** @enum {string} */
                            state: "ACTIVE" | "SUPERSEDED";
                            sourceSpan: {
                                start: number;
                                end: number;
                                /** @enum {string} */
                                encoding: "utf16";
                            };
                            content: {
                                /** @enum {string} */
                                kind: "quote";
                                text: string;
                            };
                            /** Format: date-time */
                            recordedAt: string;
                        }[];
                    };
                };
            };
        };
    };
    getCaptureRevision: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                wid: string;
                id: string;
                revision: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Immutable capture revision and units */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        workspaceId: string;
                        title: string;
                        source: {
                            /** @enum {string} */
                            kind: "manual" | "import";
                            key: string | null;
                            originKey: string;
                        };
                        /** @enum {string} */
                        state: "ACTIVE" | "ARCHIVED";
                        version: number;
                        currentRevision: number;
                        unitSetVersion: number;
                        revision: number;
                        rawBody: string;
                        /** Format: date-time */
                        recordedAt: string;
                        units: {
                            /** Format: uuid */
                            id: string;
                            revision: number;
                            captureRevision: number;
                            originKey: string;
                            /** @enum {string} */
                            state: "ACTIVE" | "SUPERSEDED";
                            sourceSpan: {
                                start: number;
                                end: number;
                                /** @enum {string} */
                                encoding: "utf16";
                            };
                            content: {
                                /** @enum {string} */
                                kind: "quote";
                                text: string;
                            };
                            /** Format: date-time */
                            recordedAt: string;
                        }[];
                    };
                };
            };
        };
    };
    reviseCapture: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                wid: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    baseVersion: number;
                    title: string;
                    rawBody: string;
                };
            };
        };
        responses: {
            /** @description Capture revised */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        revision: number;
                        version: number;
                        unitSetVersion: number;
                        /** Format: uuid */
                        unitId: string;
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    };
                };
            };
        };
    };
    splitCaptureUnits: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                wid: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    baseVersion: number;
                    captureRevision: number;
                    spans: {
                        start: number;
                        end: number;
                        /** @enum {string} */
                        encoding: "utf16";
                    }[];
                };
            };
        };
        responses: {
            /** @description Units split */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        revision: number;
                        version: number;
                        unitSetVersion: number;
                        unitIds: string[];
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    };
                };
            };
        };
    };
    archiveCapture: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                wid: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    baseVersion: number;
                };
            };
        };
        responses: {
            /** @description Capture archived */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** @enum {string} */
                        state: "ARCHIVED";
                        version: number;
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    };
                };
            };
        };
    };
}
