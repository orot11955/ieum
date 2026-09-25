import * as z from "zod";

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const capture = z.strictObject({
  id: z.uuid(),
  revision: z.int().positive(),
  title: z.string().trim().min(1).max(300),
  originWorkspaceId: z.uuid(),
  originCaptureId: z.uuid(),
  path: z.string().regex(/^captures\/[0-9a-f-]{36}\.md$/),
  sha256,
});
export const TransferManifestV1Schema = z.strictObject({
  format: z.literal("ieum-personal"),
  version: z.literal(1),
  exportedAt: z.iso.datetime({ offset: true }),
  sourceWorkspaceId: z.uuid(),
  captures: z.array(capture).max(255),
});
export type TransferManifest = z.infer<typeof TransferManifestV1Schema>;

const portableTask = z.strictObject({
  id: z.uuid(),
  originWorkspaceId: z.uuid(),
  originId: z.uuid(),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10000),
  state: z.enum(["TODO", "IN_PROGRESS", "ON_HOLD", "DONE", "CANCELED"]),
  version: z.int().positive(),
  dueKind: z.enum(["NONE", "DATE", "INSTANT"]),
  dueDate: z.iso.date().nullable(),
  dueAt: z.iso.datetime({ offset: true }).nullable(),
  dueTimeZone: z.string().min(1).max(100).nullable(),
  contextId: z.uuid().nullable(),
  originUnitId: z.uuid().nullable(),
  originUnitRevision: z.int().positive().nullable(),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
  completionVersion: z.int().positive().nullable(),
});
const portableEvent = z.strictObject({
  id: z.uuid(),
  originWorkspaceId: z.uuid(),
  originId: z.uuid(),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10000),
  state: z.enum(["CONFIRMED", "CANCELED"]),
  version: z.int().positive(),
  scheduleKind: z.enum(["TIMED", "ALL_DAY"]),
  timeZone: z.string().min(1).max(100),
  startAt: z.iso.datetime({ offset: true }).nullable(),
  endAt: z.iso.datetime({ offset: true }).nullable(),
  startLocal: z.string().nullable(),
  endLocal: z.string().nullable(),
  startOffsetMinutes: z.int().nullable(),
  endOffsetMinutes: z.int().nullable(),
  startDate: z.iso.date().nullable(),
  endDateExclusive: z.iso.date().nullable(),
});
export const TransferManifestV2Schema = TransferManifestV1Schema.omit({
  version: true,
}).extend({
  version: z.literal(2),
  tasks: z.array(portableTask).max(4096),
  events: z.array(portableEvent).max(4096),
});
const portableContext = z.strictObject({
  id: z.uuid(),
  originWorkspaceId: z.uuid(),
  originId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(2000),
  scope: z.string().trim().min(1).max(2000),
  kind: z.enum(["TOPIC", "FLOW", "PROJECT", "COLLECTION"]),
  state: z.enum(["ACTIVE", "ARCHIVED", "SUPERSEDED"]),
  supersededById: z.uuid().nullable(),
  identityRevision: z.int().positive(),
  membershipRevision: z.int().positive(),
});
export const TransferManifestV3Schema = TransferManifestV2Schema.omit({
  version: true,
}).extend({
  version: z.literal(3),
  contexts: z.array(portableContext).max(4096),
});
const portableTaskTransition = z.strictObject({
  taskId: z.uuid(),
  version: z.int().min(2),
  fromState: portableTask.shape.state,
  toState: portableTask.shape.state,
  recordedAt: z.iso.datetime({ offset: true }),
});
export const TransferManifestV4Schema = TransferManifestV3Schema.omit({
  version: true,
}).extend({
  version: z.literal(4),
  taskTransitions: z.array(portableTaskTransition).max(16384),
});
export const TransferManifestSchema = z.discriminatedUnion("version", [
  TransferManifestV1Schema,
  TransferManifestV2Schema,
  TransferManifestV3Schema,
  TransferManifestV4Schema,
]);
export type TransferManifestV2 = z.infer<typeof TransferManifestV2Schema>;
export type TransferManifestV3 = z.infer<typeof TransferManifestV3Schema>;
export type TransferManifestV4 = z.infer<typeof TransferManifestV4Schema>;

