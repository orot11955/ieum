import * as z from "zod";

const id = z.uuid();
const positive = z.int().positive().max(2_147_483_647);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .min(2)
  .max(100);
const command = z.strictObject({ commandId: id, replayed: z.boolean() });
export const PublicationStateSchema = z.enum(["PUBLISHED", "WITHDRAWN"]);
export const PublicPreviewSchema = z.strictObject({
  documentId: id,
  documentRevision: positive,
  title: z.string(),
  bodyFormat: z.literal("markdown"),
  body: z.string(),
  publicAssetIds: z.array(id),
  sourceCount: z.int().nonnegative(),
  manifestHash: hash,
  bodyHash: hash,
  sourceHash: hash,
  assetHash: hash,
  policyHash: hash,
  policyVersion: z.literal("be19-public-v1"),
});
export const ReviewDocumentRequestSchema = z.strictObject({
  manifestHash: hash,
  decision: z.enum(["READY", "CHANGES_REQUIRED"]),
});
export const ReviewDocumentResponseSchema = command.extend({
  reviewId: id,
  documentId: id,
  documentRevision: positive,
  decision: z.enum(["READY", "CHANGES_REQUIRED"]),
  manifestHash: hash,
});
export const PublishDocumentRequestSchema = z.strictObject({
  documentId: id,
  documentRevision: positive,
  reviewId: id,
  manifestHash: hash,
  slug,
});
export const RevisePublicationRequestSchema = z.strictObject({
  basePublicRevision: positive,
  baseAccessEpoch: positive,
  documentRevision: positive,
  reviewId: id,
  manifestHash: hash,
  slug,
});
export const WithdrawPublicationRequestSchema = z.strictObject({
  basePublicRevision: positive,
});
export const PublicationCommandResponseSchema = command.extend({
  publicationId: id,
  publicRevision: positive,
  state: PublicationStateSchema,
  slug,
  accessEpoch: positive,
});
export const PublicationDetailSchema = z.strictObject({
  publicationId: id,
  documentId: id,
  channelId: id,
  publicRevision: positive,
  state: PublicationStateSchema,
  slug,
  accessEpoch: positive,
  title: z.string(),
  body: z.string(),
  manifestHash: hash,
  publicAssetIds: z.array(id),
  publishedAt: z.iso.datetime({ offset: true }),
});
export const PublicationListSchema = z.strictObject({
  publications: z.array(PublicationDetailSchema),
});

const parameter = (name: string) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string", format: name === "revision" ? "int32" : "uuid" },
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
const base = "/api/v1/workspaces/{wid}";
export const publishingOpenApiPaths = {
  [`${base}/documents/{id}/revisions/{revision}/public-preview`]: {
    get: {
      operationId: "previewDocumentPublication",
      parameters: [parameter("wid"), parameter("id"), parameter("revision")],
      responses: {
        "200": response(PublicPreviewSchema, "Public projection preview"),
      },
    },
  },
  [`${base}/documents/{id}/revisions/{revision}/reviews`]: {
    post: {
      operationId: "reviewDocumentPublication",
      parameters: [
        parameter("wid"),
        parameter("id"),
        parameter("revision"),
        key,
      ],
      requestBody: body(ReviewDocumentRequestSchema),
      responses: {
        "201": response(ReviewDocumentResponseSchema, "Manifest-bound review"),
      },
    },
  },
  [`${base}/publications`]: {
    post: {
      operationId: "publishDocument",
      parameters: [parameter("wid"), key],
      requestBody: body(PublishDocumentRequestSchema),
      responses: {
        "201": response(PublicationCommandResponseSchema, "Published snapshot"),
      },
    },
    get: {
      operationId: "listPublications",
      parameters: [parameter("wid")],
      responses: {
        "200": response(
          PublicationListSchema,
          "Private publication management list",
        ),
      },
    },
  },
  [`${base}/publications/{id}`]: {
    get: {
      operationId: "getPublication",
      parameters: [parameter("wid"), parameter("id")],
      responses: {
        "200": response(
          PublicationDetailSchema,
          "Private publication management detail",
        ),
      },
    },
  },
  [`${base}/publications/{id}/revisions`]: {
    post: {
      operationId: "revisePublication",
      parameters: [parameter("wid"), parameter("id"), key],
      requestBody: body(RevisePublicationRequestSchema),
      responses: {
        "201": response(
          PublicationCommandResponseSchema,
          "New public revision",
        ),
      },
    },
  },
  [`${base}/publications/{id}/withdraw`]: {
    post: {
      operationId: "withdrawPublication",
      parameters: [parameter("wid"), parameter("id"), key],
      requestBody: body(WithdrawPublicationRequestSchema),
      responses: {
        "201": response(
          PublicationCommandResponseSchema,
          "Withdrawn public projection",
        ),
      },
    },
  },
} as const;
