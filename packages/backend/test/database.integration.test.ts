import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertApplicationDatabaseRole,
  withWorkspaceTransaction,
} from "../src/platform/database/scope.js";

const authMigrations = fileURLToPath(
  new URL("../../../db/migrations/auth", import.meta.url),
);
const businessMigrations = fileURLToPath(
  new URL("../../../db/migrations/business", import.meta.url),
);
const rolesSql = readFileSync(
  new URL("../../../db/admin/roles.sql", import.meta.url),
  "utf8",
);
const postgresImage =
  "postgres:18.4-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15";

describe("BE-03 PostgreSQL ownership and RLS", () => {
  let container: StartedPostgreSqlContainer;
  let admin: Pool;
  let app: Pool;
  let auth: Pool;
  let delivery: Pool;
  const workspaceA = randomUUID();
  const workspaceB = randomUUID();

  function roleUrl(base: string, role: string): string {
    const url = new URL(base);
    url.username = role;
    url.password = "be03_fixture_only";
    return url.toString();
  }

  async function applyAuthAndBusiness(pool: Pool): Promise<void> {
    await migrate(drizzle(pool), { migrationsFolder: authMigrations });
    await pool.query(rolesSql);
    await migrate(drizzle(pool), {
      migrationsFolder: businessMigrations,
      migrationsSchema: "drizzle_business",
    });
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer(postgresImage)
      .withDatabase("ieum_be03")
      .withUsername("postgres")
      .withPassword("be03_fixture_only")
      .start();
    admin = new Pool({ connectionString: container.getConnectionUri() });
    await migrate(drizzle(admin), { migrationsFolder: authMigrations });
    await admin.query(
      `INSERT INTO auth."user" (id, name, email) VALUES
       ('be03-user-a', 'Fixture A', 'a@example.test'),
       ('be03-user-b', 'Fixture B', 'b@example.test'),
       ('be03-user-c', 'Fixture C', 'c@example.test')`,
    );
    await admin.query(rolesSql);
    await migrate(drizzle(admin), {
      migrationsFolder: businessMigrations,
      migrationsSchema: "drizzle_business",
    });
    await admin.query(
      "CREATE ROLE ieum_app_test LOGIN PASSWORD 'be03_fixture_only' IN ROLE ieum_application",
    );
    await admin.query(
      "CREATE ROLE ieum_auth_test LOGIN PASSWORD 'be03_fixture_only' IN ROLE ieum_auth_runtime",
    );
    await admin.query(
      "CREATE ROLE ieum_delivery_test LOGIN PASSWORD 'be03_fixture_only' IN ROLE ieum_delivery",
    );
    const base = container.getConnectionUri();
    app = new Pool({
      connectionString: roleUrl(base, "ieum_app_test"),
      max: 1,
    });
    auth = new Pool({
      connectionString: roleUrl(base, "ieum_auth_test"),
      max: 1,
    });
    delivery = new Pool({
      connectionString: roleUrl(base, "ieum_delivery_test"),
      max: 1,
    });
    await withWorkspaceTransaction(app, workspaceA, async (client) => {
      await client.query(
        "INSERT INTO business.workspace (id, personal_owner_id) VALUES ($1, $2)",
        [workspaceA, "be03-user-a"],
      );
      await client.query(
        "INSERT INTO business.workspace_member (workspace_id, user_id) VALUES ($1, $2)",
        [workspaceA, "be03-user-a"],
      );
    });
    await withWorkspaceTransaction(app, workspaceB, async (client) => {
      await client.query(
        "INSERT INTO business.workspace (id, personal_owner_id) VALUES ($1, $2)",
        [workspaceB, "be03-user-b"],
      );
      await client.query(
        "INSERT INTO business.workspace_member (workspace_id, user_id) VALUES ($1, $2), ($1, $3)",
        [workspaceB, "be03-user-b", "be03-user-c"],
      );
    });
  }, 120_000);

  afterAll(async () => {
    await Promise.all([app?.end(), auth?.end(), delivery?.end(), admin?.end()]);
    await container?.stop();
  }, 120_000);

  it("keeps auth-only data while adding business schema and separately migrates a blank DB", async () => {
    const existing = await admin.query(
      "SELECT id FROM auth.\"user\" WHERE id = 'be03-user-a'",
    );
    expect(existing.rows).toHaveLength(1);
    await admin.query("CREATE DATABASE ieum_be03_fresh");
    const freshUrl = new URL(container.getConnectionUri());
    freshUrl.pathname = "/ieum_be03_fresh";
    const fresh = new Pool({ connectionString: freshUrl.toString() });
    try {
      await applyAuthAndBusiness(fresh);
      const tables = await fresh.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'business' ORDER BY table_name",
      );
      expect(
        tables.rows.map((row: { table_name: string }) => row.table_name),
      ).toEqual(["workspace", "workspace_member"]);
    } finally {
      await fresh.end();
    }
  }, 30_000);

  it("uses non-owner roles with forced RLS and separate auth/delivery privileges", async () => {
    const roles = await admin.query(
      "SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname IN ('ieum_application', 'ieum_auth_runtime', 'ieum_delivery', 'ieum_migrator') ORDER BY rolname",
    );
    expect(roles.rows).toHaveLength(4);
    expect(
      roles.rows.every(
        (row) => !row.rolsuper && !row.rolbypassrls && !row.rolcanlogin,
      ),
    ).toBe(true);
    const tables = await admin.query(
      "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, r.rolname AS owner FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_roles r ON r.oid = c.relowner WHERE n.nspname = 'business' AND c.relkind = 'r' ORDER BY c.relname",
    );
    expect(tables.rows).toHaveLength(2);
    expect(
      tables.rows.every(
        (row) =>
          row.relrowsecurity &&
          row.relforcerowsecurity &&
          row.owner === "ieum_migrator",
      ),
    ).toBe(true);
    const runtime = await app.query(
      "SELECT r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user",
    );
    expect(runtime.rows[0]).toMatchObject({
      rolsuper: false,
      rolbypassrls: false,
    });
    await expect(assertApplicationDatabaseRole(app)).resolves.toBeUndefined();
    await expect(assertApplicationDatabaseRole(admin)).rejects.toThrow(
      "Application database role is not isolated",
    );
    await expect(assertApplicationDatabaseRole(auth)).rejects.toThrow(
      "Application database role is not isolated",
    );
    await admin.query(
      "CREATE ROLE ieum_confused_test LOGIN PASSWORD 'be03_fixture_only' IN ROLE ieum_application, ieum_migrator",
    );
    const confused = new Pool({
      connectionString: roleUrl(
        container.getConnectionUri(),
        "ieum_confused_test",
      ),
    });
    try {
      await expect(assertApplicationDatabaseRole(confused)).rejects.toThrow(
        "Application database role is not isolated",
      );
    } finally {
      await confused.end();
    }
    await admin.query("CREATE ROLE ieum_other_bypass NOLOGIN BYPASSRLS");
    await admin.query(
      "CREATE ROLE ieum_bypass_test LOGIN PASSWORD 'be03_fixture_only' IN ROLE ieum_application, ieum_other_bypass",
    );
    const bypass = new Pool({
      connectionString: roleUrl(
        container.getConnectionUri(),
        "ieum_bypass_test",
      ),
    });
    try {
      await expect(assertApplicationDatabaseRole(bypass)).rejects.toThrow(
        "Application database role is not isolated",
      );
    } finally {
      await bypass.end();
    }
    expect(
      (await auth.query('SELECT id FROM auth."user" LIMIT 1')).rows,
    ).toHaveLength(1);
    await expect(
      auth.query("SELECT id FROM business.workspace"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      app.query("SELECT id FROM auth.account"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      delivery.query("SELECT id FROM business.workspace"),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("denies missing scope and cross-workspace SELECT, INSERT and UPDATE", async () => {
    expect(
      (await app.query("SELECT id FROM business.workspace")).rows,
    ).toHaveLength(0);
    await expect(
      app.query(
        "INSERT INTO business.workspace (id, personal_owner_id) VALUES ($1, $2)",
        [randomUUID(), "be03-user-c"],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await withWorkspaceTransaction(app, workspaceA, async (client) => {
      const visible = await client.query("SELECT id FROM business.workspace");
      expect(visible.rows.map((row) => row.id)).toEqual([workspaceA]);
      const members = await client.query(
        "SELECT workspace_id FROM business.workspace_member",
      );
      expect(members.rows.map((row) => row.workspace_id)).toEqual([workspaceA]);
      const changed = await client.query(
        "UPDATE business.workspace SET version = version + 1 WHERE id = $1 RETURNING id",
        [workspaceB],
      );
      expect(changed.rowCount).toBe(0);
      const changedMember = await client.query(
        "UPDATE business.workspace_member SET state = 'SUSPENDED' WHERE workspace_id = $1 RETURNING user_id",
        [workspaceB],
      );
      expect(changedMember.rowCount).toBe(0);
    });
    await expect(
      withWorkspaceTransaction(app, workspaceA, (client) =>
        client.query(
          "INSERT INTO business.workspace_member (workspace_id, user_id) VALUES ($1, $2)",
          [workspaceB, "be03-user-a"],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("rejects a cross-workspace owner link at the composite foreign key", async () => {
    await expect(
      withWorkspaceTransaction(app, workspaceA, async (client) => {
        await client.query(
          "UPDATE business.workspace SET personal_owner_id = $1 WHERE id = $2",
          ["be03-user-c", workspaceA],
        );
      }),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "workspace_owner_member_fk",
    });
    const owner = await withWorkspaceTransaction(
      app,
      workspaceA,
      async (client) =>
        client.query(
          "SELECT personal_owner_id FROM business.workspace WHERE id = $1",
          [workspaceA],
        ),
    );
    expect(owner.rows[0].personal_owner_id).toBe("be03-user-a");
  });

  it("does not leak a transaction-local scope through a one-connection pool", async () => {
    const first = await withWorkspaceTransaction(app, workspaceA, (client) =>
      client.query("SELECT id FROM business.workspace"),
    );
    expect(first.rows.map((row) => row.id)).toEqual([workspaceA]);
    expect(
      (await app.query("SELECT id FROM business.workspace")).rows,
    ).toHaveLength(0);
    const second = await withWorkspaceTransaction(app, workspaceB, (client) =>
      client.query("SELECT id FROM business.workspace"),
    );
    expect(second.rows.map((row) => row.id)).toEqual([workspaceB]);
  });
});
