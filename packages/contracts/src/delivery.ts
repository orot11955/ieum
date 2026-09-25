import * as z from "zod";

const int32 = z.int().positive().max(2_147_483_647);
const uuid = z.uuid();
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const asset = z.strictObject({
  id: uuid,
  mime: z.string(),
  byteSize: z.int().nonnegative(),
  url: z.string().startsWith("/delivery/v1/"),
});

export const publicationPath = "/delivery/v1/publications/{id}" as const;
export const publicationListPath = "/delivery/v1/publications" as const;
export const publicationSlugPath =
  "/delivery/v1/publications/by-slug/{slug}" as const;
export const publicationRevisionPath =
  "/delivery/v1/publications/{id}/revisions/{revision}" as const;
export const publicationAssetPath =
  "/delivery/v1/publications/{id}/assets/{assetId}" as const;

export const PublicPublicationSummarySchema = z.strictObject({
  id: uuid,
  publicRevision: int32,
  title: z.string().min(1),
  slug,
  publishedAt: z.iso.datetime({ offset: true }),
});
export const PublicPublicationSchema = PublicPublicationSummarySchema.extend({
  bodyFormat: z.literal("markdown"),
  body: z.string(),
  updatedAt: z.iso.datetime({ offset: true }),
  assets: z.array(asset),
});
export const PublicPublicationListSchema = z.strictObject({
  items: z.array(PublicPublicationSummarySchema),
  nextCursor: z.string().nullable(),
});
export type PublicPublication = z.infer<typeof PublicPublicationSchema>;

const header = {
  Authorization: { type: "http", scheme: "bearer" },
};
const path = (name: string, format?: string) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string", ...(format ? { format } : {}) },
});
const json = (schema: z.ZodType, description: string) => ({
  description,
  headers: { ETag: { schema: { type: "string" } } },
  content: {
    "application/json": {
      schema: z.toJSONSchema(schema, { target: "openapi-3.0" }),
    },
  },
});
const commonErrors = {
  "304": { description: "Current published state is unchanged" },
  "401": { description: "Missing, expired or revoked server credential" },
  "404": { description: "No currently published resource" },
};

export const deliveryOpenApi = {
  openapi: "3.0.3",
  info: { title: "IEUM Delivery API", version: "1.0.0" },
  servers: [{ url: "/" }],
  components: { securitySchemes: header },
  security: [{ Authorization: [] }],
  paths: {
    [publicationListPath]: {
      get: {
        operationId: "listPublications",
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
          },
          {
            name: "cursor",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": json(PublicPublicationListSchema, "Published summaries"),
          "400": { description: "Invalid page request or cursor" },
          "401": commonErrors["401"],
          "304": commonErrors["304"],
        },
      },
    },
    [publicationPath]: {
      get: {
        operationId: "getPublicPublication",
        parameters: [path("id", "uuid")],
        responses: {
          "200": json(PublicPublicationSchema, "Current public revision"),
          ...commonErrors,
        },
      },
    },
    [publicationSlugPath]: {
      get: {
        operationId: "getPublicPublicationBySlug",
        parameters: [path("slug")],
        responses: {
          "200": json(PublicPublicationSchema, "Current public revision"),
          ...commonErrors,
        },
      },
    },
    [publicationRevisionPath]: {
      get: {
        operationId: "getCurrentPublicRevision",
        parameters: [path("id", "uuid"), path("revision")],
        responses: {
          "200": json(PublicPublicationSchema, "Only the current revision"),
          ...commonErrors,
        },
      },
    },
    [publicationAssetPath]: {
      get: {
        operationId: "getCurrentPublicAsset",
        parameters: [path("id", "uuid"), path("assetId", "uuid")],
        responses: {
          "200": {
            description: "Verified derivative of the current public revision",
            headers: { ETag: { schema: { type: "string" } } },
            content: {
              "text/plain": { schema: { type: "string", format: "binary" } },
              "image/png": { schema: { type: "string", format: "binary" } },
            },
          },
          ...commonErrors,
        },
      },
    },
  },
} as const;
