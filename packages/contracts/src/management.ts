import * as z from "zod";
import type { CoreCaptureSnapshot, Utf16Span } from "@ieum/core";
import { identityOpenApiPaths } from "./identity.js";
import { knowledgeOpenApiPaths } from "./knowledge.js";

export const createCapturePath = "/api/v1/workspaces/{wid}/captures" as const;
export const capturePath = "/api/v1/workspaces/{wid}/captures/{id}" as const;
export const captureRevisionPath =
  "/api/v1/workspaces/{wid}/captures/{id}/revisions/{revision}" as const;
export const reviseCapturePath =
  "/api/v1/workspaces/{wid}/captures/{id}/revisions" as const;
export const splitCapturePath =
  "/api/v1/workspaces/{wid}/captures/{id}/units/split" as const;
export const archiveCapturePath =
  "/api/v1/workspaces/{wid}/captures/{id}/archive" as const;

export const CaptureSpanSchema = z.strictObject({
  start: z.int().nonnegative(),
  end: z.int().positive(),
  encoding: z.literal("utf16"),
});

export const CaptureSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("manual"),
    key: z.string().min(1).max(300).optional(),
  }),
  z.strictObject({
    kind: z.literal("import"),
    key: z.string().min(1).max(300),
  }),
]);

export const CreateCaptureRequestSchema = z.strictObject({
  title: z.string().min(1).max(300),
  rawBody: z.string().min(1).max(200_000),
  source: CaptureSourceSchema.optional(),
});

export const CreateCaptureResponseSchema = z.strictObject({
  id: z.uuid(),
  revision: z.int().positive(),
  version: z.int().positive(),
  unitId: z.uuid(),
  commandId: z.uuid(),
  replayed: z.boolean(),
});

export const ReviseCaptureRequestSchema = z.strictObject({
  baseVersion: z.int().positive(),
  title: z.string().min(1).max(300),
  rawBody: z.string().min(1).max(200_000),
});
export const ReviseCaptureResponseSchema = z.strictObject({
  id: z.uuid(),
  revision: z.int().positive(),
  version: z.int().positive(),
  unitSetVersion: z.int().positive(),
  unitId: z.uuid(),
  commandId: z.uuid(),
  replayed: z.boolean(),
});
export const SplitCaptureRequestSchema = z.strictObject({
  baseVersion: z.int().positive(),
  captureRevision: z.int().positive(),
  spans: z.array(CaptureSpanSchema).min(2).max(100),
});
export const SplitCaptureResponseSchema = z.strictObject({
  id: z.uuid(),
  revision: z.int().positive(),
  version: z.int().positive(),
  unitSetVersion: z.int().positive(),
  unitIds: z.array(z.uuid()).min(2),
  commandId: z.uuid(),
  replayed: z.boolean(),
});
export const ArchiveCaptureRequestSchema = z.strictObject({
  baseVersion: z.int().positive(),
});
export const ArchiveCaptureResponseSchema = z.strictObject({
  id: z.uuid(),
  state: z.literal("ARCHIVED"),
  version: z.int().positive(),
  commandId: z.uuid(),
  replayed: z.boolean(),
});
export const CaptureUnitSchema = z.strictObject({
  id: z.uuid(),
  revision: z.int().positive(),
  captureRevision: z.int().positive(),
  originKey: z.string(),
  state: z.enum(["ACTIVE", "SUPERSEDED"]),
  sourceSpan: CaptureSpanSchema,
  content: z.strictObject({ kind: z.literal("quote"), text: z.string() }),
  recordedAt: z.iso.datetime({ offset: true }),
});
export const CaptureDetailSchema = z.strictObject({
  id: z.uuid(),
  workspaceId: z.uuid(),
  title: z.string(),
  source: z.strictObject({
    kind: z.enum(["manual", "import"]),
    key: z.string().nullable(),
    originKey: z.string(),
  }),
  state: z.enum(["ACTIVE", "ARCHIVED"]),
  version: z.int().positive(),
  currentRevision: z.int().positive(),
  unitSetVersion: z.int().positive(),
  revision: z.int().positive(),
  rawBody: z.string(),
  recordedAt: z.iso.datetime({ offset: true }),
  units: z.array(CaptureUnitSchema),
});
export const CaptureListSchema = z.strictObject({
  captures: z.array(
    z.strictObject({
      id: z.uuid(),
      title: z.string(),
      state: z.enum(["ACTIVE", "ARCHIVED"]),
      version: z.int().positive(),
      currentRevision: z.int().positive(),
      updatedAt: z.iso.datetime({ offset: true }),
    }),
  ),
  nextCursor: z.string().nullable(),
});

export type CreateCaptureRequest = z.infer<typeof CreateCaptureRequestSchema>;
export type CreateCaptureResponse = z.infer<typeof CreateCaptureResponseSchema>;

export type CaptureActorContext = Readonly<{
  accountId: string;
  workspaceId: string;
  idempotencyKey: string;
}>;

