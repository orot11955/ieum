import * as z from "zod";

export const JudgementRequestSchema = z.strictObject({
  unitId: z.uuid(),
  unitRevision: z.number().int().positive(),
});
export const JudgementAcceptedSchema = z.strictObject({
  requestId: z.uuid(),
  state: z.literal("QUEUED"),
  commandId: z.uuid(),
  replayed: z.boolean(),
});
export const JudgementStatusSchema = z.strictObject({
  requestId: z.uuid(),
  state: z.enum(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELED"]),
  retryCount: z.number().int().nonnegative(),
  inputHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  profileState: z.enum(["FRESH", "LAGGING"]).nullable(),
  eligibleContextCount: z.number().int().nonnegative().nullable(),
  returnedContextCount: z.number().int().nonnegative().nullable(),
  truncated: z.boolean().nullable(),
});

const base = "/api/v1/workspaces/{wid}/judgements";
const wid = {
  name: "wid",
  in: "path",
  required: true,
  schema: { type: "string" },
};
const id = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
};
const key = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: { type: "string", minLength: 8, maxLength: 128 },
};
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
export const judgementOpenApiPaths = {
  [base]: {
    post: {
      operationId: "requestJudgement",
      parameters: [wid, key],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: z.toJSONSchema(JudgementRequestSchema, {
              target: "openapi-3.0",
            }),
          },
        },
      },
      responses: {
        "202": response(JudgementAcceptedSchema, "Judgement queued"),
      },
    },
  },
  [`${base}/{id}`]: {
    get: {
      operationId: "getJudgementStatus",
      parameters: [wid, id],
      responses: {
        "200": response(JudgementStatusSchema, "Scoped judgement status"),
      },
    },
  },
};
