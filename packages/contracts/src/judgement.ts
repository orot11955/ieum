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

const ProposalRoleSchema = z.enum(["PRIMARY", "SECONDARY", "BACKGROUND"]);
const ProposalStateSchema = z.enum([
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "DISMISSED",
  "EXPIRED",
  "SUPERSEDED",
]);
const ProposalMemberSchema = z.strictObject({
  contextId: z.uuid(),
  role: ProposalRoleSchema,
});
const ProposalOperationsSchema = z.strictObject({
  unitId: z.uuid(),
  unitRevision: z.int().positive(),
  source: z.strictObject({
    captureId: z.uuid(),
    captureRevision: z.int().positive(),
    currentCaptureRevision: z.int().positive(),
    captureVersion: z.int().positive(),
  }),
  baseMembershipVersion: z.int().positive(),
  before: z.array(ProposalMemberSchema),
  after: z.array(ProposalMemberSchema),
  contexts: z.array(
    z.strictObject({
      contextId: z.uuid(),
      identityRevision: z.int().positive(),
      membershipRevision: z.int().positive(),
    }),
  ),
});
export const JudgementCandidatesSchema = z.strictObject({
  requestId: z.uuid(),
  unitId: z.uuid(),
  unitRevision: z.int().positive(),
  candidates: z.array(
    z.strictObject({
      contextId: z.uuid(),
      identityRevision: z.int().positive(),
      membershipRevision: z.int().positive(),
      rank: z.int().positive(),
      rankScore: z.number().min(0).max(1).nullable(),
      decision: z.enum(["candidate", "abstain"]),
      reasons: z.array(z.string()),
    }),
  ),
  truncated: z.boolean(),
});
export const CreateProposalRequestSchema = z.strictObject({
  unitId: z.uuid(),
  unitRevision: z.int().positive(),
  contextId: z.uuid(),
  role: ProposalRoleSchema,
});
export const CreateProposalResponseSchema = z.strictObject({
  proposalId: z.uuid(),
  state: z.literal("PENDING"),
  operationsHash: z.string().regex(/^[a-f0-9]{64}$/),
  commandId: z.uuid(),
  replayed: z.boolean(),
});
export const ProposalPreviewSchema = z.strictObject({
  proposalId: z.uuid(),
  runRequestId: z.uuid(),
  unitId: z.uuid(),
  unitRevision: z.int().positive(),
  contextId: z.uuid(),
  role: ProposalRoleSchema,
  operations: ProposalOperationsSchema,
  operationsHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceStale: z.boolean(),
  state: ProposalStateSchema,
  expiresAt: z.iso.datetime({ offset: true }),
});
export const ProposalExposureSchema = z.strictObject({
  proposalId: z.uuid(),
  exposureId: z.uuid(),
  state: z.literal("PENDING"),
  commandId: z.uuid(),
  replayed: z.boolean(),
});
export const ProposalDecisionRequestSchema = z.strictObject({
  exposureId: z.uuid(),
  operationsHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const ProposalDecisionResponseSchema = z.discriminatedUnion("state", [
  z.strictObject({
    proposalId: z.uuid(),
    state: z.literal("ACCEPTED"),
    unitId: z.uuid(),
    membershipVersion: z.int().positive(),
    memberships: z.array(ProposalMemberSchema),
    commandId: z.uuid(),
    replayed: z.boolean(),
  }),
  z.strictObject({
    proposalId: z.uuid(),
    state: z.literal("REJECTED"),
    commandId: z.uuid(),
    replayed: z.boolean(),
  }),
  z.strictObject({
    proposalId: z.uuid(),
    state: z.literal("DISMISSED"),
    commandId: z.uuid(),
    replayed: z.boolean(),
  }),
]);

const base = "/api/v1/workspaces/{wid}/judgements";
const proposalBase = "/api/v1/workspaces/{wid}/proposals";
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
  [`${base}/{id}/candidates`]: {
    get: {
      operationId: "getJudgementCandidates",
      parameters: [wid, id],
      responses: {
        "200": response(
          JudgementCandidatesSchema,
          "Read-only observed candidates; rankScore is not a probability",
        ),
      },
    },
  },
  [`${base}/{id}/proposals`]: {
    post: {
      operationId: "createJudgementProposal",
      parameters: [wid, id, key],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: z.toJSONSchema(CreateProposalRequestSchema, {
              target: "openapi-3.0",
            }),
          },
        },
      },
      responses: {
        "201": response(CreateProposalResponseSchema, "User-selected proposal"),
      },
    },
  },
  [`${proposalBase}/{id}`]: {
    get: {
      operationId: "getJudgementProposal",
      parameters: [wid, id],
      responses: {
        "200": response(ProposalPreviewSchema, "Exact membership preview"),
      },
    },
  },
  [`${proposalBase}/{id}/expose`]: {
    post: {
      operationId: "exposeJudgementProposal",
      parameters: [wid, id, key],
      responses: {
        "200": response(ProposalExposureSchema, "Client-reported exposure"),
      },
    },
  },
  ...Object.fromEntries(
    ["accept", "reject", "dismiss"].map((action) => [
      `${proposalBase}/{id}/${action}`,
      {
        post: {
          operationId: `${action}JudgementProposal`,
          parameters: [wid, id, key],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: z.toJSONSchema(ProposalDecisionRequestSchema, {
                  target: "openapi-3.0",
                }),
              },
            },
          },
          responses: {
            "200": response(
              ProposalDecisionResponseSchema,
              "Recorded proposal decision",
            ),
          },
        },
      },
    ]),
  ),
};
