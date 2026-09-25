import * as z from "zod";
import { EditorEnvelopeSchema } from "./editor.js";

const id = z.uuid();
const version = z.int().positive();
const command = z.strictObject({ commandId: id, replayed: z.boolean() });
export const DocumentKindSchema = z.enum(["WIKI", "ARTICLE", "NOTE"]);
export const CreateDocumentRequestSchema = z.strictObject({
  kind: DocumentKindSchema,
  title: z.string().trim().min(1).max(300),
});
export const CreateDocumentResponseSchema = command.extend({
  id,
  kind: DocumentKindSchema,
  draftVersion: version,
  latestRevision: z.int().nonnegative(),
});
export const SaveDocumentDraftRequestSchema = z.strictObject({
  baseVersion: version,
  saveSequence: z.int().nonnegative(),
  schemaVersion: z.literal(1),
  content: EditorEnvelopeSchema.shape.content,
});
export const SaveDocumentDraftResponseSchema = command.extend({
  id,
  draftVersion: version,
  saveSequence: z.int().nonnegative(),
  recheckBlockIds: z.array(id),
  removedBlockIds: z.array(id),
});
export const SealDocumentRequestSchema = z.strictObject({
  draftVersion: version,
});
export const RestoreDocumentRequestSchema = z.strictObject({
  baseRevision: z.int().nonnegative(),
  sourceRevision: version,
});
export const DocumentRevisionCommandResponseSchema = command.extend({
  id,
  revision: version,
  draftVersion: version,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  restoredFromRevision: version.nullable(),
});
export const ReplaceDocumentLinksRequestSchema = z.strictObject({
  baseLinkVersion: version,
  targetIds: z.array(id).max(100),
});
export const ReplaceDocumentLinksResponseSchema = command.extend({
  id,
  linkVersion: version,
  targetIds: z.array(id),
});
export const DocumentDetailSchema = z.strictObject({
  id,
  workspaceId: id,
  kind: DocumentKindSchema,
  title: z.string(),
  state: z.enum(["ACTIVE", "ARCHIVED"]),
  draftVersion: version,
  latestRevision: z.int().nonnegative(),
  linkVersion: version,
  content: EditorEnvelopeSchema,
  links: z.array(id),
  backlinks: z.array(id),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export const DocumentListSchema = z.strictObject({
  documents: z.array(
    DocumentDetailSchema.pick({
      id: true,
      workspaceId: true,
      kind: true,
      title: true,
      state: true,
      draftVersion: true,
      latestRevision: true,
      linkVersion: true,
      createdAt: true,
      updatedAt: true,
    }),
  ),
});
export const DocumentRevisionDetailSchema = z.strictObject({
  id,
  revision: version,
  title: z.string(),
  content: EditorEnvelopeSchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  draftVersion: version.nullable(),
  restoredFromRevision: version.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

const base = "/api/v1/workspaces/{wid}/documents";
const wid = {
  name: "wid",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const did = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const rid = {
  name: "revision",
  in: "path",
  required: true,
  schema: { type: "integer", minimum: 1 },
};
const key = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: { type: "string", minLength: 8, maxLength: 128 },
};
function body(schema: z.ZodType) {
  return {
    required: true,
    content: {
      "application/json": {
        schema: z.toJSONSchema(schema, { target: "openapi-3.0" }),
      },
    },
  };
}
function response(schema: z.ZodType, description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: z.toJSONSchema(schema, { target: "openapi-3.0" }),
      },
    },
  };
}
export const documentOpenApiPaths = {
  [base]: {
    get: {
      operationId: "listDocuments",
      parameters: [wid],
      responses: { "200": response(DocumentListSchema, "Scoped documents") },
    },
    post: {
      operationId: "createDocument",
      parameters: [wid, key],
      requestBody: body(CreateDocumentRequestSchema),
      responses: {
        "201": response(CreateDocumentResponseSchema, "Document created"),
      },
    },
  },
  [`${base}/{id}`]: {
    get: {
      operationId: "getDocument",
      parameters: [wid, did],
      responses: {
        "200": response(DocumentDetailSchema, "Document draft and links"),
      },
    },
  },
  [`${base}/{id}/draft`]: {
    put: {
      operationId: "saveDocumentDraft",
      parameters: [wid, did, key],
      requestBody: body(SaveDocumentDraftRequestSchema),
      responses: {
        "200": response(SaveDocumentDraftResponseSchema, "Draft saved"),
      },
    },
  },
  [`${base}/{id}/revisions`]: {
    post: {
      operationId: "sealDocument",
      parameters: [wid, did, key],
      requestBody: body(SealDocumentRequestSchema),
      responses: {
        "201": response(
          DocumentRevisionCommandResponseSchema,
          "Immutable revision created",
        ),
      },
    },
  },
  [`${base}/{id}/revisions/{revision}`]: {
    get: {
      operationId: "getDocumentRevision",
      parameters: [wid, did, rid],
      responses: {
        "200": response(DocumentRevisionDetailSchema, "Immutable revision"),
      },
    },
  },
  [`${base}/{id}/restore`]: {
    post: {
      operationId: "restoreDocumentRevision",
      parameters: [wid, did, key],
      requestBody: body(RestoreDocumentRequestSchema),
      responses: {
        "201": response(
          DocumentRevisionCommandResponseSchema,
          "Restored as a new revision",
        ),
      },
    },
  },
  [`${base}/{id}/links`]: {
    put: {
      operationId: "replaceWikiLinks",
      parameters: [wid, did, key],
      requestBody: body(ReplaceDocumentLinksRequestSchema),
      responses: {
        "200": response(
          ReplaceDocumentLinksResponseSchema,
          "Wiki links replaced",
        ),
      },
    },
  },
} as const;
