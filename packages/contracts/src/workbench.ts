import * as z from "zod";

const id = z.uuid();
const revision = z.int().positive();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !value.includes("\u0000"));
const command = z.strictObject({ commandId: id, replayed: z.boolean() });
const span = z
  .strictObject({
    start: z.int().nonnegative(),
    end: revision,
    encoding: z.literal("utf16"),
  })
  .refine((value) => value.end > value.start);
const url = z
  .url()
  .max(2000)
  .refine(
    (value) => value.startsWith("https://") || value.startsWith("http://"),
  );

export const ExternalExcerptFieldsSchema = z.strictObject({
  title: text(300),
  url,
  author: text(300),
  publishedAt: z.iso.date().nullable(),
  excerpt: text(200000),
});
export type ExternalExcerptFields = z.infer<typeof ExternalExcerptFieldsSchema>;
export const CreateExternalExcerptRequestSchema = ExternalExcerptFieldsSchema;
export const ReviseExternalExcerptRequestSchema =
  ExternalExcerptFieldsSchema.extend({ baseVersion: revision });
export const DeleteExternalExcerptRequestSchema = z.strictObject({
  baseVersion: revision,
});
export const ExternalExcerptCommandResponseSchema = command.extend({
  id,
  version: revision,
  revision,
  state: z.enum(["ACTIVE", "DELETED"]),
  contentHash: hash,
});
export const ExternalExcerptDetailSchema = z.strictObject({
  id,
  workspaceId: id,
  version: revision,
  revision,
  state: z.enum(["ACTIVE", "DELETED"]),
  ...ExternalExcerptFieldsSchema.shape,
  contentHash: hash,
  recordedAt: z.iso.datetime({ offset: true }),
});

export const PackSourceSelectionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("capture_revision"), id, revision, span }),
  z.strictObject({
    kind: z.literal("unit"),
    id,
    revision,
    span: span.optional(),
  }),
  z.strictObject({
    kind: z.literal("document_revision"),
    id,
    revision,
    span: span.optional(),
  }),
  z.strictObject({
    kind: z.literal("task_result"),
    id,
    revision,
    span: span.optional(),
  }),
  z.strictObject({
    kind: z.literal("external_excerpt"),
    id,
    revision,
    span: span.optional(),
  }),
]);
export type PackSourceSelection = z.infer<typeof PackSourceSelectionSchema>;
export const PackSourceManifestSchema = z.strictObject({
  kind: z.enum([
    "capture_revision",
    "unit",
    "document_revision",
    "task_result",
    "external_excerpt",
  ]),
  id,
  revision,
  originKey: text(400),
  contentHash: hash,
  span: span.nullable(),
  text: z.string().max(20000),
  title: z.string().max(300),
  url: url.nullable(),
  author: z.string().max(300).nullable(),
  publishedAt: z.iso.date().nullable(),
});
export type PackSourceManifest = z.infer<typeof PackSourceManifestSchema>;
export const CreateEvidencePackRequestSchema = z.strictObject({
  title: text(300),
  sources: z.array(PackSourceSelectionSchema).min(1).max(100),
});
export type CreateEvidencePackRequest = z.infer<
  typeof CreateEvidencePackRequestSchema
>;
export const EvidencePackManifestSchema = z.strictObject({
  title: text(300),
  sources: z.array(PackSourceManifestSchema).min(1).max(100),
});
export const ReviseEvidencePackRequestSchema =
  CreateEvidencePackRequestSchema.extend({ baseRevision: revision });
export const EvidencePackCommandResponseSchema = command.extend({
  id,
  documentId: id,
  revision,
  manifestHash: hash,
});
export const PackSourceStateSchema = z.enum(["fresh", "stale", "unresolved"]);
export const EvidencePackDetailSchema = z.strictObject({
  id,
  documentId: id,
  revision,
  currentRevision: revision,
  title: z.string(),
  manifestHash: hash,
  sources: z.array(PackSourceManifestSchema),
  sourceStates: z.array(PackSourceStateSchema),
  originFamilies: z.array(z.string()),
  createdAt: z.iso.datetime({ offset: true }),
});

export const DocumentPurposeSchema = z.enum([
  "guide",
  "experiment_note",
  "decision_record",
  "comparison",
]);
export const SourceRoleSchema = z.enum([
  "personal_observation",
  "external_claim",
  "counterargument",
]);
export const OutlineEntrySchema = z.strictObject({
  itemId: text(80),
  citations: z
    .array(
      z.strictObject({
        sourceIndex: z.int().nonnegative(),
        role: SourceRoleSchema,
      }),
    )
    .max(100),
  authorInterpretation: z.string().max(2000).nullable(),
});
export const OutlineConflictSchema = z.strictObject({
  leftSourceIndex: z.int().nonnegative(),
  rightSourceIndex: z.int().nonnegative(),
  note: text(2000),
});
export const ClaimMappingSchema = z.strictObject({
  blockId: id,
  claimId: id,
  textHash: hash,
  blockHash: hash,
  transform: z.enum(["quote", "paraphrase", "synthesis", "author_added"]),
  sourceIndices: z.array(z.int().nonnegative()).max(100),
  semanticReview: z.enum([
    "unreviewed",
    "supported",
    "disputed",
    "author_asserted",
  ]),
});
export const SaveDocumentWorkbenchRequestSchema = z.strictObject({
  baseVersion: z.int().nonnegative(),
  draftVersion: revision,
  packId: id,
  packRevision: revision,
  purpose: DocumentPurposeSchema,
  audience: text(300),
  outline: z.array(OutlineEntrySchema).max(20),
  conflicts: z.array(OutlineConflictSchema).max(100),
  claims: z.array(ClaimMappingSchema).max(500),
});
export type SaveDocumentWorkbenchRequest = z.infer<
  typeof SaveDocumentWorkbenchRequestSchema
