import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const business = pgSchema("business");

export const workspace = business.table(
  "workspace",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    personalOwnerId: text("personal_owner_id").notNull(),
    state: text("state").notNull().default("ACTIVE"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("workspace_personal_owner_id_unique").on(table.personalOwnerId),
    check(
      "workspace_state_check",
      sql`${table.state} in ('ACTIVE', 'SUSPENDED', 'DELETION_PENDING')`,
    ),
    check("workspace_version_positive", sql`${table.version} > 0`),
  ],
);

export const workspaceMember = business.table(
  "workspace_member",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("OWNER"),
    state: text("state").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "workspace_member_pk",
      columns: [table.workspaceId, table.userId],
    }),
    check(
      "workspace_member_role_check",
      sql`${table.role} in ('OWNER', 'EDITOR', 'VIEWER')`,
    ),
    check(
      "workspace_member_state_check",
      sql`${table.state} in ('ACTIVE', 'SUSPENDED')`,
    ),
  ],
);

export const installation = business.table(
  "installation",
  {
    id: integer("id").primaryKey(),
    operatorEmail: text("operator_email").notNull(),
    operatorUserId: text("operator_user_id"),
    state: text("state").notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    check("installation_singleton", sql`${table.id} = 1`),
    check(
      "installation_state_check",
      sql`${table.state} in ('PENDING', 'ACTIVE')`,
    ),
  ],
);

export const userAccess = business.table(
  "user_access",
  {
    userId: text("user_id").primaryKey(),
    personalWorkspaceId: uuid("personal_workspace_id").notNull(),
    state: text("state").notNull().default("ACTIVE"),
    authzVersion: integer("authz_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("user_access_personal_workspace_unique").on(
      table.personalWorkspaceId,
    ),
    check(
      "user_access_state_check",
      sql`${table.state} in ('ACTIVE', 'SUSPENDED', 'DELETION_PENDING')`,
    ),
    check("user_access_version_positive", sql`${table.authzVersion} > 0`),
  ],
);

