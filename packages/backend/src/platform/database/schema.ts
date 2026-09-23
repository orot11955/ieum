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
      sql`(${table.state} = 'SUPERSEDED') = (${table.supersededById} IS NOT NULL)`,
    ),
    check(
      "context_not_self_superseded",
      sql`${table.supersededById} IS NULL OR ${table.id} <> ${table.supersededById}`,
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
