import * as z from "zod";

const id = z.uuid();
const positive = z.int().positive();
const command = z.strictObject({ commandId: id, replayed: z.boolean() });
export const AssetDeclaredMimeSchema = z.enum([
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
export const CreateAssetRequestSchema = z.strictObject({
  fileName: z.string().trim().min(1).max(160),
  declaredMime: AssetDeclaredMimeSchema,
  expectedSize: z
    .int()
    .min(1)
    .max(20 * 1024 * 1024),
});
export type CreateAssetRequest = z.infer<typeof CreateAssetRequestSchema>;
export const AssetStateSchema = z.enum([
  "PENDING",
  "VERIFIED",
  "REJECTED",
  "DELETED",
]);
export const AssetDetailSchema = z.strictObject({
  id,
  workspaceId: id,
  fileName: z.string(),
  declaredMime: AssetDeclaredMimeSchema,
  expectedSize: positive,
  state: AssetStateSchema,
  rejectionCode: z.string().nullable(),
  detectedMime: z.string().nullable(),
  byteSize: z.int().positive().nullable(),
  contentHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  publicAssetId: id.nullable(),
  derivativeMime: z.string().nullable(),
  derivativeHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  usedInDocumentIds: z.array(id),
  createdAt: z.iso.datetime({ offset: true }),
});
export const AssetListSchema = z.strictObject({
  assets: z.array(AssetDetailSchema),
});
export const CreateAssetResponseSchema = command.extend({
  assetId: id,
  state: z.literal("PENDING"),
});
export const CompleteAssetResponseSchema = command.extend({
  assetId: id,
  state: AssetStateSchema,
  rejectionCode: z.string().nullable(),
  publicAssetId: id.nullable(),
});
export const DeleteAssetResponseSchema = command.extend({
  assetId: id,
  state: z.literal("DELETED"),
});
export const ReplaceDocumentAssetsRequestSchema = z.strictObject({
  baseDraftVersion: positive,
  assetIds: z
    .array(id)
    .max(20)
    .refine((value) => new Set(value).size === value.length),
});
export const ReplaceDocumentAssetsResponseSchema = command.extend({
  documentId: id,
  draftVersion: positive,
  assetIds: z.array(id),
});

const parameter = (name: string) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
});
const key = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: { type: "string", minLength: 8, maxLength: 128 },
};
const body = (schema: z.ZodType) => ({
  required: true,
  content: {
    "application/json": {
      schema: z.toJSONSchema(schema, { target: "openapi-3.0" }),
    },
  },
});
const response = (schema: z.ZodType, description: string) => ({
  description,
  content: {
    "application/json": {
      schema: z.toJSONSchema(schema, { target: "openapi-3.0" }),
    },
  },
});
const binary = { schema: { type: "string", format: "binary" } };
const root = "/api/v1/workspaces/{wid}/assets";
export const assetOpenApiPaths = {
  [root]: {
    post: {
      operationId: "createAsset",
      parameters: [parameter("wid"), key],
      requestBody: body(CreateAssetRequestSchema),
      responses: {
        "201": response(CreateAssetResponseSchema, "Pending asset"),
      },
    },
    get: {
      operationId: "listAssets",
      parameters: [parameter("wid")],
      responses: { "200": response(AssetListSchema, "Private assets") },
    },
  },
  [`${root}/{assetId}`]: {
    get: {
      operationId: "getAsset",
      parameters: [parameter("wid"), parameter("assetId")],
      responses: {
        "200": response(AssetDetailSchema, "Private asset metadata"),
      },
    },
    delete: {
      operationId: "deleteAsset",
      parameters: [parameter("wid"), parameter("assetId"), key],
      responses: {
        "200": response(
          DeleteAssetResponseSchema,
          "Unused asset removed from use",
        ),
      },
    },
  },
  [`${root}/{assetId}/content`]: {
    put: {
      operationId: "completeAsset",
      parameters: [parameter("wid"), parameter("assetId"), key],
      requestBody: {
        required: true,
        content: {
          "application/octet-stream": {
            schema: { type: "string", format: "binary" },
          },
        },
      },
      responses: {
        "200": response(
          CompleteAssetResponseSchema,
          "Verified or rejected asset",
        ),
      },
    },
    get: {
      operationId: "downloadPrivateAsset",
      parameters: [parameter("wid"), parameter("assetId")],
      responses: {
        "200": {
          description: "Owner-only original bytes",
          content: {
            "text/plain": binary,
            "text/markdown": binary,
            "image/png": binary,
            "image/jpeg": binary,
            "image/webp": binary,
          },
        },
      },
    },
  },
  [`${root}/{assetId}/preview`]: {
    get: {
      operationId: "previewAssetDerivative",
      parameters: [parameter("wid"), parameter("assetId")],
      responses: {
        "200": {
          description: "Owner-only public derivative preview",
          content: {
            "text/plain": binary,
            "image/png": binary,
          },
        },
      },
    },
  },
  ["/api/v1/workspaces/{wid}/documents/{id}/assets"]: {
    put: {
      operationId: "replaceDocumentAssets",
      parameters: [parameter("wid"), parameter("id"), key],
      requestBody: body(ReplaceDocumentAssetsRequestSchema),
      responses: {
        "200": response(
          ReplaceDocumentAssetsResponseSchema,
          "Draft asset manifest replaced",
        ),
      },
    },
  },
} as const;