export const TransferRunSchema = z.strictObject({
  id: z.uuid(),
  scope: z.enum([
    "CAPTURES_ONLY",
    "CAPTURES_TASKS_EVENTS",
    "CAPTURES_TASKS_EVENTS_CONTEXTS",
    "CAPTURES_TASKS_EVENTS_CONTEXTS_TASK_HISTORY",
  ]),
  kind: z.enum(["EXPORT", "IMPORT"]),
  state: z.enum(["READY", "STAGED", "APPLIED", "PARTIAL"]),
  bundleHash: sha256,
  byteSize: z.int().positive().max(33_554_432),
  expiresAt: z.iso.datetime({ offset: true }),
  createdAt: z.iso.datetime({ offset: true }),
  appliedAt: z.iso.datetime({ offset: true }).nullable(),
});
export const TransferPreviewRowSchema = z.strictObject({
  recordKind: z.enum(["capture", "task", "event", "context"]),
  sourceId: z.uuid(),
  sourceRevision: z.int().positive(),
  state: z.enum([
    "NEW",
    "DUPLICATE",
    "CONFLICT",
    "MISSING_REFERENCE",
    "IMPORTED",
    "SKIPPED",
    "FAILED",
  ]),
  targetId: z.uuid().nullable(),
});
export const TransferPreviewSchema = z.strictObject({
  run: TransferRunSchema,
  rows: z.array(TransferPreviewRowSchema),
  previewHash: sha256,
});
export const ApplyTransferRequestSchema = z.strictObject({
  previewHash: sha256,
});
export const ApplyTransferResponseSchema = z.strictObject({
  state: z.enum(["APPLIED", "PARTIAL"]),
  counts: z.record(z.string(), z.int().nonnegative()),
});

const wid = {
  name: "wid",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const id = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const error = { description: "Problem response" };
export const dataTransferOpenApiPaths = {
  "/api/v1/workspaces/{wid}/data-transfer/exports": {
    post: {
      operationId: "createPortableExport",
      parameters: [wid],
      responses: {
        "201": {
          description:
            "Capture, Context, Task and Event current-state plus Task transition export run; expires in 24 hours",
        },
        "403": error,
        "503": error,
      },
    },
  },
  "/api/v1/workspaces/{wid}/data-transfer/exports/{id}/download": {
    get: {
      operationId: "downloadPortableExport",
      parameters: [wid, id],
      responses: {
        "200": { description: "Private gzipped tar bundle" },
        "403": error,
        "404": error,
        "410": error,
      },
    },
  },
  "/api/v1/workspaces/{wid}/data-transfer/imports": {
    post: {
      operationId: "stagePortableImport",
      parameters: [wid],
      requestBody: {
        required: true,
        content: {
          "application/vnd.ieum.bundle+gzip": {
            schema: { type: "string", format: "binary" },
          },
        },
      },
      responses: {
        "201": { description: "Validated staged import" },
        "422": error,
      },
    },
  },
  "/api/v1/workspaces/{wid}/data-transfer/imports/{id}/preview": {
    get: {
      operationId: "previewPortableImport",
      parameters: [wid, id],
      responses: {
        "200": { description: "Current duplicate/conflict preview" },
        "404": error,
        "410": error,
      },
    },
  },
  "/api/v1/workspaces/{wid}/data-transfer/imports/{id}/apply": {
    post: {
      operationId: "applyPortableImport",
      parameters: [wid, id],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["previewHash"],
              properties: {
                previewHash: { type: "string", pattern: "^[0-9a-f]{64}$" },
              },
            },
          },
        },
      },
      responses: {
        "201": { description: "Row results; partial failures retained" },
        "409": error,
        "410": error,
      },
    },
  },
} as const;
