import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