export const instanceOperator = business.table("instance_operator", {
  userId: text("user_id").primaryKey(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userPreference = business.table("user_preference", {
  userId: text("user_id").primaryKey(),
  timeZone: text("time_zone").notNull().default("UTC"),
  externalModelEnabled: boolean("external_model_enabled")
    .notNull()
    .default(false),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const commandReceipt = business.table(
  "command_receipt",
  {
    workspaceId: uuid("workspace_id").notNull(),
    actorId: text("actor_id").notNull(),
    kind: text("kind").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    commandId: uuid("command_id").notNull().defaultRandom(),
    payloadHash: text("payload_hash").notNull(),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "command_receipt_pk",
      columns: [
        table.workspaceId,
        table.actorId,
        table.kind,
        table.idempotencyKey,
      ],
    }),
    unique("command_receipt_command_id_unique").on(table.commandId),
    check(
      "command_receipt_kind_nonempty",
      sql`length(${table.kind}) BETWEEN 1 AND 100`,
    ),
    check(
      "command_receipt_key_length",
      sql`length(${table.idempotencyKey}) BETWEEN 8 AND 128`,
    ),
    check(
      "command_receipt_hash_length",
      sql`length(${table.payloadHash}) = 64`,
    ),
  ],
);

export const commandAudit = business.table("command_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  commandId: uuid("command_id").notNull(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  beforeVersion: integer("before_version"),
  afterVersion: integer("after_version"),
  changedFieldNames: text("changed_field_names").array().notNull(),
  requestId: text("request_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const commandOutbox = business.table("command_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  commandId: uuid("command_id").notNull(),
  eventType: text("event_type").notNull(),
  payloadRef: jsonb("payload_ref").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Relay receipt; its insert commits with pg-boss send in the same DB transaction. */
export const commandDispatch = business.table("command_dispatch", {
  outboxId: uuid("outbox_id")
    .primaryKey()
    .references(() => commandOutbox.id),
  workspaceId: uuid("workspace_id").notNull(),
  jobId: uuid("job_id").notNull(),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const judgementRequest = business.table(
  "judgement_request",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    actorId: text("actor_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    unitRevision: integer("unit_revision").notNull(),
    state: text("state").notNull().default("QUEUED"),
    retryCount: integer("retry_count").notNull().default(0),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("judgement_request_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    check("judgement_request_revision_positive", sql`${table.unitRevision}>0`),
    check(
      "judgement_request_state_check",
      sql`${table.state} IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELED')`,
    ),
    check("judgement_request_retry_nonnegative", sql`${table.retryCount}>=0`),
  ],
);

/** Private, immutable run input and measured output for exact replay. */
export const judgementRun = business.table(
  "judgement_run",
  {
    requestId: uuid("request_id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    inputHash: text("input_hash").notNull(),
    rawSnapshot: jsonb("raw_snapshot").notNull(),
    retrieval: jsonb("retrieval").notNull(),
    measurements: jsonb("measurements").notNull(),
    result: jsonb("result").notNull(),
    stageLatency: jsonb("stage_latency").notNull(),
    profileState: text("profile_state").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "judgement_run_request_fk",
      columns: [table.workspaceId, table.requestId],
      foreignColumns: [judgementRequest.workspaceId, judgementRequest.id],
    }),
    check(
      "judgement_run_input_hash_length",
      sql`length(${table.inputHash})=64`,
    ),
    check(
      "judgement_run_profile_state_check",
      sql`${table.profileState} IN ('FRESH','LAGGING')`,
    ),
  ],
);

/** A user-selected, immutable membership preview derived from one observe run. */
export const judgementProposal = business.table(
  "judgement_proposal",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    runRequestId: uuid("run_request_id").notNull(),
    actorId: text("actor_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    unitRevision: integer("unit_revision").notNull(),
    contextId: uuid("context_id").notNull(),
    role: text("role").notNull(),
    operations: jsonb("operations").notNull(),
    operationsHash: text("operations_hash").notNull(),
    state: text("state").notNull().default("PENDING"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => [
    unique("judgement_proposal_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    foreignKey({
      name: "judgement_proposal_run_fk",
      columns: [table.workspaceId, table.runRequestId],
      foreignColumns: [judgementRequest.workspaceId, judgementRequest.id],
    }),
    check("judgement_proposal_revision_positive", sql`${table.unitRevision}>0`),
    check(
      "judgement_proposal_role_check",
      sql`${table.role} IN ('PRIMARY','SECONDARY','BACKGROUND')`,
    ),
    check(
      "judgement_proposal_state_check",
      sql`${table.state} IN ('PENDING','ACCEPTED','REJECTED','DISMISSED','EXPIRED','SUPERSEDED')`,
    ),
    check(
      "judgement_proposal_hash_length",
      sql`length(${table.operationsHash})=64`,
    ),
  ],
);

export const judgementExposure = business.table(
  "judgement_exposure",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    proposalId: uuid("proposal_id").notNull(),
    actorId: text("actor_id").notNull(),
    exposedAt: timestamp("exposed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("judgement_exposure_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    foreignKey({
      name: "judgement_exposure_proposal_fk",
      columns: [table.workspaceId, table.proposalId],
      foreignColumns: [judgementProposal.workspaceId, judgementProposal.id],
    }),
  ],
);

export const judgementFeedback = business.table(
  "judgement_feedback",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    proposalId: uuid("proposal_id").notNull(),
    exposureId: uuid("exposure_id").notNull(),
    actorId: text("actor_id").notNull(),
    kind: text("kind").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("judgement_feedback_proposal_unique").on(
      table.workspaceId,
      table.proposalId,
    ),
    foreignKey({
      name: "judgement_feedback_proposal_fk",
      columns: [table.workspaceId, table.proposalId],
      foreignColumns: [judgementProposal.workspaceId, judgementProposal.id],
    }),
    foreignKey({
      name: "judgement_feedback_exposure_fk",
      columns: [table.workspaceId, table.exposureId],
      foreignColumns: [judgementExposure.workspaceId, judgementExposure.id],
    }),
    check(
      "judgement_feedback_kind_check",
      sql`${table.kind} IN ('ACCEPTED','REJECTED','DISMISSED')`,
    ),
  ],
);

export const capture = business.table(
  "capture",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    createdById: text("created_by_id").notNull(),
    title: text("title").notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceKey: text("source_key"),
    originKey: text("origin_key").notNull(),
    state: text("state").notNull().default("ACTIVE"),
    version: integer("version").notNull().default(1),
    currentRevision: integer("current_revision").notNull().default(1),
    unitSetVersion: integer("unit_set_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("capture_workspace_id_unique").on(table.workspaceId, table.id),
    uniqueIndex("capture_source_key_unique")
      .on(table.workspaceId, table.sourceKind, table.sourceKey)
      .where(sql`${table.sourceKey} IS NOT NULL`),
    check(
      "capture_title_nonempty",
      sql`length(trim(${table.title})) BETWEEN 1 AND 300`,
    ),
    check(
      "capture_source_kind_check",
      sql`${table.sourceKind} IN ('manual', 'import')`,
    ),
    check(
      "capture_source_key_nonempty",
      sql`${table.sourceKey} IS NULL OR length(${table.sourceKey}) BETWEEN 1 AND 300`,
    ),
    check(
      "capture_import_key_required",
      sql`${table.sourceKind} <> 'import' OR ${table.sourceKey} IS NOT NULL`,
    ),
    check(
      "capture_origin_key_nonempty",
      sql`length(${table.originKey}) BETWEEN 1 AND 400`,
    ),
    check("capture_state_check", sql`${table.state} IN ('ACTIVE', 'ARCHIVED')`),
    check(
      "capture_versions_positive",
      sql`${table.version} > 0 AND ${table.currentRevision} > 0 AND ${table.unitSetVersion} > 0`,
    ),
  ],
);

export const captureRevision = business.table(
  "capture_revision",
  {
    workspaceId: uuid("workspace_id").notNull(),
    captureId: uuid("capture_id").notNull(),
    revision: integer("revision").notNull(),
    title: text("title").notNull(),
    rawBody: text("raw_body").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "capture_revision_pk",
      columns: [table.workspaceId, table.captureId, table.revision],
    }),
    foreignKey({
      name: "capture_revision_capture_fk",
      columns: [table.workspaceId, table.captureId],
      foreignColumns: [capture.workspaceId, capture.id],
    }),
    check("capture_revision_positive", sql`${table.revision} > 0`),
    check(
      "capture_revision_title_nonempty",
      sql`length(trim(${table.title})) BETWEEN 1 AND 300`,
    ),
    check(
      "capture_revision_body_nonempty",
      sql`length(${table.rawBody}) BETWEEN 1 AND 1000000`,
    ),
  ],
);

export const thoughtUnit = business.table(
  "thought_unit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    captureId: uuid("capture_id").notNull(),
    captureRevision: integer("capture_revision").notNull(),
    originKey: text("origin_key").notNull(),
    state: text("state").notNull().default("ACTIVE"),
    currentRevision: integer("current_revision").notNull().default(1),
    membershipVersion: integer("membership_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
  },
  (table) => [
    unique("thought_unit_workspace_id_unique").on(table.workspaceId, table.id),
    unique("thought_unit_identity_origin_unique").on(
      table.workspaceId,
      table.id,
      table.captureId,
      table.captureRevision,
    ),
    foreignKey({
      name: "thought_unit_capture_revision_fk",
      columns: [table.workspaceId, table.captureId, table.captureRevision],
      foreignColumns: [
        captureRevision.workspaceId,
        captureRevision.captureId,
        captureRevision.revision,
      ],
    }),
    check(
      "thought_unit_state_check",
      sql`${table.state} IN ('ACTIVE', 'SUPERSEDED')`,
    ),
    check("thought_unit_revision_positive", sql`${table.currentRevision} > 0`),
    check(
      "thought_unit_membership_version_positive",
      sql`${table.membershipVersion} > 0`,
    ),
  ],
);

export const thoughtUnitRevision = business.table(
  "thought_unit_revision",
  {
    workspaceId: uuid("workspace_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    revision: integer("revision").notNull(),
    captureId: uuid("capture_id").notNull(),
    captureRevision: integer("capture_revision").notNull(),
    sourceStart: integer("source_start").notNull(),
    sourceEnd: integer("source_end").notNull(),
    contentKind: text("content_kind").notNull().default("quote"),
    contentText: text("content_text").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "thought_unit_revision_pk",
      columns: [table.workspaceId, table.unitId, table.revision],
    }),
    foreignKey({
      name: "thought_unit_revision_unit_fk",
      columns: [
        table.workspaceId,
        table.unitId,
        table.captureId,
        table.captureRevision,
      ],
      foreignColumns: [
        thoughtUnit.workspaceId,
        thoughtUnit.id,
        thoughtUnit.captureId,
        thoughtUnit.captureRevision,
      ],
    }),
    foreignKey({
      name: "thought_unit_revision_capture_fk",
      columns: [table.workspaceId, table.captureId, table.captureRevision],
      foreignColumns: [
        captureRevision.workspaceId,
        captureRevision.captureId,
        captureRevision.revision,
      ],
    }),
    check("thought_unit_revision_positive", sql`${table.revision} > 0`),
    check(
      "thought_unit_span_valid",
      sql`${table.sourceStart} >= 0 AND ${table.sourceEnd} > ${table.sourceStart}`,
    ),
    check(
      "thought_unit_content_kind_check",
      sql`${table.contentKind} IN ('quote', 'paraphrase')`,
    ),
  ],
);

export const knowledgeContext = business.table(
  "context",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    name: text("name").notNull(),
    purpose: text("purpose").notNull(),
    scope: text("scope").notNull(),
    kind: text("kind").notNull(),
    state: text("state").notNull().default("ACTIVE"),
    supersededById: uuid("superseded_by_id"),
    identityRevision: integer("identity_revision").notNull().default(1),
    membershipRevision: integer("membership_revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("context_workspace_id_unique").on(table.workspaceId, table.id),
    check(
      "context_name_nonempty",
      sql`length(trim(${table.name})) BETWEEN 1 AND 200`,
    ),
    check(
      "context_purpose_nonempty",
      sql`length(trim(${table.purpose})) BETWEEN 1 AND 2000`,
    ),
    check(
      "context_scope_nonempty",
      sql`length(trim(${table.scope})) BETWEEN 1 AND 2000`,
    ),
    check(
      "context_kind_check",
      sql`${table.kind} IN ('TOPIC', 'FLOW', 'PROJECT', 'COLLECTION')`,
    ),
    check(
      "context_state_check",
      sql`${table.state} IN ('ACTIVE', 'ARCHIVED', 'SUPERSEDED')`,
    ),
    check(
      "context_versions_positive",
      sql`${table.identityRevision} > 0 AND ${table.membershipRevision} > 0`,
    ),
    check(
      "context_superseded_target_check",
      sql`${table.state} = 'SUPERSEDED' OR ${table.supersededById} IS NULL`,
    ),
    check(
      "context_not_self_superseded",
      sql`${table.supersededById} IS NULL OR ${table.id} <> ${table.supersededById}`,
    ),
  ],
);

/** A real invalidation signal consumed by BE-12's profile builder. */
export const contextProfileInvalidation = business.table(
  "context_profile_invalidation",
  {
    workspaceId: uuid("workspace_id").notNull(),
    contextId: uuid("context_id").notNull(),
    membershipRevision: integer("membership_revision").notNull(),
    lastOutboxId: uuid("last_outbox_id").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "context_profile_invalidation_pk",
      columns: [table.workspaceId, table.contextId],
    }),
    foreignKey({
      name: "context_profile_invalidation_context_fk",
      columns: [table.workspaceId, table.contextId],
      foreignColumns: [knowledgeContext.workspaceId, knowledgeContext.id],
    }),
    check(
      "context_profile_invalidation_revision_positive",
      sql`${table.membershipRevision}>0`,
    ),
  ],
);

export const contextIdentityRevision = business.table(
  "context_identity_revision",
  {
    workspaceId: uuid("workspace_id").notNull(),
    contextId: uuid("context_id").notNull(),
    revision: integer("revision").notNull(),
    name: text("name").notNull(),
    purpose: text("purpose").notNull(),
    scope: text("scope").notNull(),
    kind: text("kind").notNull(),
    state: text("state").notNull(),
    supersededById: uuid("superseded_by_id"),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "context_identity_revision_pk",
      columns: [table.workspaceId, table.contextId, table.revision],
    }),
    foreignKey({
      name: "context_identity_revision_context_fk",
      columns: [table.workspaceId, table.contextId],
      foreignColumns: [knowledgeContext.workspaceId, knowledgeContext.id],
    }),
    check("context_identity_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const structureProposal = business.table(
  "structure_proposal",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    actorId: text("actor_id").notNull(),
    kind: text("kind").notNull(),
    sourceContextId: uuid("source_context_id").notNull(),
    preview: jsonb("preview").notNull(),
    signature: text("signature").notNull(),
    state: text("state").notNull().default("PENDING"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (table) => [
    unique("structure_proposal_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    foreignKey({
      name: "structure_proposal_source_fk",
      columns: [table.workspaceId, table.sourceContextId],
      foreignColumns: [knowledgeContext.workspaceId, knowledgeContext.id],
    }),
    check(
      "structure_proposal_signature_hash",
      sql`length(${table.signature})=64`,
    ),
    check(
      "structure_proposal_kind_check",
      sql`${table.kind} IN ('SPLIT','MERGE','LINK','CREATE_PARENT')`,
    ),
    check(
      "structure_proposal_state_check",
      sql`${table.state} IN ('PENDING','APPLIED','EXPIRED','SUPERSEDED')`,
    ),
  ],
);

export const structureMutation = business.table(
  "structure_mutation",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    proposalId: uuid("proposal_id").notNull(),
    actorId: text("actor_id").notNull(),
    kind: text("kind").notNull(),
    before: jsonb("before").notNull(),
    after: jsonb("after").notNull(),
    state: text("state").notNull().default("APPLIED"),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
  },
  (table) => [
    unique("structure_mutation_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    unique("structure_mutation_proposal_unique").on(
      table.workspaceId,
      table.proposalId,
    ),
    foreignKey({
      name: "structure_mutation_proposal_fk",
      columns: [table.workspaceId, table.proposalId],
      foreignColumns: [structureProposal.workspaceId, structureProposal.id],
    }),
    check(
      "structure_mutation_state_check",
      sql`${table.state} IN ('APPLIED','UNDONE')`,
    ),
  ],
);

export const contextSuccessor = business.table(
  "context_successor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    sourceContextId: uuid("source_context_id").notNull(),
    targetContextId: uuid("target_context_id").notNull(),
    mutationId: uuid("mutation_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("context_successor_active_unique")
      .on(table.workspaceId, table.sourceContextId, table.targetContextId)
      .where(sql`${table.endedAt} IS NULL`),
    foreignKey({
      name: "context_successor_source_fk",
      columns: [table.workspaceId, table.sourceContextId],
      foreignColumns: [knowledgeContext.workspaceId, knowledgeContext.id],
    }),
    foreignKey({
      name: "context_successor_target_fk",
      columns: [table.workspaceId, table.targetContextId],
      foreignColumns: [knowledgeContext.workspaceId, knowledgeContext.id],
    }),
    foreignKey({
      name: "context_successor_mutation_fk",
      columns: [table.workspaceId, table.mutationId],
      foreignColumns: [structureMutation.workspaceId, structureMutation.id],
    }),
    check(
      "context_successor_not_self",
      sql`${table.sourceContextId}<>${table.targetContextId}`,
    ),
  ],
);

export const contextMembership = business.table(
  "context_membership",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    unitRevision: integer("unit_revision").notNull(),
    contextId: uuid("context_id").notNull(),
    role: text("role").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endedReason: text("ended_reason"),
  },
  (table) => [
    foreignKey({
      name: "context_membership_unit_fk",
      columns: [table.workspaceId, table.unitId],
      foreignColumns: [thoughtUnit.workspaceId, thoughtUnit.id],
    }),
    foreignKey({
      name: "context_membership_unit_revision_fk",
      columns: [table.workspaceId, table.unitId, table.unitRevision],
      foreignColumns: [
        thoughtUnitRevision.workspaceId,
        thoughtUnitRevision.unitId,
        thoughtUnitRevision.revision,
      ],
    }),
    foreignKey({
      name: "context_membership_context_fk",
      columns: [table.workspaceId, table.contextId],
      foreignColumns: [knowledgeContext.workspaceId, knowledgeContext.id],
    }),
    uniqueIndex("context_membership_active_pair_unique")
      .on(table.workspaceId, table.unitId, table.contextId)
      .where(sql`${table.endedAt} IS NULL`),
    uniqueIndex("context_membership_active_primary_unique")
      .on(table.workspaceId, table.unitId)
      .where(sql`${table.endedAt} IS NULL AND ${table.role} = 'PRIMARY'`),
    index("context_membership_context_active_idx").on(
      table.workspaceId,
      table.contextId,
      table.endedAt,
    ),
    check(
      "context_membership_role_check",
      sql`${table.role} IN ('PRIMARY', 'SECONDARY', 'BACKGROUND')`,
    ),
    check(
      "context_membership_end_check",
      sql`(${table.endedAt} IS NULL) = (${table.endedReason} IS NULL)`,
    ),
  ],
);

