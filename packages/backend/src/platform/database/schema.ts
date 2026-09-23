import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
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
