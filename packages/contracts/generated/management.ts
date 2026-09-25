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
    "/api/v1/me/preferences/model": {
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
        patch: operations["updateModelPreference"];
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
    "/api/v1/workspaces/{wid}/structures/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["previewStructure"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/structures/proposals/{proposalId}/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["acceptStructure"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/structures/mutations/{mutationId}/undo-preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["previewStructureUndo"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/structures/mutations/{mutationId}/undo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["undoStructure"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
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
    "/api/v1/workspaces/{wid}/tasks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listTasks"];
        put?: never;
        post: operations["createTask"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/tasks/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getTask"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/tasks/{id}/edit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["editTask"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/tasks/{id}/transition": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["transitionTask"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/tasks/{id}/results": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["addTaskResult"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listEvents"];
        put?: never;
        post: operations["createEvent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/events/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getEvent"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/events/{id}/edit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["editEvent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/events/{id}/state": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["setEventState"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/judgements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["requestJudgement"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/judgements/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getJudgementStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/judgements/{id}/candidates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getJudgementCandidates"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/judgements/{id}/proposals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["createJudgementProposal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/proposals/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getJudgementProposal"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/proposals/{id}/expose": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["exposeJudgementProposal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/proposals/{id}/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["acceptJudgementProposal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/proposals/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["rejectJudgementProposal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/proposals/{id}/dismiss": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["dismissJudgementProposal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/captures/{id}/extractions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["generateExtractionCandidates"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/extractions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getExtractionCandidate"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/extractions/{id}/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["acceptExtractionCandidate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/extractions/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["rejectExtractionCandidate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/documents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listDocuments"];
        put?: never;
        post: operations["createDocument"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/documents/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getDocument"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/documents/{id}/draft": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["saveDocumentDraft"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/documents/{id}/revisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["sealDocument"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/documents/{id}/revisions/{revision}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getDocumentRevision"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/documents/{id}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["restoreDocumentRevision"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/documents/{id}/links": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["replaceWikiLinks"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/external-excerpts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["createExternalExcerpt"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/external-excerpts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getExternalExcerpt"];
        put: operations["reviseExternalExcerpt"];
        post?: never;
        delete: operations["deleteExternalExcerpt"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/documents/{id}/evidence-packs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["createEvidencePack"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/documents/{id}/evidence-packs/{packId}/revisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["reviseEvidencePack"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/documents/{id}/evidence-packs/{packId}/revisions/{revision}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getEvidencePackRevision"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/documents/{id}/workbench": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getDocumentWorkbench"];
        put: operations["saveDocumentWorkbench"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/documents/{id}/generations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["requestGeneration"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/documents/{id}/generations/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getGeneration"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/documents/{id}/generations/{requestId}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["cancelGeneration"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/documents/{id}/generations/{requestId}/apply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["applyGeneration"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listAssets"];
        put?: never;
        post: operations["createAsset"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/assets/{assetId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getAsset"];
        put?: never;
        post?: never;
        delete: operations["deleteAsset"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/assets/{assetId}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["downloadPrivateAsset"];
        put: operations["completeAsset"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/assets/{assetId}/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["previewAssetDerivative"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{wid}/documents/{id}/assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["replaceDocumentAssets"];
        post?: never;
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
                            externalModelEnabled: boolean;
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
                        externalModelEnabled: boolean;
                        version: number;
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    };
                };
            };
        };
    };
    updateModelPreference: {
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
                    externalModelEnabled: boolean;
                    baseVersion: number;
                };
            };
        };
        responses: {
            /** @description Updated external model preference */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        timeZone: string;
                        externalModelEnabled: boolean;
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
    previewStructure: {
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
                    /** @enum {string} */
                    kind: "SPLIT" | "MERGE" | "LINK" | "CREATE_PARENT";
                    /** Format: uuid */
                    sourceContextId: string;
                    /** Format: uuid */
                    peerContextId?: string | null;
                    createdContexts?: {
                        /** Format: uuid */
                        id: string;
                        name: string;
                        purpose: string;
                        scope: string;
                        /** @enum {string} */
                        kind: "TOPIC" | "FLOW" | "PROJECT" | "COLLECTION";
                    }[];
                    assignments?: {
                        /** Format: uuid */
                        unitId: string;
                        unitRevision: number;
                        after: {
                            /** Format: uuid */
                            contextId: string;
                            /** @enum {string} */
                            role: "PRIMARY" | "SECONDARY" | "BACKGROUND";
                        }[];
                    }[];
                    addedLinks?: {
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
        responses: {
            /** @description Structure preview */
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
                        proposalId: string;
                        preview: {
                            /** @enum {string} */
                            kind: "SPLIT" | "MERGE" | "LINK" | "CREATE_PARENT";
                            /** Format: uuid */
                            sourceContextId: string;
                            /** Format: uuid */
                            peerContextId: string | null;
                            createdContexts: {
                                /** Format: uuid */
                                id: string;
                                name: string;
                                purpose: string;
                                scope: string;
                                /** @enum {string} */
                                kind: "TOPIC" | "FLOW" | "PROJECT" | "COLLECTION";
                            }[];
                            units: {
                                /** Format: uuid */
                                unitId: string;
                                unitRevision: number;
                                membershipVersion: number;
                                before: {
                                    /** Format: uuid */
                                    contextId: string;
                                    /** @enum {string} */
                                    role: "PRIMARY" | "SECONDARY" | "BACKGROUND";
                                }[];
                                after: {
                                    /** Format: uuid */
                                    contextId: string;
                                    /** @enum {string} */
                                    role: "PRIMARY" | "SECONDARY" | "BACKGROUND";
                                }[];
                            }[];
                            addedLinks: {
                                /** Format: uuid */
                                fromContextId: string;
                                /** Format: uuid */
                                toContextId: string;
                                /** @enum {string} */
                                type: "PARENT_OF" | "RELATED_TO";
                            }[];
                            baseContexts: {
                                /** Format: uuid */
                                id: string;
                                name: string;
                                purpose: string;
                                scope: string;
                                /** @enum {string} */
                                kind: "TOPIC" | "FLOW" | "PROJECT" | "COLLECTION";
                                identityRevision: number;
                                membershipRevision: number;
                                /** @enum {string} */
                                state: "ACTIVE" | "ARCHIVED" | "SUPERSEDED";
                            }[];
                            relationHash: string;
                            sourceWillBeSuperseded: boolean;
                            signature: string;
                        };
                    };
                };
            };
        };
    };
    acceptStructure: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                wid: string;
                proposalId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    signature: string;
                };
            };
        };
        responses: {
            /** @description Applied structure */
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
                        mutationId: string;
                        /** Format: uuid */
                        proposalId: string;
                        /** Format: uuid */
                        sourceContextId: string;
                        /** @enum {string} */
                        sourceState: "ACTIVE" | "SUPERSEDED";
                        successorContextIds: string[];
                    };
                };
            };
        };
    };
    previewStructureUndo: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                wid: string;
                mutationId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Inverse preview */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        mutationId: string;
                        signature: string;
                        restores: {
                            /** Format: uuid */
                            unitId: string;
                            before: {
                                /** Format: uuid */
                                contextId: string;
                                /** @enum {string} */
                                role: "PRIMARY" | "SECONDARY" | "BACKGROUND";
                            }[];
                            after: {
                                /** Format: uuid */
                                contextId: string;
                                /** @enum {string} */
                                role: "PRIMARY" | "SECONDARY" | "BACKGROUND";
                            }[];
                        }[];
                        endsRelationIds: string[];
                        reactivatesSource: boolean;
                        retainedContextIds: string[];
                        note: string;
                    };
                };
            };
        };
    };
    undoStructure: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                wid: string;
                mutationId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    signature: string;
                };
            };
        };
        responses: {
            /** @description Inverse applied */
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
                        mutationId: string;
                        /** @enum {boolean} */
                        undone: true;
                        retainedContextIds: string[];
                    };
                };
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
                        successors: {
                            /** Format: uuid */
                            contextId: string;
                            /** Format: uuid */
                            mutationId: string;
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
    listTasks: {
        parameters: {
            query?: {
                state?: string;
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
            /** @description Scoped tasks */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        tasks: {
                            /** Format: uuid */
                            id: string;
                            title: string;
                            description: string;
                            /** @enum {string} */
                            state: "TODO" | "IN_PROGRESS" | "ON_HOLD" | "DONE" | "CANCELED";
                            version: number;
                            due: {
                                /** @enum {string} */
                                kind: "NONE";
                            } | {
                                /** @enum {string} */
                                kind: "DATE";
                                /** Format: date */
                                date: string;
                            } | {
                                /** @enum {string} */
                                kind: "INSTANT";
                                /** Format: date-time */
                                at: string;
                                timeZone: string;
                            };
                            /** Format: uuid */
                            contextId: string | null;
                            origin: {
                                /** @enum {string} */
                                kind: "EXPLICIT";
                                /** Format: uuid */
                                unitId: string | null;
                                unitRevision: number | null;
                            };
                            /** Format: date-time */
                            completedAt: string | null;
                            completionVersion: number | null;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                        }[];
                        nextCursor: string | null;
                    };
                };
            };
        };
    };
    createTask: {
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
                    description?: string;
                    due?: {
                        /** @enum {string} */
                        kind: "NONE";
                    } | {
                        /** @enum {string} */
                        kind: "DATE";
                        /** Format: date */
                        date: string;
                    } | {
                        /** @enum {string} */
                        kind: "INSTANT";
                        /** Format: date-time */
                        at: string;
                        timeZone: string;
                    };
                    /** Format: uuid */
                    contextId?: string | null;
                    origin?: {
                        /** Format: uuid */
                        unitId: string;
                        revision: number;
                    };
                };
            };
        };
        responses: {
            /** @description Task created */
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
                        version: number;
                        /** @enum {string} */
                        state: "TODO" | "IN_PROGRESS" | "ON_HOLD" | "DONE" | "CANCELED";
                    };
                };
            };
        };
    };
    getTask: {
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
            /** @description Task detail */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        title: string;
                        description: string;
                        /** @enum {string} */
                        state: "TODO" | "IN_PROGRESS" | "ON_HOLD" | "DONE" | "CANCELED";
                        version: number;
                        due: {
                            /** @enum {string} */
                            kind: "NONE";
                        } | {
                            /** @enum {string} */
                            kind: "DATE";
                            /** Format: date */
                            date: string;
                        } | {
                            /** @enum {string} */
                            kind: "INSTANT";
                            /** Format: date-time */
                            at: string;
                            timeZone: string;
                        };
                        /** Format: uuid */
                        contextId: string | null;
                        origin: {
                            /** @enum {string} */
                            kind: "EXPLICIT";
                            /** Format: uuid */
                            unitId: string | null;
                            unitRevision: number | null;
                        };
                        /** Format: date-time */
                        completedAt: string | null;
                        completionVersion: number | null;
                        /** Format: date-time */
                        createdAt: string;
                        /** Format: date-time */
                        updatedAt: string;
                        /** Format: uuid */
                        workspaceId: string;
                        history: {
                            version: number;
                            /** @enum {string} */
                            fromState: "TODO" | "IN_PROGRESS" | "ON_HOLD" | "DONE" | "CANCELED";
                            /** @enum {string} */
                            toState: "TODO" | "IN_PROGRESS" | "ON_HOLD" | "DONE" | "CANCELED";
                            /** Format: date-time */
                            recordedAt: string;
                        }[];
                        results: {
                            /** Format: uuid */
                            id: string;
                            completionVersion: number;
                            /** Format: uuid */
                            captureId: string;
                            /** Format: date-time */
                            recordedAt: string;
                        }[];
                    };
                };
            };
        };
    };
    editTask: {
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
                    title?: string;
                    description?: string;
                    due?: {
                        /** @enum {string} */
                        kind: "NONE";
                    } | {
                        /** @enum {string} */
                        kind: "DATE";
                        /** Format: date */
                        date: string;
                    } | {
                        /** @enum {string} */
                        kind: "INSTANT";
                        /** Format: date-time */
                        at: string;
                        timeZone: string;
                    };
                    /** Format: uuid */
                    contextId?: string | null;
                };
            };
        };
        responses: {
            /** @description Task edited */
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
                        version: number;
                        /** @enum {string} */
                        state: "TODO" | "IN_PROGRESS" | "ON_HOLD" | "DONE" | "CANCELED";
                    };
                };
            };
        };
    };
    transitionTask: {
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
                    /** @enum {string} */
                    targetState: "TODO" | "IN_PROGRESS" | "ON_HOLD" | "DONE" | "CANCELED";
                };
            };
        };
        responses: {
            /** @description Task state changed */
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
                        version: number;
                        /** @enum {string} */
                        state: "TODO" | "IN_PROGRESS" | "ON_HOLD" | "DONE" | "CANCELED";
                        completionVersion: number | null;
                    };
                };
            };
        };
    };
    addTaskResult: {
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
            /** @description Task result recorded as Capture */
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
                        taskId: string;
                        completionVersion: number;
                        /** Format: uuid */
                        captureId: string;
                        /** Format: uuid */
                        unitId: string;
                    };
                };
            };
        };
    };
    listEvents: {
        parameters: {
            query: {
                fromDate: string;
                toDateExclusive: string;
                viewTimeZone: string;
                includeCanceled?: boolean;
            };
            header?: never;
            path: {
                wid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Events in the requested period */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: date */
                        fromDate: string;
                        /** Format: date */
                        toDateExclusive: string;
                        viewTimeZone: string;
                        events: {
                            /** Format: uuid */
                            id: string;
                            title: string;
                            description: string;
                            /** @enum {string} */
                            state: "CONFIRMED" | "CANCELED";
                            version: number;
                            schedule: {
                                /** @enum {string} */
                                kind: "TIMED";
                                timeZone: string;
                                startLocal: string;
                                endLocal: string;
                                startOffsetMinutes: number;
                                endOffsetMinutes: number;
                                /** Format: date-time */
                                startAt: string;
                                /** Format: date-time */
                                endAt: string;
                                displayStartLocal?: string;
                                displayEndLocal?: string;
                            } | {
                                /** @enum {string} */
                                kind: "ALL_DAY";
                                timeZone: string;
                                /** Format: date */
                                startDate: string;
                                /** Format: date */
                                endDateExclusive: string;
                            };
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                            overlappingEventIds: string[];
                        }[];
                    };
                };
            };
        };
    };
    createEvent: {
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
                    description?: string;
                    schedule: {
                        /** @enum {string} */
                        kind: "TIMED";
                        timeZone: string;
                        startLocal: string;
                        endLocal: string;
                        startOffsetMinutes?: number;
                        endOffsetMinutes?: number;
                    } | {
                        /** @enum {string} */
                        kind: "ALL_DAY";
                        timeZone: string;
                        /** Format: date */
                        startDate: string;
                        /** Format: date */
                        endDateExclusive: string;
                    };
                };
            };
        };
        responses: {
            /** @description Event created */
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
                        version: number;
                        /** @enum {string} */
                        state: "CONFIRMED" | "CANCELED";
                    };
                };
            };
        };
    };
    getEvent: {
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
            /** @description Event detail */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        title: string;
                        description: string;
                        /** @enum {string} */
                        state: "CONFIRMED" | "CANCELED";
                        version: number;
                        schedule: {
                            /** @enum {string} */
                            kind: "TIMED";
                            timeZone: string;
                            startLocal: string;
                            endLocal: string;
                            startOffsetMinutes: number;
                            endOffsetMinutes: number;
                            /** Format: date-time */
                            startAt: string;
                            /** Format: date-time */
                            endAt: string;
                            displayStartLocal?: string;
                            displayEndLocal?: string;
                        } | {
                            /** @enum {string} */
                            kind: "ALL_DAY";
                            timeZone: string;
                            /** Format: date */
                            startDate: string;
                            /** Format: date */
                            endDateExclusive: string;
                        };
                        /** Format: date-time */
                        createdAt: string;
                        /** Format: date-time */
                        updatedAt: string;
                        /** Format: uuid */
                        workspaceId: string;
                    };
                };
            };
        };
    };
    editEvent: {
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
                    title?: string;
                    description?: string;
                    schedule?: {
                        /** @enum {string} */
                        kind: "TIMED";
                        timeZone: string;
                        startLocal: string;
                        endLocal: string;
                        startOffsetMinutes?: number;
                        endOffsetMinutes?: number;
                    } | {
                        /** @enum {string} */
                        kind: "ALL_DAY";
                        timeZone: string;
                        /** Format: date */
                        startDate: string;
                        /** Format: date */
                        endDateExclusive: string;
                    };
                };
            };
        };
        responses: {
            /** @description Event edited */
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
                        version: number;
                        /** @enum {string} */
                        state: "CONFIRMED" | "CANCELED";
                    };
                };
            };
        };
    };
    setEventState: {
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
                    /** @enum {string} */
                    targetState: "CONFIRMED" | "CANCELED";
                };
            };
        };
        responses: {
            /** @description Event state changed */
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
                        version: number;
                        /** @enum {string} */
                        state: "CONFIRMED" | "CANCELED";
                    };
                };
            };
        };
    };
    requestJudgement: {
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
                    unitId: string;
                    unitRevision: number;
                };
            };
        };
        responses: {
            /** @description Judgement queued */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        requestId: string;
                        /** @enum {string} */
                        state: "QUEUED";
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    };
                };
            };
        };
    };
    getJudgementStatus: {
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
            /** @description Scoped judgement status */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        requestId: string;
                        /** @enum {string} */
                        state: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";
                        retryCount: number;
                        inputHash: string | null;
                        /** @enum {string|null} */
                        profileState: "FRESH" | "LAGGING" | null;
                        eligibleContextCount: number | null;
                        returnedContextCount: number | null;
                        truncated: boolean | null;
                    };
                };
            };
        };
    };
    getJudgementCandidates: {
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
            /** @description Read-only observed candidates; rankScore is not a probability */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        requestId: string;
                        /** Format: uuid */
                        unitId: string;
                        unitRevision: number;
                        candidates: {
                            /** Format: uuid */
                            contextId: string;
                            identityRevision: number;
                            membershipRevision: number;
                            rank: number;
                            rankScore: number | null;
                            /** @enum {string} */
                            decision: "candidate" | "abstain";
                            reasons: string[];
                        }[];
                        truncated: boolean;
                    };
                };
            };
        };
    };
    createJudgementProposal: {
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
                    /** Format: uuid */
                    unitId: string;
                    unitRevision: number;
                    /** Format: uuid */
                    contextId: string;
                    /** @enum {string} */
                    role: "PRIMARY" | "SECONDARY" | "BACKGROUND";
                };
            };
        };
        responses: {
            /** @description User-selected proposal */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        proposalId: string;
                        /** @enum {string} */
                        state: "PENDING";
                        operationsHash: string;
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    };
                };
            };
        };
    };
    getJudgementProposal: {
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
            /** @description Exact membership preview */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        proposalId: string;
                        /** Format: uuid */
                        runRequestId: string;
                        /** Format: uuid */
                        unitId: string;
                        unitRevision: number;
                        /** Format: uuid */
                        contextId: string;
                        /** @enum {string} */
                        role: "PRIMARY" | "SECONDARY" | "BACKGROUND";
                        operations: {
                            /** Format: uuid */
                            unitId: string;
                            unitRevision: number;
                            source: {
                                /** Format: uuid */
                                captureId: string;
                                captureRevision: number;
                                currentCaptureRevision: number;
                                captureVersion: number;
                            };
                            baseMembershipVersion: number;
                            before: {
                                /** Format: uuid */
                                contextId: string;
                                /** @enum {string} */
                                role: "PRIMARY" | "SECONDARY" | "BACKGROUND";
                            }[];
                            after: {
                                /** Format: uuid */
                                contextId: string;
                                /** @enum {string} */
                                role: "PRIMARY" | "SECONDARY" | "BACKGROUND";
                            }[];
                            contexts: {
                                /** Format: uuid */
                                contextId: string;
                                identityRevision: number;
                                membershipRevision: number;
                            }[];
                        };
                        operationsHash: string;
                        sourceStale: boolean;
                        /** @enum {string} */
                        state: "PENDING" | "ACCEPTED" | "REJECTED" | "DISMISSED" | "EXPIRED" | "SUPERSEDED";
                        /** Format: date-time */
                        expiresAt: string;
                    };
                };
            };
        };
    };
    exposeJudgementProposal: {
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
            /** @description Client-reported exposure */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        proposalId: string;
                        /** Format: uuid */
                        exposureId: string;
                        /** @enum {string} */
                        state: "PENDING";
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    };
                };
            };
        };
    };
    acceptJudgementProposal: {
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
                    /** Format: uuid */
                    exposureId: string;
                    operationsHash: string;
                };
            };
        };
        responses: {
            /** @description Recorded proposal decision */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        proposalId: string;
                        /** @enum {string} */
                        state: "ACCEPTED";
                        /** Format: uuid */
                        unitId: string;
                        membershipVersion: number;
                        memberships: {
                            /** Format: uuid */
                            contextId: string;
                            /** @enum {string} */
                            role: "PRIMARY" | "SECONDARY" | "BACKGROUND";
                        }[];
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    } | {
                        /** Format: uuid */
                        proposalId: string;
                        /** @enum {string} */
                        state: "REJECTED";
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    } | {
                        /** Format: uuid */
                        proposalId: string;
                        /** @enum {string} */
                        state: "DISMISSED";
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    };
                };
            };
        };
    };
    rejectJudgementProposal: {
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
                    /** Format: uuid */
                    exposureId: string;
                    operationsHash: string;
                };
            };
        };
        responses: {
            /** @description Recorded proposal decision */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        proposalId: string;
                        /** @enum {string} */
                        state: "ACCEPTED";
                        /** Format: uuid */
                        unitId: string;
                        membershipVersion: number;
                        memberships: {
                            /** Format: uuid */
                            contextId: string;
                            /** @enum {string} */
                            role: "PRIMARY" | "SECONDARY" | "BACKGROUND";
                        }[];
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    } | {
                        /** Format: uuid */
                        proposalId: string;
                        /** @enum {string} */
                        state: "REJECTED";
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    } | {
                        /** Format: uuid */
                        proposalId: string;
                        /** @enum {string} */
                        state: "DISMISSED";
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    };
                };
            };
        };
    };
    dismissJudgementProposal: {
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
                    /** Format: uuid */
                    exposureId: string;
                    operationsHash: string;
                };
            };
        };
        responses: {
            /** @description Recorded proposal decision */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        proposalId: string;
                        /** @enum {string} */
                        state: "ACCEPTED";
                        /** Format: uuid */
                        unitId: string;
                        membershipVersion: number;
                        memberships: {
                            /** Format: uuid */
                            contextId: string;
                            /** @enum {string} */
                            role: "PRIMARY" | "SECONDARY" | "BACKGROUND";
                        }[];
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    } | {
                        /** Format: uuid */
                        proposalId: string;
                        /** @enum {string} */
                        state: "REJECTED";
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    } | {
                        /** Format: uuid */
                        proposalId: string;
                        /** @enum {string} */
                        state: "DISMISSED";
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    };
                };
            };
        };
    };
    generateExtractionCandidates: {
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
            /** @description Validated local parser candidates */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        captureId: string;
                        captureRevision: number;
                        candidateIds: string[];
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    };
                };
            };
        };
    };
    getExtractionCandidate: {
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
            /** @description Candidate and prior target warnings */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        proposalId: string;
                        /** @enum {string} */
                        state: "CANDIDATE" | "ACCEPTED" | "REJECTED";
                        /** Format: uuid */
                        targetId: string | null;
                        proposal: {
                            proposalId: string;
                            decisionKey: string;
                            origin: {
                                /** Format: uuid */
                                workspaceId: string;
                                /** Format: uuid */
                                captureId: string;
                                revision: number;
                                originKey: string;
                                sourceSpan: {
                                    start: number;
                                    end: number;
                                    /** @enum {string} */
                                    encoding: "utf16";
                                };
                                sourceText: string;
                            };
                            /** @enum {string} */
                            targetKind: "task" | "event" | "thought_unit";
                            suggestedTitle: string;
                            suggestedBody: string | null;
                            temporal: {
                                expression: string;
                                basisEpochMs: number;
                                timeZone: string | null;
                                proposedEpochMs: number | null;
                                ambiguity: string[];
                            } | null;
                            unresolvedFields: ("title" | "body" | "time_zone" | "start_time" | "ambiguity")[];
                            /** @enum {string} */
                            status: "candidate";
                        };
                        sourceStale: boolean;
                        priorTargets: {
                            /** @enum {string} */
                            kind: "task" | "event" | "thought_unit";
                            /** Format: uuid */
                            id: string;
                            state: string | null;
                            /** @enum {string} */
                            match: "EXACT_SOURCE" | "SIMILAR_TITLE";
                        }[];
                    };
                };
            };
        };
    };
    acceptExtractionCandidate: {
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
                    expectedCaptureRevision: number;
                    title: string;
                    body?: string | null;
                    schedule?: {
                        /** @enum {string} */
                        kind: "TIMED";
                        timeZone: string;
                        startLocal: string;
                        endLocal: string;
                        startOffsetMinutes?: number;
                        endOffsetMinutes?: number;
                    } | {
                        /** @enum {string} */
                        kind: "ALL_DAY";
                        timeZone: string;
                        /** Format: date */
                        startDate: string;
                        /** Format: date */
                        endDateExclusive: string;
                    };
                };
            };
        };
        responses: {
            /** @description Confirmed source-backed command */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        proposalId: string;
                        /** @enum {string} */
                        state: "ACCEPTED";
                        /** @enum {string} */
                        targetKind: "task" | "event" | "thought_unit";
                        /** Format: uuid */
                        targetId: string;
                        /** Format: uuid */
                        sourceUnitId: string;
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    } | {
                        proposalId: string;
                        /** @enum {string} */
                        state: "REJECTED";
                        /** @enum {string|null} */
                        targetId: null;
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    };
                };
            };
        };
    };
    rejectExtractionCandidate: {
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
                    expectedCaptureRevision: number;
                };
            };
        };
        responses: {
            /** @description Rejected candidate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        proposalId: string;
                        /** @enum {string} */
                        state: "ACCEPTED";
                        /** @enum {string} */
                        targetKind: "task" | "event" | "thought_unit";
                        /** Format: uuid */
                        targetId: string;
                        /** Format: uuid */
                        sourceUnitId: string;
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    } | {
                        proposalId: string;
                        /** @enum {string} */
                        state: "REJECTED";
                        /** @enum {string|null} */
                        targetId: null;
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                    };
                };
            };
        };
    };
    listDocuments: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                wid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Scoped documents */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        documents: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            workspaceId: string;
                            /** @enum {string} */
                            kind: "WIKI" | "ARTICLE" | "NOTE";
                            title: string;
                            /** @enum {string} */
                            state: "ACTIVE" | "ARCHIVED";
                            draftVersion: number;
                            latestRevision: number;
                            linkVersion: number;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                        }[];
                    };
                };
            };
        };
    };
    createDocument: {
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
                    /** @enum {string} */
                    kind: "WIKI" | "ARTICLE" | "NOTE";
                    title: string;
                };
            };
        };
        responses: {
            /** @description Document created */
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
                        /** @enum {string} */
                        kind: "WIKI" | "ARTICLE" | "NOTE";
                        draftVersion: number;
                        latestRevision: number;
                    };
                };
            };
        };
    };
    getDocument: {
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
            /** @description Document draft and links */
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
                        /** @enum {string} */
                        kind: "WIKI" | "ARTICLE" | "NOTE";
                        title: string;
                        /** @enum {string} */
                        state: "ACTIVE" | "ARCHIVED";
                        draftVersion: number;
                        latestRevision: number;
                        linkVersion: number;
                        content: {
                            /** @enum {number} */
                            schemaVersion: 1;
                            content: {
                                /** @enum {string} */
                                type: "doc";
                                content?: ({
                                    /** @enum {string} */
                                    type: "paragraph";
                                    attrs: {
                                        /** Format: uuid */
                                        blockId: string;
                                    };
                                    content?: ({
                                        /** @enum {string} */
                                        type: "text";
                                        text: string;
                                        marks?: {
                                            /** @enum {string} */
                                            type: "bold" | "italic";
                                        }[];
                                    } | {
                                        /** @enum {string} */
                                        type: "sourceReference";
                                        attrs: {
                                            label: string;
                                            ref: {
                                                /** @enum {string} */
                                                sourceKind: "unit" | "document_revision" | "external_excerpt";
                                                sourceId: string;
                                                sourceRevision: number;
                                                originKey: string;
                                                sourceHash: string;
                                                span?: {
                                                    start: number;
                                                    end: number;
                                                    /** @enum {string} */
                                                    encoding: "utf16";
                                                };
                                            };
                                        };
                                    } | {
                                        /** @enum {string} */
                                        type: "hardBreak";
                                    })[];
                                } | {
                                    /** @enum {string} */
                                    type: "heading";
                                    attrs: {
                                        /** Format: uuid */
                                        blockId: string;
                                        level: number;
                                    };
                                    content?: ({
                                        /** @enum {string} */
                                        type: "text";
                                        text: string;
                                        marks?: {
                                            /** @enum {string} */
                                            type: "bold" | "italic";
                                        }[];
                                    } | {
                                        /** @enum {string} */
                                        type: "sourceReference";
                                        attrs: {
                                            label: string;
                                            ref: {
                                                /** @enum {string} */
                                                sourceKind: "unit" | "document_revision" | "external_excerpt";
                                                sourceId: string;
                                                sourceRevision: number;
                                                originKey: string;
                                                sourceHash: string;
                                                span?: {
                                                    start: number;
                                                    end: number;
                                                    /** @enum {string} */
                                                    encoding: "utf16";
                                                };
                                            };
                                        };
                                    } | {
                                        /** @enum {string} */
                                        type: "hardBreak";
                                    })[];
                                })[];
                            };
                        };
                        assetIds: string[];
                        links: string[];
                        backlinks: string[];
                        /** Format: date-time */
                        createdAt: string;
                        /** Format: date-time */
                        updatedAt: string;
                    };
                };
            };
        };
    };
    saveDocumentDraft: {
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
                    saveSequence: number;
                    /** @enum {number} */
                    schemaVersion: 1;
                    content: {
                        /** @enum {string} */
                        type: "doc";
                        content?: ({
                            /** @enum {string} */
                            type: "paragraph";
                            attrs: {
                                /** Format: uuid */
                                blockId: string;
                            };
                            content?: ({
                                /** @enum {string} */
                                type: "text";
                                text: string;
                                marks?: {
                                    /** @enum {string} */
                                    type: "bold" | "italic";
                                }[];
                            } | {
                                /** @enum {string} */
                                type: "sourceReference";
                                attrs: {
                                    label: string;
                                    ref: {
                                        /** @enum {string} */
                                        sourceKind: "unit" | "document_revision" | "external_excerpt";
                                        sourceId: string;
                                        sourceRevision: number;
                                        originKey: string;
                                        sourceHash: string;
                                        span?: {
                                            start: number;
                                            end: number;
                                            /** @enum {string} */
                                            encoding: "utf16";
                                        };
                                    };
                                };
                            } | {
                                /** @enum {string} */
                                type: "hardBreak";
                            })[];
                        } | {
                            /** @enum {string} */
                            type: "heading";
                            attrs: {
                                /** Format: uuid */
                                blockId: string;
                                level: number;
                            };
                            content?: ({
                                /** @enum {string} */
                                type: "text";
                                text: string;
                                marks?: {
                                    /** @enum {string} */
                                    type: "bold" | "italic";
                                }[];
                            } | {
                                /** @enum {string} */
                                type: "sourceReference";
                                attrs: {
                                    label: string;
                                    ref: {
                                        /** @enum {string} */
                                        sourceKind: "unit" | "document_revision" | "external_excerpt";
                                        sourceId: string;
                                        sourceRevision: number;
                                        originKey: string;
                                        sourceHash: string;
                                        span?: {
                                            start: number;
                                            end: number;
                                            /** @enum {string} */
                                            encoding: "utf16";
                                        };
                                    };
                                };
                            } | {
                                /** @enum {string} */
                                type: "hardBreak";
                            })[];
                        })[];
                    };
                };
            };
        };
        responses: {
            /** @description Draft saved */
            200: {
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
                        draftVersion: number;
                        saveSequence: number;
                        recheckBlockIds: string[];
                        removedBlockIds: string[];
                    };
                };
            };
        };
    };
    sealDocument: {
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
                    draftVersion: number;
                };
            };
        };
        responses: {
            /** @description Immutable revision created */
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
                        revision: number;
                        draftVersion: number;
                        contentHash: string;
                        restoredFromRevision: number | null;
                    };
                };
            };
        };
    };
    getDocumentRevision: {
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
            /** @description Immutable revision */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        revision: number;
                        title: string;
                        content: {
                            /** @enum {number} */
                            schemaVersion: 1;
                            content: {
                                /** @enum {string} */
                                type: "doc";
                                content?: ({
                                    /** @enum {string} */
                                    type: "paragraph";
                                    attrs: {
                                        /** Format: uuid */
                                        blockId: string;
                                    };
                                    content?: ({
                                        /** @enum {string} */
                                        type: "text";
                                        text: string;
                                        marks?: {
                                            /** @enum {string} */
                                            type: "bold" | "italic";
                                        }[];
                                    } | {
                                        /** @enum {string} */
                                        type: "sourceReference";
                                        attrs: {
                                            label: string;
                                            ref: {
                                                /** @enum {string} */
                                                sourceKind: "unit" | "document_revision" | "external_excerpt";
                                                sourceId: string;
                                                sourceRevision: number;
                                                originKey: string;
                                                sourceHash: string;
                                                span?: {
                                                    start: number;
                                                    end: number;
                                                    /** @enum {string} */
                                                    encoding: "utf16";
                                                };
                                            };
                                        };
                                    } | {
                                        /** @enum {string} */
                                        type: "hardBreak";
                                    })[];
                                } | {
                                    /** @enum {string} */
                                    type: "heading";
                                    attrs: {
                                        /** Format: uuid */
                                        blockId: string;
                                        level: number;
                                    };
                                    content?: ({
                                        /** @enum {string} */
                                        type: "text";
                                        text: string;
                                        marks?: {
                                            /** @enum {string} */
                                            type: "bold" | "italic";
                                        }[];
                                    } | {
                                        /** @enum {string} */
                                        type: "sourceReference";
                                        attrs: {
                                            label: string;
                                            ref: {
                                                /** @enum {string} */
                                                sourceKind: "unit" | "document_revision" | "external_excerpt";
                                                sourceId: string;
                                                sourceRevision: number;
                                                originKey: string;
                                                sourceHash: string;
                                                span?: {
                                                    start: number;
                                                    end: number;
                                                    /** @enum {string} */
                                                    encoding: "utf16";
                                                };
                                            };
                                        };
                                    } | {
                                        /** @enum {string} */
                                        type: "hardBreak";
                                    })[];
                                })[];
                            };
                        };
                        assetIds: string[];
                        contentHash: string;
                        draftVersion: number | null;
                        restoredFromRevision: number | null;
                        /** Format: date-time */
                        createdAt: string;
                    };
                };
            };
        };
    };
    restoreDocumentRevision: {
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
                    sourceRevision: number;
                };
            };
        };
        responses: {
            /** @description Restored as a new revision */
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
                        revision: number;
                        draftVersion: number;
                        contentHash: string;
                        restoredFromRevision: number | null;
                    };
                };
            };
        };
    };
    replaceWikiLinks: {
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
                    baseLinkVersion: number;
                    targetIds: string[];
                };
            };
        };
        responses: {
            /** @description Wiki links replaced */
            200: {
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
                        linkVersion: number;
                        targetIds: string[];
                    };
                };
            };
        };
    };
    createExternalExcerpt: {
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
                    /** Format: uri */
                    url: string;
                    author: string;
                    /** Format: date */
                    publishedAt: string | null;
                    excerpt: string;
                };
            };
        };
        responses: {
            /** @description Excerpt created */
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
                        version: number;
                        revision: number;
                        /** @enum {string} */
                        state: "ACTIVE" | "DELETED";
                        contentHash: string;
                    };
                };
            };
        };
    };
    getExternalExcerpt: {
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
            /** @description Private excerpt */
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
                        version: number;
                        revision: number;
                        /** @enum {string} */
                        state: "ACTIVE" | "DELETED";
                        title: string;
                        /** Format: uri */
                        url: string;
                        author: string;
                        /** Format: date */
                        publishedAt: string | null;
                        excerpt: string;
                        contentHash: string;
                        /** Format: date-time */
                        recordedAt: string;
                    };
                };
            };
        };
    };
    reviseExternalExcerpt: {
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
                    title: string;
                    /** Format: uri */
                    url: string;
                    author: string;
                    /** Format: date */
                    publishedAt: string | null;
                    excerpt: string;
                    baseVersion: number;
                };
            };
        };
        responses: {
            /** @description Excerpt revised */
            200: {
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
                        version: number;
                        revision: number;
                        /** @enum {string} */
                        state: "ACTIVE" | "DELETED";
                        contentHash: string;
                    };
                };
            };
        };
    };
    deleteExternalExcerpt: {
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
            /** @description Excerpt hidden */
            200: {
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
                        version: number;
                        revision: number;
                        /** @enum {string} */
                        state: "ACTIVE" | "DELETED";
                        contentHash: string;
                    };
                };
            };
        };
    };
    createEvidencePack: {
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
                    title: string;
                    sources: ({
                        /** @enum {string} */
                        kind: "capture_revision";
                        /** Format: uuid */
                        id: string;
                        revision: number;
                        span: {
                            start: number;
                            end: number;
                            /** @enum {string} */
                            encoding: "utf16";
                        };
                    } | {
                        /** @enum {string} */
                        kind: "unit";
                        /** Format: uuid */
                        id: string;
                        revision: number;
                        span?: {
                            start: number;
                            end: number;
                            /** @enum {string} */
                            encoding: "utf16";
                        };
                    } | {
                        /** @enum {string} */
                        kind: "document_revision";
                        /** Format: uuid */
                        id: string;
                        revision: number;
                        span?: {
                            start: number;
                            end: number;
                            /** @enum {string} */
                            encoding: "utf16";
                        };
                    } | {
                        /** @enum {string} */
                        kind: "task_result";
                        /** Format: uuid */
                        id: string;
                        revision: number;
                        span?: {
                            start: number;
                            end: number;
                            /** @enum {string} */
                            encoding: "utf16";
                        };
                    } | {
                        /** @enum {string} */
                        kind: "external_excerpt";
                        /** Format: uuid */
                        id: string;
                        revision: number;
                        span?: {
                            start: number;
                            end: number;
                            /** @enum {string} */
                            encoding: "utf16";
                        };
                    })[];
                };
            };
        };
        responses: {
            /** @description Pack created */
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
                        documentId: string;
                        revision: number;
                        manifestHash: string;
                    };
                };
            };
        };
    };
    reviseEvidencePack: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                wid: string;
                id: string;
                packId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    title: string;
                    sources: ({
                        /** @enum {string} */
                        kind: "capture_revision";
                        /** Format: uuid */
                        id: string;
                        revision: number;
                        span: {
                            start: number;
                            end: number;
                            /** @enum {string} */
                            encoding: "utf16";
                        };
                    } | {
                        /** @enum {string} */
                        kind: "unit";
                        /** Format: uuid */
                        id: string;
                        revision: number;
                        span?: {
                            start: number;
                            end: number;
                            /** @enum {string} */
                            encoding: "utf16";
                        };
                    } | {
                        /** @enum {string} */
                        kind: "document_revision";
                        /** Format: uuid */
                        id: string;
                        revision: number;
                        span?: {
                            start: number;
                            end: number;
                            /** @enum {string} */
                            encoding: "utf16";
                        };
                    } | {
                        /** @enum {string} */
                        kind: "task_result";
                        /** Format: uuid */
                        id: string;
                        revision: number;
                        span?: {
                            start: number;
                            end: number;
                            /** @enum {string} */
                            encoding: "utf16";
                        };
                    } | {
                        /** @enum {string} */
                        kind: "external_excerpt";
                        /** Format: uuid */
                        id: string;
                        revision: number;
                        span?: {
                            start: number;
                            end: number;
                            /** @enum {string} */
                            encoding: "utf16";
                        };
                    })[];
                    baseRevision: number;
                };
            };
        };
        responses: {
            /** @description Pack revision created */
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
                        documentId: string;
                        revision: number;
                        manifestHash: string;
                    };
                };
            };
        };
    };
    getEvidencePackRevision: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                wid: string;
                id: string;
                packId: string;
                revision: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Immutable pack revision with live source states */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        documentId: string;
                        revision: number;
                        currentRevision: number;
                        title: string;
                        manifestHash: string;
                        sources: {
                            /** @enum {string} */
                            kind: "capture_revision" | "unit" | "document_revision" | "task_result" | "external_excerpt";
                            /** Format: uuid */
                            id: string;
                            revision: number;
                            originKey: string;
                            contentHash: string;
                            span: {
                                start: number;
                                end: number;
                                /** @enum {string} */
                                encoding: "utf16";
                            } | null;
                            text: string;
                            title: string;
                            /** Format: uri */
                            url: string | null;
                            author: string | null;
                            /** Format: date */
                            publishedAt: string | null;
                        }[];
                        sourceStates: ("fresh" | "stale" | "unresolved")[];
                        originFamilies: string[];
                        /** Format: date-time */
                        createdAt: string;
                    };
                };
            };
        };
    };
    getDocumentWorkbench: {
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
            /** @description Workbench and live review states */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        documentId: string;
                        version: number;
                        draftVersion: number;
                        currentDraftVersion: number;
                        /** Format: uuid */
                        packId: string;
                        packRevision: number;
                        /** @enum {string} */
                        purpose: "guide" | "experiment_note" | "decision_record" | "comparison";
                        audience: string;
                        outline: {
                            itemId: string;
                            citations: {
                                sourceIndex: number;
                                /** @enum {string} */
                                role: "personal_observation" | "external_claim" | "counterargument";
                            }[];
                            authorInterpretation: string | null;
                        }[];
                        conflicts: {
                            leftSourceIndex: number;
                            rightSourceIndex: number;
                            note: string;
                        }[];
                        claims: {
                            /** Format: uuid */
                            blockId: string;
                            /** Format: uuid */
                            claimId: string;
                            textHash: string;
                            blockHash: string;
                            /** @enum {string} */
                            transform: "quote" | "paraphrase" | "synthesis" | "author_added";
                            sourceIndices: number[];
                            /** @enum {string} */
                            semanticReview: "unreviewed" | "supported" | "disputed" | "author_asserted";
                        }[];
                        claimStates: {
                            /** Format: uuid */
                            claimId: string;
                            /** @enum {string} */
                            state: "current" | "needs_remap" | "source_stale" | "source_unresolved";
                        }[];
                        sourceStates: ("fresh" | "stale" | "unresolved")[];
                        sourceManifest: {
                            /** @enum {string} */
                            kind: "capture_revision" | "unit" | "document_revision" | "task_result" | "external_excerpt";
                            /** Format: uuid */
                            id: string;
                            revision: number;
                            originKey: string;
                            contentHash: string;
                            span: {
                                start: number;
                                end: number;
                                /** @enum {string} */
                                encoding: "utf16";
                            } | null;
                            text: string;
                            title: string;
                            /** Format: uri */
                            url: string | null;
                            author: string | null;
                            /** Format: date */
                            publishedAt: string | null;
                        }[];
                        readiness: {
                            /** @enum {string} */
                            status: "needs_material" | "needs_author_review";
                            missingItems: string[];
                            authorDraftItems: string[];
                            missingCounterargument: boolean;
                            independentOriginFamilies: string[];
                            unresolvedConflicts: {
                                leftSourceIndex: number;
                                rightSourceIndex: number;
                                note: string;
                            }[];
                            /** @enum {boolean} */
                            reviewRequired: true;
                        };
                        /** Format: date-time */
                        createdAt: string;
                    };
                };
            };
        };
    };
    saveDocumentWorkbench: {
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
                    draftVersion: number;
                    /** Format: uuid */
                    packId: string;
                    packRevision: number;
                    /** @enum {string} */
                    purpose: "guide" | "experiment_note" | "decision_record" | "comparison";
                    audience: string;
                    outline: {
                        itemId: string;
                        citations: {
                            sourceIndex: number;
                            /** @enum {string} */
                            role: "personal_observation" | "external_claim" | "counterargument";
                        }[];
                        authorInterpretation: string | null;
                    }[];
                    conflicts: {
                        leftSourceIndex: number;
                        rightSourceIndex: number;
                        note: string;
                    }[];
                    claims: {
                        /** Format: uuid */
                        blockId: string;
                        /** Format: uuid */
                        claimId: string;
                        textHash: string;
                        blockHash: string;
                        /** @enum {string} */
                        transform: "quote" | "paraphrase" | "synthesis" | "author_added";
                        sourceIndices: number[];
                        /** @enum {string} */
                        semanticReview: "unreviewed" | "supported" | "disputed" | "author_asserted";
                    }[];
                };
            };
        };
        responses: {
            /** @description Workbench snapshot saved */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                        /** Format: uuid */
                        documentId: string;
                        version: number;
                        draftVersion: number;
                        /** Format: uuid */
                        packId: string;
                        packRevision: number;
                    };
                };
            };
        };
    };
    requestGeneration: {
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
                    /** Format: uuid */
                    packId: string;
                    packRevision: number;
                    draftVersion: number;
                    /** @enum {string} */
                    mode: "outline" | "refine" | "draft";
                    sourceIndices: number[];
                    targetBlockIds: string[];
                    /** @enum {boolean} */
                    consent: true;
                    maxInputTokens: number;
                    maxOutputTokens: number;
                    maxCostMicrousd: number;
                };
            };
        };
        responses: {
            /** @description Generation queued */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                        /** Format: uuid */
                        requestId: string;
                        /** @enum {string} */
                        state: "QUEUED";
                    };
                };
            };
        };
    };
    getGeneration: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                wid: string;
                id: string;
                requestId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Private generation status and artifact */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        requestId: string;
                        /** Format: uuid */
                        documentId: string;
                        /** @enum {string} */
                        state: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "STALE";
                        /** @enum {string} */
                        mode: "outline" | "refine" | "draft";
                        /** Format: uuid */
                        packId: string;
                        packRevision: number;
                        draftVersion: number;
                        sourceIndices: number[];
                        retryCount: number;
                        errorCode: string | null;
                        actualCostMicrousd: number | null;
                        artifact: {
                            modelId: string;
                            promptRevision: string;
                            inputHash: string;
                            /** Format: uuid */
                            packId: string;
                            packRevision: number;
                            draftVersion: number;
                            proposals: {
                                /** Format: uuid */
                                id: string;
                                /** @enum {string} */
                                kind: "heading" | "paragraph";
                                /** Format: uuid */
                                targetBlockId: string | null;
                                text: string;
                                sourceIndices: number[];
                                /** @enum {boolean} */
                                reviewRequired: true;
                            }[];
                            diff: {
                                /** Format: uuid */
                                proposalId: string;
                                /** Format: uuid */
                                targetBlockId: string | null;
                                beforeText: string | null;
                                afterText: string;
                            }[];
                            inputTokens: number;
                            outputTokens: number;
                            estimatedCostMicrousd: number;
                            /** Format: date-time */
                            createdAt: string;
                        } | null;
                    };
                };
            };
        };
    };
    cancelGeneration: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                wid: string;
                id: string;
                requestId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Cancellation requested */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                        /** Format: uuid */
                        requestId: string;
                        /** @enum {string} */
                        state: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "STALE";
                    };
                };
            };
        };
    };
    applyGeneration: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                wid: string;
                id: string;
                requestId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    baseDraftVersion: number;
                    proposalIds: string[];
                };
            };
        };
        responses: {
            /** @description Selected proposals applied */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                        /** Format: uuid */
                        documentId: string;
                        draftVersion: number;
                        appliedProposalIds: string[];
                        recheckBlockIds: string[];
                    };
                };
            };
        };
    };
    listAssets: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                wid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Private assets */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        assets: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            workspaceId: string;
                            fileName: string;
                            /** @enum {string} */
                            declaredMime: "text/plain" | "text/markdown" | "image/png" | "image/jpeg" | "image/webp";
                            expectedSize: number;
                            /** @enum {string} */
                            state: "PENDING" | "VERIFIED" | "REJECTED" | "DELETED";
                            rejectionCode: string | null;
                            detectedMime: string | null;
                            byteSize: number | null;
                            contentHash: string | null;
                            /** Format: uuid */
                            publicAssetId: string | null;
                            derivativeMime: string | null;
                            derivativeHash: string | null;
                            usedInDocumentIds: string[];
                            /** Format: date-time */
                            createdAt: string;
                        }[];
                    };
                };
            };
        };
    };
    createAsset: {
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
                    fileName: string;
                    /** @enum {string} */
                    declaredMime: "text/plain" | "text/markdown" | "image/png" | "image/jpeg" | "image/webp";
                    expectedSize: number;
                };
            };
        };
        responses: {
            /** @description Pending asset */
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
                        assetId: string;
                        /** @enum {string} */
                        state: "PENDING";
                    };
                };
            };
        };
    };
    getAsset: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                wid: string;
                assetId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Private asset metadata */
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
                        fileName: string;
                        /** @enum {string} */
                        declaredMime: "text/plain" | "text/markdown" | "image/png" | "image/jpeg" | "image/webp";
                        expectedSize: number;
                        /** @enum {string} */
                        state: "PENDING" | "VERIFIED" | "REJECTED" | "DELETED";
                        rejectionCode: string | null;
                        detectedMime: string | null;
                        byteSize: number | null;
                        contentHash: string | null;
                        /** Format: uuid */
                        publicAssetId: string | null;
                        derivativeMime: string | null;
                        derivativeHash: string | null;
                        usedInDocumentIds: string[];
                        /** Format: date-time */
                        createdAt: string;
                    };
                };
            };
        };
    };
    deleteAsset: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                wid: string;
                assetId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Unused asset removed from use */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                        /** Format: uuid */
                        assetId: string;
                        /** @enum {string} */
                        state: "DELETED";
                    };
                };
            };
        };
    };
    downloadPrivateAsset: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                wid: string;
                assetId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Owner-only original bytes */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/plain": string;
                    "text/markdown": string;
                    "image/png": string;
                    "image/jpeg": string;
                    "image/webp": string;
                };
            };
        };
    };
    completeAsset: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                wid: string;
                assetId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/octet-stream": string;
            };
        };
        responses: {
            /** @description Verified or rejected asset */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                        /** Format: uuid */
                        assetId: string;
                        /** @enum {string} */
                        state: "PENDING" | "VERIFIED" | "REJECTED" | "DELETED";
                        rejectionCode: string | null;
                        /** Format: uuid */
                        publicAssetId: string | null;
                    };
                };
            };
        };
    };
    previewAssetDerivative: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                wid: string;
                assetId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Owner-only public derivative preview */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/plain": string;
                    "image/png": string;
                };
            };
        };
    };
    replaceDocumentAssets: {
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
                    baseDraftVersion: number;
                    assetIds: string[];
                };
            };
        };
        responses: {
            /** @description Draft asset manifest replaced */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        commandId: string;
                        replayed: boolean;
                        /** Format: uuid */
                        documentId: string;
                        draftVersion: number;
                        assetIds: string[];
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
