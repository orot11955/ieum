import * as z from "zod";

const id = z.uuid();
const version = z.int().positive();
const sourceIndex = z.int().nonnegative();
const command = z.strictObject({ commandId: id, replayed: z.boolean() });
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !value.includes("\u0000"));

export const GenerationModeSchema = z.enum(["outline", "refine", "draft"]);
export const GenerationRequestSchema = z
  .strictObject({
    packId: id,
    packRevision: version,
    draftVersion: version,
    mode: GenerationModeSchema,
    sourceIndices: z
      .array(sourceIndex)
      .min(1)
      .max(20)
      .refine((value) => new Set(value).size === value.length),
    targetBlockIds: z
      .array(id)
      .max(20)
      .refine((value) => new Set(value).size === value.length),
    consent: z.literal(true),
    maxInputTokens: z.int().min(256).max(16_000),
    maxOutputTokens: z.int().min(64).max(4096),
    maxCostMicrousd: z.int().min(1).max(1_000_000),
  })
  .superRefine((value, context) => {
    if ((value.mode === "refine") !== value.targetBlockIds.length > 0)
      context.addIssue({
        code: "custom",
        path: ["targetBlockIds"],
        message: "refine requires targets; other modes do not",
      });
  });
export type GenerationRequest = z.infer<typeof GenerationRequestSchema>;
export const GenerationQueuedSchema = command.extend({
  requestId: id,
  state: z.literal("QUEUED"),
});
export const GenerationStateSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELED",
  "STALE",
]);
export const GenerationProposalSchema = z.strictObject({
  id,
  kind: z.enum(["heading", "paragraph"]),
  targetBlockId: id.nullable(),
  text: text(8000),
  sourceIndices: z.array(sourceIndex).max(20),
  reviewRequired: z.literal(true),
});
export type GenerationProposal = z.infer<typeof GenerationProposalSchema>;
export const ModelGenerationOutputSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        kind: z.enum(["heading", "paragraph"]),
        targetBlockId: id.nullable(),
        text: text(8000),
        sourceIndices: z
          .array(sourceIndex)
          .max(20)
          .refine((value) => new Set(value).size === value.length),
      }),
    )
    .min(1)
    .max(20),
});
export type ModelGenerationOutput = z.infer<typeof ModelGenerationOutputSchema>;
export const GenerationDiffSchema = z.strictObject({
  proposalId: id,
  targetBlockId: id.nullable(),
  beforeText: z.string().nullable(),
  afterText: text(8000),
});
export const GenerationArtifactSchema = z.strictObject({
  modelId: text(200),
  promptRevision: text(80),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  packId: id,
  packRevision: version,
  draftVersion: version,
  proposals: z.array(GenerationProposalSchema).min(1).max(20),
  diff: z.array(GenerationDiffSchema).min(1).max(20),
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  estimatedCostMicrousd: z.int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
});
export const GenerationStatusSchema = z.strictObject({
  requestId: id,
  documentId: id,
  state: GenerationStateSchema,
  mode: GenerationModeSchema,
  packId: id,
  packRevision: version,
  draftVersion: version,
  sourceIndices: z.array(sourceIndex),
  retryCount: z.int().nonnegative(),
  errorCode: z.string().nullable(),
  actualCostMicrousd: z.int().nonnegative().nullable(),
  artifact: GenerationArtifactSchema.nullable(),
});
export const GenerationCancelResponseSchema = command.extend({
  requestId: id,
  state: GenerationStateSchema,
});
export const ApplyGenerationRequestSchema = z.strictObject({
  baseDraftVersion: version,
  proposalIds: z
    .array(id)
    .min(1)
    .max(20)
    .refine((value) => new Set(value).size === value.length),
});
export const ApplyGenerationResponseSchema = command.extend({
  documentId: id,
  draftVersion: version,
  appliedProposalIds: z.array(id),
  recheckBlockIds: z.array(id),
});

const root = "/api/v1/workspaces/{wid}/documents/{id}/generations";
const uuidParam = (name: string) => ({
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
export const generationOpenApiPaths = {
  [root]: {
    post: {
      operationId: "requestGeneration",
      parameters: [uuidParam("wid"), uuidParam("id"), key],
      requestBody: body(GenerationRequestSchema),
      responses: {
        "202": response(GenerationQueuedSchema, "Generation queued"),
      },
    },
  },
  [`${root}/{requestId}`]: {
    get: {
      operationId: "getGeneration",
      parameters: [uuidParam("wid"), uuidParam("id"), uuidParam("requestId")],
      responses: {
        "200": response(
          GenerationStatusSchema,
          "Private generation status and artifact",
        ),
      },
    },
  },
  [`${root}/{requestId}/cancel`]: {
    post: {
      operationId: "cancelGeneration",
      parameters: [
        uuidParam("wid"),
        uuidParam("id"),
        uuidParam("requestId"),
        key,
      ],
      responses: {
        "200": response(
          GenerationCancelResponseSchema,
          "Cancellation requested",
        ),
      },
    },
  },
  [`${root}/{requestId}/apply`]: {
    post: {
      operationId: "applyGeneration",
      parameters: [
        uuidParam("wid"),
        uuidParam("id"),
        uuidParam("requestId"),
        key,
      ],
      requestBody: body(ApplyGenerationRequestSchema),
      responses: {
        "200": response(
          ApplyGenerationResponseSchema,
          "Selected proposals applied",
        ),
      },
    },
  },
} as const;
