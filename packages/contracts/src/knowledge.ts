import * as z from "zod";

const id = z.uuid();
const version = z.int().positive();
const result = z.strictObject({ commandId: id, replayed: z.boolean() });
export const ContextKindSchema = z.enum([
  "TOPIC",
  "FLOW",
  "PROJECT",
  "COLLECTION",
]);
export const ContextStateSchema = z.enum(["ACTIVE", "ARCHIVED", "SUPERSEDED"]);
export const MembershipRoleSchema = z.enum([
  "PRIMARY",
  "SECONDARY",
  "BACKGROUND",
]);
export const ContextRelationTypeSchema = z.enum(["PARENT_OF", "RELATED_TO"]);
export const ThoughtRelationTypeSchema = z.enum([
  "SUPPORTS",
  "CONTRADICTS",
  "REFINES",
  "RESULT_OF",
  "RELATED_TO",
]);
export const CreateContextRequestSchema = z.strictObject({
  name: z.string().min(1).max(200),
  purpose: z.string().min(1).max(2000),
  scope: z.string().min(1).max(2000),
  kind: ContextKindSchema,
});
export const ChangeContextRequestSchema = z
  .strictObject({
    baseRevision: version,
    name: z.string().min(1).max(200).optional(),
    purpose: z.string().min(1).max(2000).optional(),
    scope: z.string().min(1).max(2000).optional(),
    kind: ContextKindSchema.optional(),
    state: z.enum(["ARCHIVED", "SUPERSEDED"]).optional(),
    supersededById: id.optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.state === "SUPERSEDED"
        ? !data.supersededById
        : data.supersededById !== undefined
    )
      ctx.addIssue({
        code: "custom",
        message: "supersededById requires SUPERSEDED",
      });
    if (
      [data.name, data.purpose, data.scope, data.kind, data.state].every(
        (v) => v === undefined,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "At least one change is required",
      });
  });
export const SetMembershipsRequestSchema = z.strictObject({
  baseVersion: version,
  memberships: z
    .array(z.strictObject({ contextId: id, role: MembershipRoleSchema }))
    .max(100),
});
export const AddContextRelationRequestSchema = z.strictObject({
  fromContextId: id,
  toContextId: id,
  type: ContextRelationTypeSchema,
});
export const AddThoughtRelationRequestSchema = z.strictObject({
  fromUnitId: id,
  fromRevision: version,
  toUnitId: id,
  toRevision: version,
  type: ThoughtRelationTypeSchema,
});
export const ContextCommandResponseSchema = result.extend({
  id: id,
  identityRevision: version,
  membershipRevision: version,
  state: ContextStateSchema,
});
export const MembershipCommandResponseSchema = result.extend({
  unitId: id,
  membershipVersion: version,
  memberships: z.array(
    z.strictObject({ contextId: id, role: MembershipRoleSchema }),
  ),
});
export const ContextRelationResponseSchema = result.extend({
  id,
  fromContextId: id,
  toContextId: id,
  type: ContextRelationTypeSchema,
});
export const ThoughtRelationResponseSchema = result.extend({
  id,
  fromUnitId: id,
  fromRevision: version,
  toUnitId: id,
  toRevision: version,
  type: ThoughtRelationTypeSchema,
});
export const EndRelationResponseSchema = result.extend({
  id,
  ended: z.literal(true),
});
const ContextSummarySchema = z.strictObject({
  id,
  name: z.string(),
  purpose: z.string(),
  scope: z.string(),
  kind: ContextKindSchema,
  state: ContextStateSchema,
  supersededById: id.nullable(),
  identityRevision: version,
  membershipRevision: version,
  updatedAt: z.iso.datetime({ offset: true }),
});
export const ContextListSchema = z.strictObject({
  contexts: z.array(ContextSummarySchema),
  nextCursor: z.string().nullable(),
});
export const ContextDetailSchema = ContextSummarySchema.extend({
  workspaceId: id,
  currentIdentityRevision: version,
  createdAt: z.iso.datetime({ offset: true }),
  memberships: z.array(
    z.strictObject({
      unitId: id,
      unitRevision: version,
      role: MembershipRoleSchema,
    }),
  ),
  relations: z.array(
    z.strictObject({
      id,
      fromContextId: id,
      toContextId: id,
      type: ContextRelationTypeSchema,
    }),
  ),
});
export const UnitMembershipsSchema = z.strictObject({
  unitId: id,
  membershipVersion: version,
  memberships: z.array(
    z.strictObject({
      contextId: id,
      role: MembershipRoleSchema,
      unitRevision: version,
    }),
  ),
});
export const UnitRelationsSchema = z.strictObject({
  unitId: id,
  relations: z.array(
    z.strictObject({
      id,
      fromUnitId: id,
      fromRevision: version,
      toUnitId: id,
      toRevision: version,
      type: ThoughtRelationTypeSchema,
    }),
  ),
});