export type CreateCaptureCommand = Readonly<
  CaptureActorContext & CreateCaptureRequest
>;

export type CapturePersistenceInput = Readonly<{
  workspaceId: string;
  createdByAccountId: string;
  title: string;
  rawBody: string;
}>;

export function toCreateCaptureCommand(
  request: CreateCaptureRequest,
  context: CaptureActorContext,
): CreateCaptureCommand {
  return { ...CreateCaptureRequestSchema.parse(request), ...context };
}

export function toCapturePersistenceInput(
  command: CreateCaptureCommand,
): CapturePersistenceInput {
  return {
    workspaceId: command.workspaceId,
    createdByAccountId: command.accountId,
    title: command.title,
    rawBody: command.rawBody,
  };
}

export function toCoreCaptureSnapshot(
  record: Readonly<{ id: string; revision: number; rawBody: string }>,
  span: Utf16Span,
): CoreCaptureSnapshot {
  return {
    captureId: record.id,
    revision: record.revision,
    rawBody: record.rawBody,
    span,
  };
}

export const managementOpenApi = {
  openapi: "3.0.3",
  info: { title: "IEUM management contract example", version: "0.1.0" },
  paths: {
    ...identityOpenApiPaths,
    ...knowledgeOpenApiPaths,
    [createCapturePath]: {
      post: {
        operationId: "createCapture",
        parameters: [
          {
            name: "wid",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "Idempotency-Key",
            in: "header",
            required: true,
            schema: { type: "string", minLength: 8, maxLength: 128 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: z.toJSONSchema(CreateCaptureRequestSchema, {
                target: "openapi-3.0",
              }),
            },
          },
        },
        responses: {
          "201": {
            description: "Capture created",
            content: {
              "application/json": {
                schema: z.toJSONSchema(CreateCaptureResponseSchema, {
                  target: "openapi-3.0",
                }),
              },
            },
          },
        },
      },
      get: {
        operationId: "listCaptures",
        parameters: [
          {
            name: "wid",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "includeArchived",
            in: "query",
            required: false,
            schema: { type: "boolean" },
          },
          {
            name: "cursor",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Capture list",
            content: {
              "application/json": {
                schema: z.toJSONSchema(CaptureListSchema, {
                  target: "openapi-3.0",
                }),
              },
            },
          },
        },
      },
    },
    [capturePath]: {
      get: {
        operationId: "getCapture",
        parameters: [
          {
            name: "wid",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Current capture and units",
            content: {
              "application/json": {
                schema: z.toJSONSchema(CaptureDetailSchema, {
                  target: "openapi-3.0",
                }),
              },
            },
          },
        },
      },
    },
    [captureRevisionPath]: {
      get: {
        operationId: "getCaptureRevision",
        parameters: [
          {
            name: "wid",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "revision",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        responses: {
          "200": {
            description: "Immutable capture revision and units",
            content: {
              "application/json": {
                schema: z.toJSONSchema(CaptureDetailSchema, {
                  target: "openapi-3.0",
                }),
              },
            },
          },
        },
      },
    },
    [reviseCapturePath]: {
      post: {
        operationId: "reviseCapture",
        parameters: [
          {
            name: "wid",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "Idempotency-Key",
            in: "header",
            required: true,
            schema: { type: "string", minLength: 8, maxLength: 128 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: z.toJSONSchema(ReviseCaptureRequestSchema, {
                target: "openapi-3.0",
              }),
            },
          },
        },
        responses: {
          "200": {
            description: "Capture revised",
            content: {
              "application/json": {
                schema: z.toJSONSchema(ReviseCaptureResponseSchema, {
                  target: "openapi-3.0",
                }),
              },
            },
          },
        },
      },
    },
    [splitCapturePath]: {
      post: {
        operationId: "splitCaptureUnits",
        parameters: [
          {
            name: "wid",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "Idempotency-Key",
            in: "header",
            required: true,
            schema: { type: "string", minLength: 8, maxLength: 128 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: z.toJSONSchema(SplitCaptureRequestSchema, {
                target: "openapi-3.0",
              }),
            },
          },
        },
        responses: {
          "200": {
            description: "Units split",
            content: {
              "application/json": {
                schema: z.toJSONSchema(SplitCaptureResponseSchema, {
                  target: "openapi-3.0",
                }),
              },
            },
          },
        },
      },
    },
    [archiveCapturePath]: {
      post: {
        operationId: "archiveCapture",
        parameters: [
          {
            name: "wid",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "Idempotency-Key",
            in: "header",
            required: true,
            schema: { type: "string", minLength: 8, maxLength: 128 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: z.toJSONSchema(ArchiveCaptureRequestSchema, {
                target: "openapi-3.0",
              }),
            },
          },
        },
        responses: {
          "200": {
            description: "Capture archived",
            content: {
              "application/json": {
                schema: z.toJSONSchema(ArchiveCaptureResponseSchema, {
                  target: "openapi-3.0",
                }),
              },
            },
          },
        },
      },
    },
  },
} as const;