export const contextRelation = business.table(
  "context_relation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    fromContextId: uuid("from_context_id").notNull(),
    toContextId: uuid("to_context_id").notNull(),
    type: text("type").notNull(),
    approvedById: text("approved_by_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "context_relation_from_fk",
      columns: [table.workspaceId, table.fromContextId],
      foreignColumns: [knowledgeContext.workspaceId, knowledgeContext.id],
    }),
    foreignKey({
      name: "context_relation_to_fk",
      columns: [table.workspaceId, table.toContextId],
      foreignColumns: [knowledgeContext.workspaceId, knowledgeContext.id],
    }),
    uniqueIndex("context_relation_active_unique")
      .on(table.workspaceId, table.fromContextId, table.toContextId, table.type)
      .where(sql`${table.endedAt} IS NULL`),
    check(
      "context_relation_type_check",
      sql`${table.type} IN ('PARENT_OF', 'RELATED_TO')`,
    ),
    check(
      "context_relation_not_self",
      sql`${table.fromContextId} <> ${table.toContextId}`,
    ),
    check(
      "context_relation_symmetric_order",
      sql`${table.type} <> 'RELATED_TO' OR ${table.fromContextId} < ${table.toContextId}`,
    ),
  ],
);

export const thoughtRelation = business.table(
  "thought_relation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    fromUnitId: uuid("from_unit_id").notNull(),
    fromRevision: integer("from_revision").notNull(),
    toUnitId: uuid("to_unit_id").notNull(),
    toRevision: integer("to_revision").notNull(),
    type: text("type").notNull(),
    approvedById: text("approved_by_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "thought_relation_from_fk",
      columns: [table.workspaceId, table.fromUnitId, table.fromRevision],
      foreignColumns: [
        thoughtUnitRevision.workspaceId,
        thoughtUnitRevision.unitId,
        thoughtUnitRevision.revision,
      ],
    }),
    foreignKey({
      name: "thought_relation_to_fk",
      columns: [table.workspaceId, table.toUnitId, table.toRevision],
      foreignColumns: [
        thoughtUnitRevision.workspaceId,
        thoughtUnitRevision.unitId,
        thoughtUnitRevision.revision,
      ],
    }),
    uniqueIndex("thought_relation_active_unique")
      .on(
        table.workspaceId,
        table.fromUnitId,
        table.fromRevision,
        table.toUnitId,
        table.toRevision,
        table.type,
      )
      .where(sql`${table.endedAt} IS NULL`),
    check(
      "thought_relation_type_check",
      sql`${table.type} IN ('SUPPORTS', 'CONTRADICTS', 'REFINES', 'RESULT_OF', 'RELATED_TO')`,
    ),
    check(
      "thought_relation_not_self",
      sql`${table.fromUnitId} <> ${table.toUnitId} OR ${table.fromRevision} <> ${table.toRevision}`,
    ),
    check(
      "thought_relation_symmetric_order",
      sql`${table.type} NOT IN ('CONTRADICTS', 'RELATED_TO') OR (${table.fromUnitId}, ${table.fromRevision}) < (${table.toUnitId}, ${table.toRevision})`,
    ),
  ],
);

export const document = business.table(
  "document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    createdById: text("created_by_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    state: text("state").notNull().default("ACTIVE"),
    latestRevision: integer("latest_revision").notNull().default(0),
    linkVersion: integer("link_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("document_workspace_id_unique").on(table.workspaceId, table.id),
    index("document_workspace_kind_updated_idx").on(
      table.workspaceId,
      table.kind,
      table.updatedAt,
    ),
    check(
      "document_kind_check",
      sql`${table.kind} IN ('WIKI','ARTICLE','NOTE')`,
    ),
    check(
      "document_title_check",
      sql`length(trim(${table.title})) BETWEEN 1 AND 300`,
    ),
    check("document_state_check", sql`${table.state} IN ('ACTIVE','ARCHIVED')`),
    check(
      "document_revisions_check",
      sql`${table.latestRevision} >= 0 AND ${table.linkVersion} > 0`,
    ),
  ],
);

