import * as z from "zod";
import { EventScheduleInputSchema } from "./calendar.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const source = z.strictObject({
  workspaceId: z.uuid(),
  captureId: z.uuid(),
  revision: z.int().positive(),
  originKey: z.string().min(1),
  sourceSpan: z.strictObject({
    start: z.int().nonnegative(),
    end: z.int().positive(),
    encoding: z.literal("utf16"),
  }),
  sourceText: z.string().min(1),
});
const temporal = z.strictObject({
  expression: z.string().min(1),
  basisEpochMs: z.number().int(),
  timeZone: z.string().nullable(),
  proposedEpochMs: z.number().int().nullable(),
  ambiguity: z.array(z.string()),
});
export const ExtractProposalSchema = z.strictObject({
  proposalId: hash,
  decisionKey: hash,
  origin: source,
  targetKind: z.enum(["task", "event", "thought_unit"]),
  suggestedTitle: z.string().min(1).max(300),
  suggestedBody: z.string().nullable(),
  temporal: temporal.nullable(),
  unresolvedFields: z.array(
    z.enum(["title", "body", "time_zone", "start_time", "ambiguity"]),
  ),
  status: z.literal("candidate"),
});
export const GenerateExtractionResponseSchema = z.strictObject({
  captureId: z.uuid(),
  captureRevision: z.int().positive(),
  candidateIds: z.array(hash),
  commandId: z.uuid(),
  replayed: z.boolean(),
});
export const ExtractionPreviewSchema = z.strictObject({
  proposalId: hash,
  state: z.enum(["CANDIDATE", "ACCEPTED", "REJECTED"]),
  targetId: z.uuid().nullable(),
  proposal: ExtractProposalSchema,
  sourceStale: z.boolean(),
  priorTargets: z.array(
    z.strictObject({
      kind: z.enum(["task", "event", "thought_unit"]),
      id: z.uuid(),
      state: z.string().nullable(),
      match: z.enum(["EXACT_SOURCE", "SIMILAR_TITLE"]),
    }),
  ),
});
export const ExtractionAcceptRequestSchema = z.strictObject({
  expectedCaptureRevision: z.int().positive(),
  title: z.string().min(1).max(300),
  body: z.string().max(10000).nullable().optional(),
  schedule: EventScheduleInputSchema.optional(),
});
export const ExtractionRejectRequestSchema = z.strictObject({
  expectedCaptureRevision: z.int().positive(),
});
export const ExtractionDecisionResponseSchema = z.discriminatedUnion("state", [
  z.strictObject({
    proposalId: hash,
    state: z.literal("ACCEPTED"),
    targetKind: z.enum(["task", "event", "thought_unit"]),
    targetId: z.uuid(),
    sourceUnitId: z.uuid(),
    commandId: z.uuid(),
    replayed: z.boolean(),
  }),
  z.strictObject({
    proposalId: hash,
    state: z.literal("REJECTED"),
    targetId: z.null(),
    commandId: z.uuid(),
    replayed: z.boolean(),
  }),
]);

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
function request(schema: z.ZodType) {
  return {
    required: true,
    content: {
      "application/json": {
        schema: z.toJSONSchema(schema, { target: "openapi-3.0" }),
      },
    },
  };
}
const base = "/api/v1/workspaces/{wid}/extractions";
export const extractionOpenApiPaths = {
  ["/api/v1/workspaces/{wid}/captures/{id}/extractions"]: {
    post: {
      operationId: "generateExtractionCandidates",
      parameters: [wid, id, key],
      responses: {
        "201": response(
          GenerateExtractionResponseSchema,
          "Validated local parser candidates",
        ),
      },
    },
  },
  [`${base}/{id}`]: {
    get: {
      operationId: "getExtractionCandidate",
      parameters: [wid, id],
      responses: {
        "200": response(
          ExtractionPreviewSchema,
          "Candidate and prior target warnings",
        ),
      },
    },
  },
  [`${base}/{id}/accept`]: {
    post: {
      operationId: "acceptExtractionCandidate",
      parameters: [wid, id, key],
      requestBody: request(ExtractionAcceptRequestSchema),
      responses: {
        "200": response(
          ExtractionDecisionResponseSchema,
          "Confirmed source-backed command",
        ),
      },
    },
  },
  [`${base}/{id}/reject`]: {
    post: {
      operationId: "rejectExtractionCandidate",
      parameters: [wid, id, key],
      requestBody: request(ExtractionRejectRequestSchema),
      responses: {
        "200": response(ExtractionDecisionResponseSchema, "Rejected candidate"),
      },
    },
  },
};