>;
export const DocumentWorkbenchCommandResponseSchema = command.extend({
  documentId: id,
  version: revision,
  draftVersion: revision,
  packId: id,
  packRevision: revision,
});
export const WorkbenchReadinessSchema = z.strictObject({
  status: z.enum(["needs_material", "needs_author_review"]),
  missingItems: z.array(z.string()),
  authorDraftItems: z.array(z.string()),
  missingCounterargument: z.boolean(),
  independentOriginFamilies: z.array(z.string()),
  unresolvedConflicts: z.array(OutlineConflictSchema),
  reviewRequired: z.literal(true),
});
export const WorkbenchClaimStateSchema = z.strictObject({
  claimId: id,
  state: z.enum([
    "current",
    "needs_remap",
    "source_stale",
    "source_unresolved",
  ]),
});
export const DocumentWorkbenchDetailSchema = z.strictObject({
  documentId: id,
  version: revision,
  draftVersion: revision,
  currentDraftVersion: revision,
  packId: id,
  packRevision: revision,
  purpose: DocumentPurposeSchema,
  audience: z.string(),
  outline: z.array(OutlineEntrySchema),
  conflicts: z.array(OutlineConflictSchema),
  claims: z.array(ClaimMappingSchema),
  claimStates: z.array(WorkbenchClaimStateSchema),
  sourceStates: z.array(PackSourceStateSchema),
  sourceManifest: z.array(PackSourceManifestSchema),
  readiness: WorkbenchReadinessSchema,
  createdAt: z.iso.datetime({ offset: true }),
});

const workspace = "/api/v1/workspaces/{wid}";
const documents = `${workspace}/documents`;
const wid = {
  name: "wid",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const did = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const pid = {
  name: "packId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const rev = {
  name: "revision",
  in: "path",
  required: true,
  schema: { type: "integer", minimum: 1 },
};
const key = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: { type: "string", minLength: 8, maxLength: 128 },
};
function body(schema: z.ZodType) {
  return {
    required: true,
    content: {
      "application/json": {
        schema: z.toJSONSchema(schema, { target: "openapi-3.0" }),
      },
    },
  };
}
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

export const workbenchOpenApiPaths = {
  [`${workspace}/external-excerpts`]: {
    post: {
      operationId: "createExternalExcerpt",
      parameters: [wid, key],
      requestBody: body(CreateExternalExcerptRequestSchema),
      responses: {
        "201": response(
          ExternalExcerptCommandResponseSchema,
          "Excerpt created",
        ),
      },
    },
  },
  [`${workspace}/external-excerpts/{id}`]: {
    get: {
      operationId: "getExternalExcerpt",
      parameters: [wid, did],
      responses: {
        "200": response(ExternalExcerptDetailSchema, "Private excerpt"),
      },
    },
    put: {
      operationId: "reviseExternalExcerpt",
      parameters: [wid, did, key],
      requestBody: body(ReviseExternalExcerptRequestSchema),
      responses: {
        "200": response(
          ExternalExcerptCommandResponseSchema,
          "Excerpt revised",
        ),
      },
    },
    delete: {
      operationId: "deleteExternalExcerpt",
      parameters: [wid, did, key],
      requestBody: body(DeleteExternalExcerptRequestSchema),
      responses: {
        "200": response(ExternalExcerptCommandResponseSchema, "Excerpt hidden"),
      },
    },
  },
  [`${documents}/{id}/evidence-packs`]: {
    post: {
      operationId: "createEvidencePack",
      parameters: [wid, did, key],
      requestBody: body(CreateEvidencePackRequestSchema),
      responses: {
        "201": response(EvidencePackCommandResponseSchema, "Pack created"),
      },
    },
  },
  [`${documents}/{id}/evidence-packs/{packId}/revisions`]: {
    post: {
      operationId: "reviseEvidencePack",
      parameters: [wid, did, pid, key],
      requestBody: body(ReviseEvidencePackRequestSchema),
      responses: {
        "201": response(
          EvidencePackCommandResponseSchema,
          "Pack revision created",
        ),
      },
    },
  },
  [`${documents}/{id}/evidence-packs/{packId}/revisions/{revision}`]: {
    get: {
      operationId: "getEvidencePackRevision",
      parameters: [wid, did, pid, rev],
      responses: {
        "200": response(
          EvidencePackDetailSchema,
          "Immutable pack revision with live source states",
        ),
      },
    },
  },
  [`${documents}/{id}/workbench`]: {
    put: {
      operationId: "saveDocumentWorkbench",
      parameters: [wid, did, key],
      requestBody: body(SaveDocumentWorkbenchRequestSchema),
      responses: {
        "200": response(
          DocumentWorkbenchCommandResponseSchema,
          "Workbench snapshot saved",
        ),
      },
    },
    get: {
      operationId: "getDocumentWorkbench",
      parameters: [wid, did],
      responses: {
        "200": response(
          DocumentWorkbenchDetailSchema,
          "Workbench and live review states",
        ),
      },
    },
  },
} as const;
