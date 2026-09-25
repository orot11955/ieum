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
export const TransferManifestSchema = z.strictObject({
  format: z.literal("ieum-personal"),
  version: z.literal(1),
  exportedAt: z.iso.datetime({ offset: true }),
  sourceWorkspaceId: z.uuid(),
  captures: z.array(capture).max(255),
});
export type TransferManifest = z.infer<typeof TransferManifestSchema>;

export const TransferRunSchema = z.strictObject({
  id: z.uuid(),
  scope: z.literal("CAPTURES_ONLY"),
  kind: z.enum(["EXPORT", "IMPORT"]),
  state: z.enum(["READY", "STAGED", "APPLIED", "PARTIAL"]),
  bundleHash: sha256,
  byteSize: z.int().positive().max(33_554_432),
  expiresAt: z.iso.datetime({ offset: true }),
  createdAt: z.iso.datetime({ offset: true }),
  appliedAt: z.iso.datetime({ offset: true }).nullable(),
});
export const TransferPreviewRowSchema = z.strictObject({
  sourceId: z.uuid(),
  sourceRevision: z.int().positive(),
  state: z.enum([
    "NEW",
    "DUPLICATE",
    "CONFLICT",
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
      operationId: "createCaptureExport",
      parameters: [wid],
      responses: {
        "201": { description: "Capture-only export run; expires in 24 hours" },
        "403": error,
        "503": error,
      },
    },
  },
  "/api/v1/workspaces/{wid}/data-transfer/exports/{id}/download": {
    get: {
      operationId: "downloadCaptureExport",
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
      operationId: "stageCaptureImport",
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
      operationId: "previewCaptureImport",
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
      operationId: "applyCaptureImport",
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