const base = "/api/v1/workspaces/{wid}";
const contextPath = `${base}/contexts`;
const pathId = {
  name: "wid",
  in: "path",
  required: true,
  schema: { type: "string" },
};
const idempotency = {
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
export const knowledgeOpenApiPaths = {
  [contextPath]: {
    get: {
      operationId: "listContexts",
      parameters: [
        pathId,
        { name: "includeArchived", in: "query", schema: { type: "boolean" } },
        { name: "q", in: "query", schema: { type: "string" } },
        { name: "cursor", in: "query", schema: { type: "string" } },
      ],
      responses: { "200": response(ContextListSchema, "Scoped context list") },
    },
    post: {
      operationId: "createContext",
      parameters: [pathId, idempotency],
      requestBody: body(CreateContextRequestSchema),
      responses: {
        "201": response(ContextCommandResponseSchema, "Context created"),
      },
    },
  },
  [`${contextPath}/{id}`]: {
    get: {
      operationId: "getContext",
      parameters: [
        pathId,
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: { "200": response(ContextDetailSchema, "Context detail") },
    },
  },
  [`${contextPath}/{id}/identity`]: {
    post: {
      operationId: "changeContextIdentity",
      parameters: [
        pathId,
        { name: "id", in: "path", required: true, schema: { type: "string" } },
        idempotency,
      ],
      requestBody: body(ChangeContextRequestSchema),
      responses: {
        "201": response(ContextCommandResponseSchema, "Identity changed"),
      },
    },
  },
  [`${base}/units/{unitId}/memberships`]: {
    get: {
      operationId: "getUnitMemberships",
      parameters: [
        pathId,
        {
          name: "unitId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: { "200": response(UnitMembershipsSchema, "Unit memberships") },
    },
    post: {
      operationId: "setUnitMemberships",
      parameters: [
        pathId,
        {
          name: "unitId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
        idempotency,
      ],
      requestBody: body(SetMembershipsRequestSchema),
      responses: {
        "201": response(
          MembershipCommandResponseSchema,
          "Memberships replaced",
        ),
      },
    },
  },
  [`${base}/context-relations`]: {
    post: {
      operationId: "addContextRelation",
      parameters: [pathId, idempotency],
      requestBody: body(AddContextRelationRequestSchema),
      responses: {
        "201": response(
          ContextRelationResponseSchema,
          "Context relation approved",
        ),
      },
    },
  },
  [`${base}/units/{unitId}/relations`]: {
    get: {
      operationId: "getUnitRelations",
      parameters: [
        pathId,
        {
          name: "unitId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": response(UnitRelationsSchema, "Approved unit relations"),
      },
    },
  },
  [`${base}/thought-relations`]: {
    post: {
      operationId: "addThoughtRelation",
      parameters: [pathId, idempotency],
      requestBody: body(AddThoughtRelationRequestSchema),
      responses: {
        "201": response(
          ThoughtRelationResponseSchema,
          "Thought relation approved",
        ),
      },
    },
  },
  [`${base}/context-relations/{id}/end`]: {
    post: {
      operationId: "endContextRelation",
      parameters: [
        pathId,
        { name: "id", in: "path", required: true, schema: { type: "string" } },
        idempotency,
      ],
      responses: {
        "201": response(EndRelationResponseSchema, "Context relation ended"),
      },
    },
  },
  [`${base}/thought-relations/{id}/end`]: {
    post: {
      operationId: "endThoughtRelation",
      parameters: [
        pathId,
        { name: "id", in: "path", required: true, schema: { type: "string" } },
        idempotency,
      ],
      responses: {
        "201": response(EndRelationResponseSchema, "Thought relation ended"),
      },
    },
  },
};