export const documentDraft = business.table(
  "document_draft",
  {
    workspaceId: uuid("workspace_id").notNull(),
    documentId: uuid("document_id").notNull(),
    version: integer("version").notNull().default(1),
    content: jsonb("content").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "document_draft_pk",
      columns: [table.workspaceId, table.documentId],
    }),
    foreignKey({
      name: "document_draft_document_fk",
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [document.workspaceId, document.id],
    }),
    check("document_draft_version_positive", sql`${table.version} > 0`),
  ],
);

export const documentRevision = business.table(
  "document_revision",
  {
    workspaceId: uuid("workspace_id").notNull(),
    documentId: uuid("document_id").notNull(),
    revision: integer("revision").notNull(),
    title: text("title").notNull(),
    content: jsonb("content").notNull(),
    contentHash: text("content_hash").notNull(),
    draftVersion: integer("draft_version"),
    restoredFromRevision: integer("restored_from_revision"),
    createdById: text("created_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "document_revision_pk",
      columns: [table.workspaceId, table.documentId, table.revision],
    }),
    foreignKey({
      name: "document_revision_document_fk",
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [document.workspaceId, document.id],
    }),
    foreignKey({
      name: "document_revision_restore_fk",
      columns: [
        table.workspaceId,
        table.documentId,
        table.restoredFromRevision,
      ],
      foreignColumns: [table.workspaceId, table.documentId, table.revision],
    }),
    check("document_revision_positive", sql`${table.revision} > 0`),
    check(
      "document_revision_hash_length",
      sql`length(${table.contentHash}) = 64`,
    ),
    check(
      "document_revision_draft_positive",
      sql`${table.draftVersion} IS NULL OR ${table.draftVersion} > 0`,
    ),
    check(
      "document_revision_origin_check",
      sql`(${table.draftVersion} IS NULL) <> (${table.restoredFromRevision} IS NULL)`,
    ),
  ],
);

export const documentLink = business.table(
  "document_link",
  {
    workspaceId: uuid("workspace_id").notNull(),
    fromDocumentId: uuid("from_document_id").notNull(),
    toDocumentId: uuid("to_document_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "document_link_pk",
      columns: [table.workspaceId, table.fromDocumentId, table.toDocumentId],
    }),
    foreignKey({
      name: "document_link_from_fk",
      columns: [table.workspaceId, table.fromDocumentId],
      foreignColumns: [document.workspaceId, document.id],
    }),
    foreignKey({
      name: "document_link_to_fk",
      columns: [table.workspaceId, table.toDocumentId],
      foreignColumns: [document.workspaceId, document.id],
    }),
    check(
      "document_link_not_self",
      sql`${table.fromDocumentId} <> ${table.toDocumentId}`,
    ),
  ],
);

export const externalExcerpt = business.table(
  "external_excerpt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    createdById: text("created_by_id").notNull(),
    state: text("state").notNull().default("ACTIVE"),
    version: integer("version").notNull().default(1),
    currentRevision: integer("current_revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("external_excerpt_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    check(
      "external_excerpt_state_check",
      sql`${table.state} IN ('ACTIVE','DELETED')`,
    ),
    check(
      "external_excerpt_versions_positive",
      sql`${table.version}>0 AND ${table.currentRevision}>0`,
    ),
  ],
);

export const externalExcerptRevision = business.table(
  "external_excerpt_revision",
  {
    workspaceId: uuid("workspace_id").notNull(),
    excerptId: uuid("excerpt_id").notNull(),
    revision: integer("revision").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    author: text("author").notNull(),
    publishedAt: date("published_at", { mode: "string" }),
    excerpt: text("excerpt").notNull(),
    contentHash: text("content_hash").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "external_excerpt_revision_pk",
      columns: [table.workspaceId, table.excerptId, table.revision],
    }),
    foreignKey({
      name: "external_excerpt_revision_excerpt_fk",
      columns: [table.workspaceId, table.excerptId],
      foreignColumns: [externalExcerpt.workspaceId, externalExcerpt.id],
    }),
    check("external_excerpt_revision_positive", sql`${table.revision}>0`),
    check(
      "external_excerpt_revision_title_check",
      sql`length(trim(${table.title})) BETWEEN 1 AND 300`,
    ),
    check(
      "external_excerpt_revision_url_check",
      sql`length(${table.url}) BETWEEN 1 AND 2000`,
    ),
    check(
      "external_excerpt_revision_author_check",
      sql`length(trim(${table.author})) BETWEEN 1 AND 300`,
    ),
    check(
      "external_excerpt_revision_excerpt_check",
      sql`length(${table.excerpt}) BETWEEN 1 AND 200000`,
    ),
    check(
      "external_excerpt_revision_hash_check",
      sql`length(${table.contentHash})=64`,
    ),
  ],
);

export const evidencePack = business.table(
  "evidence_pack",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    documentId: uuid("document_id").notNull(),
    currentRevision: integer("current_revision").notNull().default(1),
    createdById: text("created_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("evidence_pack_workspace_id_unique").on(table.workspaceId, table.id),
    unique("evidence_pack_document_identity_unique").on(
      table.workspaceId,
      table.id,
      table.documentId,
    ),
    foreignKey({
      name: "evidence_pack_document_fk",
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [document.workspaceId, document.id],
    }),
    check("evidence_pack_revision_positive", sql`${table.currentRevision}>0`),
  ],
);

export const evidencePackRevision = business.table(
  "evidence_pack_revision",
  {
    workspaceId: uuid("workspace_id").notNull(),
    packId: uuid("pack_id").notNull(),
    revision: integer("revision").notNull(),
    manifest: jsonb("manifest").notNull(),
    manifestHash: text("manifest_hash").notNull(),
    createdById: text("created_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "evidence_pack_revision_pk",
      columns: [table.workspaceId, table.packId, table.revision],
    }),
    foreignKey({
      name: "evidence_pack_revision_pack_fk",
      columns: [table.workspaceId, table.packId],
      foreignColumns: [evidencePack.workspaceId, evidencePack.id],
    }),
    check("evidence_pack_revision_positive", sql`${table.revision}>0`),
    check(
      "evidence_pack_revision_hash_check",
      sql`length(${table.manifestHash})=64`,
    ),
  ],
);

export const documentWorkbench = business.table(
  "document_workbench",
  {
    workspaceId: uuid("workspace_id").notNull(),
    documentId: uuid("document_id").notNull(),
    currentRevision: integer("current_revision").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "document_workbench_pk",
      columns: [table.workspaceId, table.documentId],
    }),
    foreignKey({
      name: "document_workbench_document_fk",
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [document.workspaceId, document.id],
    }),
    check(
      "document_workbench_revision_nonnegative",
      sql`${table.currentRevision}>=0`,
    ),
  ],
);

export const documentWorkbenchRevision = business.table(
  "document_workbench_revision",
  {
    workspaceId: uuid("workspace_id").notNull(),
    documentId: uuid("document_id").notNull(),
    revision: integer("revision").notNull(),
    packId: uuid("pack_id").notNull(),
    packRevision: integer("pack_revision").notNull(),
    draftVersion: integer("draft_version").notNull(),
    purpose: text("purpose").notNull(),
    audience: text("audience").notNull(),
    outline: jsonb("outline").notNull(),
    claims: jsonb("claims").notNull(),
    sourceManifest: jsonb("source_manifest").notNull(),
    createdById: text("created_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "document_workbench_revision_pk",
      columns: [table.workspaceId, table.documentId, table.revision],
    }),
    foreignKey({
      name: "document_workbench_revision_workbench_fk",
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [
        documentWorkbench.workspaceId,
        documentWorkbench.documentId,
      ],
    }),
    foreignKey({
      name: "document_workbench_revision_pack_document_fk",
      columns: [table.workspaceId, table.packId, table.documentId],
      foreignColumns: [
        evidencePack.workspaceId,
        evidencePack.id,
        evidencePack.documentId,
      ],
    }),
    foreignKey({
      name: "document_workbench_revision_pack_fk",
      columns: [table.workspaceId, table.packId, table.packRevision],
      foreignColumns: [
        evidencePackRevision.workspaceId,
        evidencePackRevision.packId,
        evidencePackRevision.revision,
      ],
    }),
    check(
      "document_workbench_revision_positive",
      sql`${table.revision}>0 AND ${table.packRevision}>0 AND ${table.draftVersion}>0`,
    ),
    check(
      "document_workbench_purpose_check",
      sql`${table.purpose} IN ('guide','experiment_note','decision_record','comparison')`,
    ),
    check(
      "document_workbench_audience_check",
      sql`length(trim(${table.audience})) BETWEEN 1 AND 300`,
    ),
  ],
);

