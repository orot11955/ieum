import * as z from "zod";

export const publicationPath = "/delivery/v1/publications/{id}" as const;

export const PublicPublicationSchema = z.strictObject({
  id: z.uuid(),
  publicRevision: z.int().positive(),
  title: z.string().min(1),
  slug: z.string().min(1),
  bodyFormat: z.literal("markdown"),
  body: z.string(),
  publishedAt: z.iso.datetime({ offset: true }),
});

export type PublicPublication = z.infer<typeof PublicPublicationSchema>;

export const deliveryOpenApi = {
  openapi: "3.0.3",
  info: { title: "IEUM Delivery contract example", version: "0.1.0" },
  paths: {
    [publicationPath]: {
      get: {
        operationId: "getPublicPublication",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Reviewed public revision",
            content: {
              "application/json": {
                schema: z.toJSONSchema(PublicPublicationSchema, {
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
