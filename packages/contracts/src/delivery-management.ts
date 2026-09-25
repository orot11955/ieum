import * as z from "zod";

const id = z.uuid();
const date = z.iso.datetime({ offset: true });
const credential = z.strictObject({
  id,
  channelId: id,
  name: z.string().min(1).max(100),
  state: z.enum(["ACTIVE", "REVOKED"]),
  expiresAt: date,
  revokedAt: date.nullable(),
  createdAt: date,
});
export const CreateDeliveryCredentialRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  expiresInDays: z.int().min(1).max(90),
});
export const RotateDeliveryCredentialRequestSchema = z.strictObject({
  expiresInDays: z.int().min(1).max(90),
});
export const DeliveryCredentialSchema = credential;
export const DeliveryCredentialIssuedSchema = credential.extend({
  token: z.string().startsWith("ieum_dlv_"),
});
export const DeliveryCredentialListSchema = z.strictObject({
  credentials: z.array(credential),
});

const base = "/api/v1/workspaces/{wid}/delivery-credentials";
const param = (name: string) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
});
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
export const deliveryManagementOpenApiPaths = {
  [base]: {
    get: {
      operationId: "listDeliveryCredentials",
      parameters: [param("wid")],
      responses: {
        "200": response(DeliveryCredentialListSchema, "Credential metadata"),
      },
    },
    post: {
      operationId: "createDeliveryCredential",
      parameters: [param("wid")],
      requestBody: body(CreateDeliveryCredentialRequestSchema),
      responses: {
        "201": response(
          DeliveryCredentialIssuedSchema,
          "One-time bearer token",
        ),
      },
    },
  },
  [`${base}/{id}/rotate`]: {
    post: {
      operationId: "rotateDeliveryCredential",
      parameters: [param("wid"), param("id")],
      requestBody: body(RotateDeliveryCredentialRequestSchema),
      responses: {
        "201": response(DeliveryCredentialIssuedSchema, "Replacement token"),
      },
    },
  },
  [`${base}/{id}/revoke`]: {
    post: {
      operationId: "revokeDeliveryCredential",
      parameters: [param("wid"), param("id")],
      responses: {
        "201": response(DeliveryCredentialSchema, "Revoked token"),
      },
    },
  },
} as const;