export const generationRequest = business.table(
  "generation_request",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    actorId: text("actor_id").notNull(),
    documentId: uuid("document_id").notNull(),
    packId: uuid("pack_id").notNull(),
    packRevision: integer("pack_revision").notNull(),
    draftVersion: integer("draft_version").notNull(),
    mode: text("mode").notNull(),
    sourceIndices: jsonb("source_indices").notNull(),
    targetBlockIds: jsonb("target_block_ids").notNull(),
    state: text("state").notNull().default("QUEUED"),
    retryCount: integer("retry_count").notNull().default(0),
    errorCode: text("error_code"),
    modelId: text("model_id").notNull(),
    promptRevision: text("prompt_revision").notNull(),
    inputHash: text("input_hash").notNull(),
    maxInputTokens: integer("max_input_tokens").notNull(),
    maxOutputTokens: integer("max_output_tokens").notNull(),
    maxCostMicrousd: integer("max_cost_microusd").notNull(),
    reservedCostMicrousd: integer("reserved_cost_microusd").notNull(),
    actualCostMicrousd: integer("actual_cost_microusd"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("generation_request_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    foreignKey({
      name: "generation_request_document_fk",
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [document.workspaceId, document.id],
    }),
    foreignKey({
      name: "generation_request_pack_document_fk",
      columns: [table.workspaceId, table.packId, table.documentId],
      foreignColumns: [
        evidencePack.workspaceId,
        evidencePack.id,
        evidencePack.documentId,
      ],
    }),
    foreignKey({
      name: "generation_request_pack_revision_fk",
      columns: [table.workspaceId, table.packId, table.packRevision],
      foreignColumns: [
        evidencePackRevision.workspaceId,
        evidencePackRevision.packId,
        evidencePackRevision.revision,
      ],
    }),
    check(
      "generation_request_state_check",
      sql`${table.state} IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELED','STALE')`,
    ),
    check(
      "generation_request_mode_check",
      sql`${table.mode} IN ('outline','refine','draft')`,
    ),
    check(
      "generation_request_positive",
      sql`${table.packRevision}>0 AND ${table.draftVersion}>0 AND ${table.maxInputTokens}>0 AND ${table.maxOutputTokens}>0 AND ${table.maxCostMicrousd}>0 AND ${table.reservedCostMicrousd}>0 AND ${table.retryCount}>=0 AND (${table.actualCostMicrousd} IS NULL OR ${table.actualCostMicrousd}>=0)`,
    ),
    check("generation_request_hash_check", sql`length(${table.inputHash})=64`),
  ],
);

export const generationArtifact = business.table(
  "generation_artifact",
  {
    workspaceId: uuid("workspace_id").notNull(),
    requestId: uuid("request_id").notNull(),
    output: jsonb("output").notNull(),
    diff: jsonb("diff").notNull(),
    sourceManifest: jsonb("source_manifest").notNull(),
    inputHash: text("input_hash").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    estimatedCostMicrousd: integer("estimated_cost_microusd").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "generation_artifact_pk",
      columns: [table.workspaceId, table.requestId],
    }),
    foreignKey({
      name: "generation_artifact_request_fk",
      columns: [table.workspaceId, table.requestId],
      foreignColumns: [generationRequest.workspaceId, generationRequest.id],
    }),
    check("generation_artifact_hash_check", sql`length(${table.inputHash})=64`),
    check(
      "generation_artifact_usage_check",
      sql`${table.inputTokens}>=0 AND ${table.outputTokens}>=0 AND ${table.estimatedCostMicrousd}>=0`,
    ),
  ],
);

export const generationApplication = business.table(
  "generation_application",
  {
    workspaceId: uuid("workspace_id").notNull(),
    requestId: uuid("request_id").notNull(),
    proposalId: uuid("proposal_id").notNull(),
    commandId: uuid("command_id").notNull(),
    documentId: uuid("document_id").notNull(),
    baseDraftVersion: integer("base_draft_version").notNull(),
    resultingDraftVersion: integer("resulting_draft_version").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "generation_application_pk",
      columns: [table.workspaceId, table.requestId, table.proposalId],
    }),
    foreignKey({
      name: "generation_application_request_fk",
      columns: [table.workspaceId, table.requestId],
      foreignColumns: [generationRequest.workspaceId, generationRequest.id],
    }),
    foreignKey({
      name: "generation_application_document_fk",
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [document.workspaceId, document.id],
    }),
    check(
      "generation_application_versions_check",
      sql`${table.baseDraftVersion}>0 AND ${table.resultingDraftVersion}=${table.baseDraftVersion}+1`,
    ),
  ],
);

export const asset = business.table(
  "asset",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    uploaderId: text("uploader_id").notNull(),
    originalName: text("original_name").notNull(),
    declaredMime: text("declared_mime").notNull(),
    expectedSize: integer("expected_size").notNull(),
    state: text("state").notNull().default("PENDING"),
    rejectionCode: text("rejection_code"),
    originalStorageKey: text("original_storage_key"),
    detectedMime: text("detected_mime"),
    byteSize: integer("byte_size"),
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("asset_workspace_id_unique").on(table.workspaceId, table.id),
    index("asset_workspace_state_created_idx").on(
      table.workspaceId,
      table.state,
      table.createdAt,
    ),
    check(
      "asset_state_check",
      sql`${table.state} IN ('PENDING','VERIFIED','REJECTED','DELETED')`,
    ),
    check(
      "asset_expected_size_check",
      sql`${table.expectedSize}>0 AND ${table.expectedSize}<=20971520`,
    ),
    check(
      "asset_content_hash_check",
      sql`${table.contentHash} IS NULL OR length(${table.contentHash})=64`,
    ),
  ],
);

export const publicAsset = business.table(
  "public_asset",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    sourceAssetId: uuid("source_asset_id").notNull(),
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull(),
    byteSize: integer("byte_size").notNull(),
    contentHash: text("content_hash").notNull(),
    transformRevision: text("transform_revision").notNull(),
    width: integer("width"),
    height: integer("height"),
    state: text("state").notNull().default("VERIFIED"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("public_asset_workspace_source_unique").on(
      table.workspaceId,
      table.sourceAssetId,
    ),
    unique("public_asset_workspace_id_unique").on(table.workspaceId, table.id),
    foreignKey({
      name: "public_asset_source_fk",
      columns: [table.workspaceId, table.sourceAssetId],
      foreignColumns: [asset.workspaceId, asset.id],
    }),
    check(
      "public_asset_state_check",
      sql`${table.state} IN ('VERIFIED','DISABLED')`,
    ),
    check(
      "public_asset_size_check",
      sql`${table.byteSize}>0 AND ${table.byteSize}<=20971520`,
    ),
    check("public_asset_hash_check", sql`length(${table.contentHash})=64`),
  ],
);

export const documentAssetDraft = business.table(
  "document_asset_draft",
  {
    workspaceId: uuid("workspace_id").notNull(),
    documentId: uuid("document_id").notNull(),
    assetId: uuid("asset_id").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({
      name: "document_asset_draft_pk",
      columns: [table.workspaceId, table.documentId, table.assetId],
    }),
    unique("document_asset_draft_position_unique").on(
      table.workspaceId,
      table.documentId,
      table.position,
    ),
    foreignKey({
      name: "document_asset_draft_document_fk",
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [document.workspaceId, document.id],
    }),
    foreignKey({
      name: "document_asset_draft_asset_fk",
      columns: [table.workspaceId, table.assetId],
      foreignColumns: [asset.workspaceId, asset.id],
    }),
    check("document_asset_draft_position_check", sql`${table.position}>=0`),
  ],
);

export const documentAssetRevision = business.table(
  "document_asset_revision",
  {
    workspaceId: uuid("workspace_id").notNull(),
    documentId: uuid("document_id").notNull(),
    revision: integer("revision").notNull(),
    assetId: uuid("asset_id").notNull(),
    publicAssetId: uuid("public_asset_id").notNull(),
    position: integer("position").notNull(),
    originalHash: text("original_hash").notNull(),
    derivativeHash: text("derivative_hash").notNull(),
  },
  (table) => [
    primaryKey({
      name: "document_asset_revision_pk",
      columns: [
        table.workspaceId,
        table.documentId,
        table.revision,
        table.assetId,
      ],
    }),
    unique("document_asset_revision_position_unique").on(
      table.workspaceId,
      table.documentId,
      table.revision,
      table.position,
    ),
    foreignKey({
      name: "document_asset_revision_document_fk",
      columns: [table.workspaceId, table.documentId, table.revision],
      foreignColumns: [
        documentRevision.workspaceId,
        documentRevision.documentId,
        documentRevision.revision,
      ],
    }),
    foreignKey({
      name: "document_asset_revision_asset_fk",
      columns: [table.workspaceId, table.assetId],
      foreignColumns: [asset.workspaceId, asset.id],
    }),
    foreignKey({
      name: "document_asset_revision_public_fk",
      columns: [table.workspaceId, table.publicAssetId],
      foreignColumns: [publicAsset.workspaceId, publicAsset.id],
    }),
    check("document_asset_revision_position_check", sql`${table.position}>=0`),
    check(
      "document_asset_revision_hash_check",
      sql`length(${table.originalHash})=64 AND length(${table.derivativeHash})=64`,
    ),
  ],
);

export const publicationChannel = business.table(
  "publication_channel",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    name: text("name").notNull(),
    state: text("state").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("publication_channel_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    unique("publication_channel_workspace_name_unique").on(
      table.workspaceId,
      table.name,
    ),
    foreignKey({
      name: "publication_channel_workspace_fk",
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
    }),
    check(
      "publication_channel_state_check",
      sql`${table.state} IN ('ACTIVE','DISABLED')`,
    ),
  ],
);

export const documentReview = business.table(
  "document_review",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    documentId: uuid("document_id").notNull(),
    revision: integer("revision").notNull(),
    sequence: integer("sequence").notNull(),
    manifestHash: text("manifest_hash").notNull(),
    manifest: jsonb("manifest").notNull(),
    decision: text("decision").notNull(),
    reviewerId: text("reviewer_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("document_review_revision_id_unique").on(
      table.workspaceId,
      table.documentId,
      table.revision,
      table.id,
    ),
    unique("document_review_sequence_unique").on(
      table.workspaceId,
      table.documentId,
      table.revision,
      table.sequence,
    ),
    foreignKey({
      name: "document_review_revision_fk",
      columns: [table.workspaceId, table.documentId, table.revision],
      foreignColumns: [
        documentRevision.workspaceId,
        documentRevision.documentId,
        documentRevision.revision,
      ],
    }),
    check(
      "document_review_decision_check",
      sql`${table.decision} IN ('READY','CHANGES_REQUIRED')`,
    ),
    check("document_review_hash_check", sql`length(${table.manifestHash})=64`),
    check("document_review_sequence_positive", sql`${table.sequence}>0`),
  ],
);

export const publication = business.table(
  "publication",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    channelId: uuid("channel_id").notNull(),
    documentId: uuid("document_id").notNull(),
    currentRevision: integer("current_revision"),
    state: text("state").notNull().default("WITHDRAWN"),
    accessEpoch: integer("access_epoch").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("publication_workspace_id_unique").on(table.workspaceId, table.id),
    unique("publication_workspace_document_id_unique").on(
      table.workspaceId,
      table.id,
      table.documentId,
    ),
    unique("publication_workspace_channel_id_unique").on(
      table.workspaceId,
      table.id,
      table.channelId,
    ),
    unique("publication_document_channel_unique").on(
      table.workspaceId,
      table.channelId,
      table.documentId,
    ),
    foreignKey({
      name: "publication_channel_fk",
      columns: [table.workspaceId, table.channelId],
      foreignColumns: [publicationChannel.workspaceId, publicationChannel.id],
    }),
    foreignKey({
      name: "publication_document_fk",
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [document.workspaceId, document.id],
    }),
    check(
      "publication_state_check",
      sql`${table.state} IN ('PUBLISHED','WITHDRAWN')`,
    ),
    check(
      "publication_published_pointer_check",
      sql`${table.state}<>'PUBLISHED' OR ${table.currentRevision} IS NOT NULL`,
    ),
    check("publication_epoch_positive", sql`${table.accessEpoch}>0`),
  ],
);

export const publicationRevision = business.table(
  "publication_revision",
  {
    workspaceId: uuid("workspace_id").notNull(),
    publicationId: uuid("publication_id").notNull(),
    revision: integer("revision").notNull(),
    documentId: uuid("document_id").notNull(),
    documentRevision: integer("document_revision").notNull(),
    reviewId: uuid("review_id").notNull(),
    manifestHash: text("manifest_hash").notNull(),
    createdById: text("created_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "publication_revision_pk",
      columns: [table.workspaceId, table.publicationId, table.revision],
    }),
    foreignKey({
      name: "publication_revision_publication_fk",
      columns: [table.workspaceId, table.publicationId, table.documentId],
      foreignColumns: [
        publication.workspaceId,
        publication.id,
        publication.documentId,
      ],
    }),
    foreignKey({
      name: "publication_revision_document_fk",
      columns: [table.workspaceId, table.documentId, table.documentRevision],
      foreignColumns: [
        documentRevision.workspaceId,
        documentRevision.documentId,
        documentRevision.revision,
      ],
    }),
    foreignKey({
      name: "publication_revision_review_fk",
      columns: [
        table.workspaceId,
        table.documentId,
        table.documentRevision,
        table.reviewId,
      ],
      foreignColumns: [
        documentReview.workspaceId,
        documentReview.documentId,
        documentReview.revision,
        documentReview.id,
      ],
    }),
    check("publication_revision_positive", sql`${table.revision}>0`),
    check(
      "publication_revision_hash_check",
      sql`length(${table.manifestHash})=64`,
    ),
  ],
);

export const publicationSlug = business.table(
  "publication_slug",
  {
    workspaceId: uuid("workspace_id").notNull(),
    channelId: uuid("channel_id").notNull(),
    slug: text("slug").notNull(),
    publicationId: uuid("publication_id").notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
  },
  (table) => [
    primaryKey({
      name: "publication_slug_pk",
      columns: [table.workspaceId, table.channelId, table.slug],
    }),
    uniqueIndex("publication_slug_one_current_idx")
      .on(table.workspaceId, table.publicationId)
      .where(sql`${table.isCurrent}`),
    foreignKey({
      name: "publication_slug_publication_fk",
      columns: [table.workspaceId, table.publicationId, table.channelId],
      foreignColumns: [
        publication.workspaceId,
        publication.id,
        publication.channelId,
      ],
    }),
  ],
);

export const publicationAsset = business.table(
  "publication_asset",
  {
    workspaceId: uuid("workspace_id").notNull(),
    publicationId: uuid("publication_id").notNull(),
    revision: integer("revision").notNull(),
    publicAssetId: uuid("public_asset_id").notNull(),
    position: integer("position").notNull(),
    contentHash: text("content_hash").notNull(),
  },
  (table) => [
    primaryKey({
      name: "publication_asset_pk",
      columns: [
        table.workspaceId,
        table.publicationId,
        table.revision,
        table.publicAssetId,
      ],
    }),
    unique("publication_asset_position_unique").on(
      table.workspaceId,
      table.publicationId,
      table.revision,
      table.position,
    ),
    foreignKey({
      name: "publication_asset_revision_fk",
      columns: [table.workspaceId, table.publicationId, table.revision],
      foreignColumns: [
        publicationRevision.workspaceId,
        publicationRevision.publicationId,
        publicationRevision.revision,
      ],
    }),
    foreignKey({
      name: "publication_asset_public_fk",
      columns: [table.workspaceId, table.publicAssetId],
      foreignColumns: [publicAsset.workspaceId, publicAsset.id],
    }),
    check("publication_asset_hash_check", sql`length(${table.contentHash})=64`),
  ],
);

export const delivery = pgSchema("delivery");
export const deliveryPublication = delivery.table(
  "publication",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    channelId: uuid("channel_id").notNull(),
    currentRevision: integer("current_revision"),
    state: text("state").notNull(),
    accessEpoch: integer("access_epoch").notNull(),
    currentSlug: text("current_slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("delivery_publication_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    unique("delivery_publication_workspace_channel_id_unique").on(
      table.workspaceId,
      table.id,
      table.channelId,
    ),
    check(
      "delivery_publication_state_check",
      sql`${table.state} IN ('PUBLISHED','WITHDRAWN')`,
    ),
    check(
      "delivery_publication_published_pointer_check",
      sql`${table.state}<>'PUBLISHED' OR ${table.currentRevision} IS NOT NULL`,
    ),
    check("delivery_publication_epoch_positive", sql`${table.accessEpoch}>0`),
  ],
);
export const deliveryPublicationRevision = delivery.table(
  "publication_revision",
  {
    workspaceId: uuid("workspace_id").notNull(),
    publicationId: uuid("publication_id").notNull(),
    revision: integer("revision").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    bodyFormat: text("body_format").notNull().default("markdown"),
    manifestHash: text("manifest_hash").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "delivery_publication_revision_pk",
      columns: [table.workspaceId, table.publicationId, table.revision],
    }),
    foreignKey({
      name: "delivery_publication_revision_publication_fk",
      columns: [table.workspaceId, table.publicationId],
      foreignColumns: [deliveryPublication.workspaceId, deliveryPublication.id],
    }),
    check(
      "delivery_publication_revision_format_check",
      sql`${table.bodyFormat}='markdown'`,
    ),
    check(
      "delivery_publication_revision_hash_check",
      sql`length(${table.manifestHash})=64`,
    ),
  ],
);
export const deliveryPublicationSlug = delivery.table(
  "publication_slug",
  {
    workspaceId: uuid("workspace_id").notNull(),
    channelId: uuid("channel_id").notNull(),
    slug: text("slug").notNull(),
    publicationId: uuid("publication_id").notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
  },
  (table) => [
    primaryKey({
      name: "delivery_publication_slug_pk",
      columns: [table.workspaceId, table.channelId, table.slug],
    }),
    uniqueIndex("delivery_publication_slug_one_current_idx")
      .on(table.workspaceId, table.publicationId)
      .where(sql`${table.isCurrent}`),
    foreignKey({
      name: "delivery_publication_slug_publication_fk",
      columns: [table.workspaceId, table.publicationId, table.channelId],
      foreignColumns: [
        deliveryPublication.workspaceId,
        deliveryPublication.id,
        deliveryPublication.channelId,
      ],
    }),
  ],
);
export const deliveryPublicationAsset = delivery.table(
  "publication_asset",
  {
    workspaceId: uuid("workspace_id").notNull(),
    publicationId: uuid("publication_id").notNull(),
    revision: integer("revision").notNull(),
    publicAssetId: uuid("public_asset_id").notNull(),
    position: integer("position").notNull(),
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull(),
    byteSize: integer("byte_size").notNull(),
    contentHash: text("content_hash").notNull(),
  },
  (table) => [
    primaryKey({
      name: "delivery_publication_asset_pk",
      columns: [
        table.workspaceId,
        table.publicationId,
        table.revision,
        table.publicAssetId,
      ],
    }),
    unique("delivery_publication_asset_position_unique").on(
      table.workspaceId,
      table.publicationId,
      table.revision,
      table.position,
    ),
    foreignKey({
      name: "delivery_publication_asset_revision_fk",
      columns: [table.workspaceId, table.publicationId, table.revision],
      foreignColumns: [
        deliveryPublicationRevision.workspaceId,
        deliveryPublicationRevision.publicationId,
        deliveryPublicationRevision.revision,
      ],
    }),
    check(
      "delivery_publication_asset_hash_check",
      sql`length(${table.contentHash})=64`,
    ),
  ],
);

/** A server-side Delivery credential. The bearer value is never persisted. */
export const deliveryClientCredential = delivery.table(
  "client_credential",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    channelId: uuid("channel_id").notNull(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdById: text("created_by_id").notNull(),
    issuedAuthzVersion: integer("issued_authz_version").notNull().default(0),
    state: text("state").notNull().default("ACTIVE"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("delivery_client_credential_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    foreignKey({
      name: "delivery_client_credential_channel_fk",
      columns: [table.workspaceId, table.channelId],
      foreignColumns: [publicationChannel.workspaceId, publicationChannel.id],
    }),
    check(
      "delivery_client_credential_hash_check",
      sql`length(${table.tokenHash})=64`,
    ),
    check(
      "delivery_client_credential_state_check",
      sql`${table.state} IN ('ACTIVE','REVOKED')`,
    ),
    check(
      "delivery_client_credential_expiry_check",
      sql`${table.expiresAt}>${table.createdAt}`,
    ),
    check(
      "delivery_client_credential_revoked_check",
      sql`(${table.state}='REVOKED')=(${table.revokedAt} IS NOT NULL)`,
    ),
  ],
);

export const task = business.table(
  "task",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    createdById: text("created_by_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    state: text("state").notNull().default("TODO"),
    version: integer("version").notNull().default(1),
    dueKind: text("due_kind").notNull().default("NONE"),
    dueDate: date("due_date", { mode: "string" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    dueTimeZone: text("due_time_zone"),
    contextId: uuid("context_id"),
    originKind: text("origin_kind").notNull().default("EXPLICIT"),
    originUnitId: uuid("origin_unit_id"),
    originUnitRevision: integer("origin_unit_revision"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completionVersion: integer("completion_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("task_workspace_id_unique").on(table.workspaceId, table.id),
    index("task_workspace_state_updated_idx").on(
      table.workspaceId,
      table.state,
      table.updatedAt,
    ),
    foreignKey({
      name: "task_context_fk",
      columns: [table.workspaceId, table.contextId],
      foreignColumns: [knowledgeContext.workspaceId, knowledgeContext.id],
    }),
    foreignKey({
      name: "task_origin_unit_revision_fk",
      columns: [
        table.workspaceId,
        table.originUnitId,
        table.originUnitRevision,
      ],
      foreignColumns: [
        thoughtUnitRevision.workspaceId,
        thoughtUnitRevision.unitId,
        thoughtUnitRevision.revision,
      ],
    }),
    check(
      "task_title_nonempty",
      sql`length(trim(${table.title})) BETWEEN 1 AND 300`,
    ),
    check(
      "task_description_length",
      sql`length(${table.description}) <= 10000`,
    ),
    check(
      "task_state_check",
      sql`${table.state} IN ('TODO','IN_PROGRESS','ON_HOLD','DONE','CANCELED')`,
    ),
    check("task_version_positive", sql`${table.version} > 0`),
    check(
      "task_due_check",
      sql`(${table.dueKind}='NONE' AND ${table.dueDate} IS NULL AND ${table.dueAt} IS NULL AND ${table.dueTimeZone} IS NULL) OR (${table.dueKind}='DATE' AND ${table.dueDate} IS NOT NULL AND ${table.dueAt} IS NULL AND ${table.dueTimeZone} IS NULL) OR (${table.dueKind}='INSTANT' AND ${table.dueDate} IS NULL AND ${table.dueAt} IS NOT NULL AND length(${table.dueTimeZone}) BETWEEN 1 AND 100)`,
    ),
    check("task_origin_kind_check", sql`${table.originKind}='EXPLICIT'`),
    check(
      "task_origin_pair_check",
      sql`(${table.originUnitId} IS NULL)=(${table.originUnitRevision} IS NULL)`,
    ),
    check(
      "task_completion_check",
      sql`(${table.state}='DONE' AND ${table.completedAt} IS NOT NULL AND ${table.completionVersion} IS NOT NULL AND ${table.completionVersion}>1 AND ${table.completionVersion}<=${table.version}) OR (${table.state}<>'DONE' AND ${table.completedAt} IS NULL AND ${table.completionVersion} IS NULL)`,
    ),
  ],
);

export const calendarEvent = business.table(
  "calendar_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    createdById: text("created_by_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    state: text("state").notNull().default("CONFIRMED"),
    version: integer("version").notNull().default(1),
    scheduleKind: text("schedule_kind").notNull(),
    timeZone: text("time_zone").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    startLocal: text("start_local"),
    endLocal: text("end_local"),
    startOffsetMinutes: integer("start_offset_minutes"),
    endOffsetMinutes: integer("end_offset_minutes"),
    startDate: date("start_date", { mode: "string" }),
    endDateExclusive: date("end_date_exclusive", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("calendar_event_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("calendar_event_timed_period_idx").on(
      table.workspaceId,
      table.startAt,
      table.endAt,
    ),
    index("calendar_event_all_day_period_idx").on(
      table.workspaceId,
      table.startDate,
      table.endDateExclusive,
    ),
    check(
      "calendar_event_title_nonempty",
      sql`length(trim(${table.title})) BETWEEN 1 AND 300`,
    ),
    check(
      "calendar_event_description_length",
      sql`length(${table.description}) <= 10000`,
    ),
    check(
      "calendar_event_state_check",
      sql`${table.state} IN ('CONFIRMED','CANCELED')`,
    ),
    check("calendar_event_version_positive", sql`${table.version} > 0`),
    check(
      "calendar_event_time_zone_length",
      sql`length(${table.timeZone}) BETWEEN 1 AND 100`,
    ),
    check(
      "calendar_event_schedule_check",
      sql`(${table.scheduleKind}='TIMED' AND ${table.startAt} IS NOT NULL AND ${table.endAt} IS NOT NULL AND ${table.startAt}<${table.endAt} AND ${table.startLocal} IS NOT NULL AND ${table.endLocal} IS NOT NULL AND ${table.startOffsetMinutes} IS NOT NULL AND ${table.endOffsetMinutes} IS NOT NULL AND ${table.startDate} IS NULL AND ${table.endDateExclusive} IS NULL) OR (${table.scheduleKind}='ALL_DAY' AND ${table.startDate} IS NOT NULL AND ${table.endDateExclusive} IS NOT NULL AND ${table.startDate}<${table.endDateExclusive} AND ${table.startAt} IS NULL AND ${table.endAt} IS NULL AND ${table.startLocal} IS NULL AND ${table.endLocal} IS NULL AND ${table.startOffsetMinutes} IS NULL AND ${table.endOffsetMinutes} IS NULL)`,
    ),
  ],
);

export const taskTransition = business.table(
  "task_transition",
  {
    workspaceId: uuid("workspace_id").notNull(),
    taskId: uuid("task_id").notNull(),
    version: integer("version").notNull(),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull(),
    actorId: text("actor_id").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "task_transition_pk",
      columns: [table.workspaceId, table.taskId, table.version],
    }),
    foreignKey({
      name: "task_transition_task_fk",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [task.workspaceId, task.id],
    }),
    check("task_transition_version_positive", sql`${table.version}>1`),
    check(
      "task_transition_state_check",
      sql`${table.fromState} IN ('TODO','IN_PROGRESS','ON_HOLD','DONE','CANCELED') AND ${table.toState} IN ('TODO','IN_PROGRESS','ON_HOLD','DONE','CANCELED') AND ${table.fromState}<>${table.toState}`,
    ),
  ],
);

export const taskResult = business.table(
  "task_result",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    taskId: uuid("task_id").notNull(),
    completionVersion: integer("completion_version").notNull(),
    captureId: uuid("capture_id").notNull(),
    createdById: text("created_by_id").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("task_result_completion_unique").on(
      table.workspaceId,
      table.taskId,
      table.completionVersion,
    ),
    unique("task_result_capture_unique").on(table.workspaceId, table.captureId),
    foreignKey({
      name: "task_result_task_fk",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [task.workspaceId, task.id],
    }),
    foreignKey({
      name: "task_result_capture_fk",
      columns: [table.workspaceId, table.captureId],
      foreignColumns: [capture.workspaceId, capture.id],
    }),
    foreignKey({
      name: "task_result_transition_fk",
      columns: [table.workspaceId, table.taskId, table.completionVersion],
      foreignColumns: [
        taskTransition.workspaceId,
        taskTransition.taskId,
        taskTransition.version,
      ],
    }),
    check("task_result_completion_positive", sql`${table.completionVersion}>0`),
  ],
);

export const extractionCandidate = business.table(
  "extraction_candidate",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    captureId: uuid("capture_id").notNull(),
    captureRevision: integer("capture_revision").notNull(),
    decisionKey: text("decision_key").notNull(),
    targetKind: text("target_kind").notNull(),
    payload: jsonb("payload").notNull(),
    state: text("state").notNull().default("CANDIDATE"),
    targetId: uuid("target_id"),
    createdById: text("created_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    unique("extraction_candidate_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    unique("extraction_candidate_source_decision_unique").on(
      table.workspaceId,
      table.captureId,
      table.captureRevision,
      table.decisionKey,
    ),
    index("extraction_candidate_capture_idx").on(
      table.workspaceId,
      table.captureId,
      table.captureRevision,
    ),
    foreignKey({
      name: "extraction_candidate_capture_revision_fk",
      columns: [table.workspaceId, table.captureId, table.captureRevision],
      foreignColumns: [
        captureRevision.workspaceId,
        captureRevision.captureId,
        captureRevision.revision,
      ],
    }),
    check("extraction_candidate_id_hash", sql`length(${table.id})=64`),
    check(
      "extraction_candidate_decision_hash",
      sql`length(${table.decisionKey})=64`,
    ),
    check(
      "extraction_candidate_kind_check",
      sql`${table.targetKind} IN ('task','event','thought_unit')`,
    ),
    check(
      "extraction_candidate_state_check",
      sql`${table.state} IN ('CANDIDATE','ACCEPTED','REJECTED')`,
    ),
    check(
      "extraction_candidate_target_check",
      sql`(${table.state}='ACCEPTED')=(${table.targetId} IS NOT NULL)`,
    ),
  ],
);

export const invitation = business.table(
  "invitation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenDigest: text("token_digest").notNull(),
    email: text("email").notNull(),
    issuerId: text("issuer_id").notNull(),
    claimedUserId: text("claimed_user_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("invitation_token_digest_unique").on(table.tokenDigest),
  ],
);

export const identityEvent = business.table("identity_event", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: text("actor_id"),
  targetId: text("target_id"),
  kind: text("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const transferRun = business.table(
  "transfer_run",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    actorId: text("actor_id").notNull(),
    kind: text("kind").notNull(),
    state: text("state").notNull(),
    bundleHash: text("bundle_hash").notNull(),
    storageKey: uuid("storage_key").notNull(),
    byteSize: integer("byte_size").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (table) => [
    unique("transfer_run_workspace_id_unique").on(table.workspaceId, table.id),
    index("transfer_run_actor_created_idx").on(
      table.workspaceId,
      table.actorId,
      table.createdAt,
    ),
    check("transfer_run_kind_check", sql`${table.kind} IN ('EXPORT','IMPORT')`),
    check(
      "transfer_run_state_check",
      sql`${table.state} IN ('READY','STAGED','APPLIED','PARTIAL')`,
    ),
    check(
      "transfer_run_state_kind_check",
      sql`(${table.kind}='EXPORT' AND ${table.state}='READY') OR (${table.kind}='IMPORT' AND ${table.state} IN ('STAGED','APPLIED','PARTIAL'))`,
    ),
    check("transfer_run_hash_check", sql`length(${table.bundleHash})=64`),
    check(
      "transfer_run_size_check",
      sql`${table.byteSize}>0 AND ${table.byteSize}<=33554432`,
    ),
    check(
      "transfer_run_expiry_check",
      sql`${table.expiresAt}>${table.createdAt}`,
    ),
  ],
);

export const transferRow = business.table(
  "transfer_row",
  {
    workspaceId: uuid("workspace_id").notNull(),
    runId: uuid("run_id").notNull(),
    recordKind: text("record_kind").notNull(),
    sourceId: uuid("source_id").notNull(),
    sourceRevision: integer("source_revision").notNull(),
    state: text("state").notNull().default("PENDING"),
    targetId: uuid("target_id"),
    reasonCode: text("reason_code"),
  },
  (table) => [
    primaryKey({
      name: "transfer_row_pk",
      columns: [
        table.workspaceId,
        table.runId,
        table.recordKind,
        table.sourceId,
      ],
    }),
    foreignKey({
      name: "transfer_row_run_fk",
      columns: [table.workspaceId, table.runId],
      foreignColumns: [transferRun.workspaceId, transferRun.id],
    }),
    check("transfer_row_revision_check", sql`${table.sourceRevision}>0`),
    check(
      "transfer_row_state_check",
      sql`${table.state} IN ('PENDING','IMPORTED','SKIPPED','FAILED')`,
    ),
  ],
);

export const transferOrigin = business.table(
  "transfer_origin",
  {
    workspaceId: uuid("workspace_id").notNull(),
    recordKind: text("record_kind").notNull(),
    sourceWorkspaceId: uuid("source_workspace_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    sourceRevision: integer("source_revision").notNull(),
    targetId: uuid("target_id").notNull(),
  },
  (table) => [
    primaryKey({
      name: "transfer_origin_pk",
      columns: [
        table.workspaceId,
        table.recordKind,
        table.sourceWorkspaceId,
        table.sourceId,
      ],
    }),
    check("transfer_origin_revision_check", sql`${table.sourceRevision}>0`),
  ],
);
