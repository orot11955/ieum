import { createHash, randomUUID } from "node:crypto";
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
import { IdentityService } from "../src/identity-service.js";
import { CommandCoordinator } from "../src/command-coordinator.js";
import { PreferenceCommands } from "../src/preferences.js";

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
  let authLock: Pool;
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

  async function closePool(pool: Pool | undefined): Promise<void> {
    if (!pool) return;
    let remaining = pool.totalCount;
    const disconnected =
      remaining === 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            pool.on("remove", () => {
              remaining--;
              if (remaining === 0) resolve();
            });
          });
    await pool.end();
    await disconnected;
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
    authLock = new Pool({
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
    await Promise.all([
      closePool(app),
      closePool(authLock),
      closePool(auth),
      closePool(delivery),
      closePool(admin),
    ]);
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
      ).toEqual(expect.arrayContaining(["workspace", "workspace_member"]));
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
    expect(
      tables.rows.filter((row) => row.relname.startsWith("workspace")),
    ).toHaveLength(2);
    expect(
      tables.rows
        .filter((row) => row.relname.startsWith("workspace"))
        .every(
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

  it("bootstraps once, accepts an invitation once, and blocks suspended access", async () => {
    const credentials = new Map<string, { id: string; password: string }>();
    const revoked: string[] = [];
    const identity = new IdentityService(
      app,
      {
        async registerOrVerify({ email, name, password }) {
          const existing = credentials.get(email);
          if (existing) {
            if (existing.password !== password) throw new Error("Bad password");
            return existing.id;
          }
          const id = randomUUID();
          credentials.set(email, { id, password });
          await admin.query(
            'INSERT INTO auth."user" (id, name, email) VALUES ($1, $2, $3)',
            [id, name, email],
          );
          return id;
        },
      },
      {
        async revokeAll(userId) {
          revoked.push(userId);
        },
      },
      authLock,
    );
    const preferences = new PreferenceCommands(
      new CommandCoordinator(identity),
    );
    const password = "be04 test password 1234";
    const bootstrap = { email: "owner@example.test", name: "Owner", password };
    const attempts = await Promise.allSettled([
      identity.bootstrap(bootstrap),
      identity.bootstrap(bootstrap),
    ]);
    expect(
      attempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const first = attempts.find((result) => result.status === "fulfilled");
    if (!first || first.status !== "fulfilled")
      throw new Error("Missing operator");
    const operator = first.value;
    expect(operator.operator).toBe(true);
    await expect(identity.bootstrap(bootstrap)).rejects.toMatchObject({
      code: "BOOTSTRAP_COMPLETE",
    });
    await expect(
      identity.bootstrap({ ...bootstrap, email: "other@example.test" }),
    ).rejects.toMatchObject({ code: "BOOTSTRAP_RESERVED" });
    await expect(
      identity.setUserSuspended(operator.userId, operator.userId, true),
    ).rejects.toMatchObject({ code: "LAST_OPERATOR" });

    const invitation = await identity.issueInvitation(
      operator.userId,
      "invitee@example.test",
    );
    const stored = await admin.query<{ token_digest: string }>(
      "SELECT token_digest FROM business.invitation",
    );
    expect(stored.rows[0]?.token_digest).not.toBe(invitation.token);
    const invited = await identity.acceptInvitation({
      token: invitation.token,
      name: "Invitee",
      password,
    });
    expect(invited.workspaceId).not.toBe(operator.workspaceId);
    expect(invited.operator).toBe(false);
    await expect(
      identity.acceptInvitation({
        token: invitation.token,
        name: "Invitee",
        password,
      }),
    ).rejects.toMatchObject({ code: "INVITATION_INVALID" });
    await expect(
      identity.issueInvitation(invited.userId, "third@example.test"),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect((await identity.getMe(invited.userId)).timeZone).toBe("UTC");
    expect(
      (
        await preferences.setTimeZone({
          actorId: invited.userId,
          idempotencyKey: "be04tz001",
          baseVersion: 1,
          timeZone: "Asia/Seoul",
        })
      ).response.timeZone,
    ).toBe("Asia/Seoul");
    await expect(
      preferences.setTimeZone({
        actorId: invited.userId,
        idempotencyKey: "be04tz002",
        baseVersion: 2,
        timeZone: "Not/AZone",
      }),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    await expect(
      withWorkspaceTransaction(app, invited.workspaceId, (client) =>
        client.query(
          "DELETE FROM business.workspace_member WHERE workspace_id = $1 AND user_id = $2",
          [invited.workspaceId, invited.userId],
        ),
      ),
    ).rejects.toMatchObject({ constraint: "workspace_owner_member_fk" });

    await identity.setUserSuspended(operator.userId, invited.userId, true);
    expect(revoked).toContain(invited.userId);
    await expect(identity.getMe(invited.userId)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await identity.setUserSuspended(operator.userId, invited.userId, false);
    expect((await identity.getMe(invited.userId)).workspaceId).toBe(
      invited.workspaceId,
    );
    const expired = await identity.issueInvitation(
      operator.userId,
      "expired@example.test",
    );
    await admin.query(
      "UPDATE business.invitation SET expires_at = now() - interval '1 second' WHERE token_digest = $1",
      [createHash("sha256").update(expired.token).digest("hex")],
    );
    await expect(
      identity.acceptInvitation({
        token: expired.token,
        name: "Expired",
        password,
      }),
    ).rejects.toMatchObject({ code: "INVITATION_INVALID" });

    await admin.query(
      "INSERT INTO business.instance_operator (user_id) VALUES ($1)",
      [invited.userId],
    );
    const concurrentPool = new Pool({
      connectionString: roleUrl(container.getConnectionUri(), "ieum_app_test"),
      max: 2,
    });
    try {
      const concurrentIdentity = new IdentityService(
        concurrentPool,
        {
          registerOrVerify: async () => {
            throw new Error("Unused");
          },
        },
        { revokeAll: async () => {} },
        authLock,
      );
      const changes = await Promise.allSettled([
        concurrentIdentity.setUserSuspended(
          operator.userId,
          invited.userId,
          true,
        ),
        concurrentIdentity.setUserSuspended(
          invited.userId,
          operator.userId,
          true,
        ),
      ]);
      expect(
        changes.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const deniedChange = changes.find(
        (result) => result.status === "rejected",
      );
      if (!deniedChange || deniedChange.status !== "rejected")
        throw new Error("Expected a protected last operator");
      expect(["ACCESS_DENIED", "LAST_OPERATOR"]).toContain(
        (deniedChange.reason as { code?: string }).code,
      );
      const activeOperators = await admin.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM business.instance_operator io
         JOIN business.user_access ua ON ua.user_id = io.user_id
         WHERE io.active AND ua.state = 'ACTIVE'`,
      );
      expect(activeOperators.rows[0]?.count).toBe("1");
    } finally {
      await concurrentPool.end();
    }
  });

  it("commits command effect, receipt, audit and outbox once across retries and races", async () => {
    const actorId = "be03-user-a";
    await withWorkspaceTransaction(app, workspaceA, async (client) => {
      await client.query(
        "INSERT INTO business.user_access (user_id, personal_workspace_id) VALUES ($1, $2)",
        [actorId, workspaceA],
      );
      await client.query(
        "INSERT INTO business.user_preference (user_id) VALUES ($1)",
        [actorId],
      );
    });
    const otherPool = new Pool({
      connectionString: roleUrl(container.getConnectionUri(), "ieum_app_test"),
      max: 2,
      connectionTimeoutMillis: 5_000,
    });
    const identityFor = (pool: Pool) =>
      new IdentityService(
        pool,
        {
          registerOrVerify: async () => {
            throw new Error("Unused");
          },
        },
        { revokeAll: async () => {} },
        authLock,
      );
    const identity = identityFor(app);
    const commands = new CommandCoordinator(identity);
    const otherCommands = new CommandCoordinator(identityFor(otherPool));
    const preferences = new PreferenceCommands(commands);
    const otherPreferences = new PreferenceCommands(otherCommands);
    try {
      const input = {
        actorId,
        idempotencyKey: "timezone-unique-01",
        baseVersion: 1,
        timeZone: "Asia/Seoul",
      };
      const [first, duplicate] = await Promise.all([
        preferences.setTimeZone(input),
        otherPreferences.setTimeZone(input),
      ]);
      expect([first.replayed, duplicate.replayed].sort()).toEqual([
        false,
        true,
      ]);
      expect(first.commandId).toBe(duplicate.commandId);
      expect(first.response).toEqual(duplicate.response);
      expect(first.response.version).toBe(2);
      const stored = await withWorkspaceTransaction(
        app,
        workspaceA,
        async (client) => {
          const receipt = await client.query(
            "SELECT command_id FROM business.command_receipt WHERE command_id = $1",
            [first.commandId],
          );
          const audit = await client.query(
            "SELECT command_id FROM business.command_audit WHERE command_id = $1",
            [first.commandId],
          );
          const preference = await client.query<{ version: number }>(
            "SELECT version FROM business.user_preference WHERE user_id = $1",
            [actorId],
          );
          return { receipt, audit, preference };
        },
      );
      expect(stored.receipt.rowCount).toBe(1);
      expect(stored.audit.rowCount).toBe(1);
      expect(stored.preference.rows[0]?.version).toBe(2);
      await expect(
        preferences.setTimeZone({ ...input, timeZone: "Asia/Tokyo" }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      await expect(
        preferences.setTimeZone({
          ...input,
          idempotencyKey: "timezone-stale-02",
        }),
      ).rejects.toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 2 });
      const second = await preferences.setTimeZone({
        ...input,
        idempotencyKey: "timezone-next-03",
        baseVersion: 2,
        timeZone: "Asia/Tokyo",
      });
      expect(second.response.version).toBe(3);
      expect((await preferences.setTimeZone(input)).response.version).toBe(2);

      await expect(
        commands.execute({
          actorId,
          kind: "test.audit_failure",
          idempotencyKey: "audit-failure-01",
          payload: { intendedVersion: 4 },
          apply: async (client) => {
            await client.query(
              "UPDATE business.user_preference SET version = version + 1 WHERE user_id = $1",
              [actorId],
            );
            return {
              response: { version: 4 },
              audit: {
                action: "",
                targetType: "user_preference",
                targetId: actorId,
                beforeVersion: 3,
                afterVersion: 4,
                changedFieldNames: ["version"],
              },
            };
          },
        }),
      ).rejects.toMatchObject({ constraint: "command_audit_action_nonempty" });
      const rolledBack = await withWorkspaceTransaction(
        app,
        workspaceA,
        async (client) => {
          const preference = await client.query<{ version: number }>(
            "SELECT version FROM business.user_preference WHERE user_id = $1",
            [actorId],
          );
          const receipt = await client.query(
            "SELECT 1 FROM business.command_receipt WHERE idempotency_key = 'audit-failure-01'",
          );
          return {
            version: preference.rows[0]?.version,
            receiptCount: receipt.rowCount,
          };
        },
      );
      expect(rolledBack).toEqual({ version: 3, receiptCount: 0 });

      const emitted = await commands.execute({
        actorId,
        kind: "test.outbox",
        idempotencyKey: "outbox-success-01",
        payload: { version: 4 },
        apply: async (client) => {
          await client.query(
            "UPDATE business.user_preference SET version = version + 1 WHERE user_id = $1",
            [actorId],
          );
          return {
            response: { version: 4 },
            audit: {
              action: "test.outbox",
              targetType: "user_preference",
              targetId: actorId,
              beforeVersion: 3,
              afterVersion: 4,
              changedFieldNames: ["version"],
            },
            outbox: [{ eventType: "test.event", payloadRef: { actorId } }],
          };
        },
      });
      const outbox = await withWorkspaceTransaction(app, workspaceA, (client) =>
        client.query(
          "SELECT id FROM business.command_outbox WHERE command_id = $1",
          [emitted.commandId],
        ),
      );
      expect(outbox.rowCount).toBe(1);
      const hidden = await withWorkspaceTransaction(app, workspaceB, (client) =>
        client.query(
          "SELECT id FROM business.command_outbox WHERE command_id = $1",
          [emitted.commandId],
        ),
      );
      expect(hidden.rowCount).toBe(0);
      await expect(
        withWorkspaceTransaction(app, workspaceA, (client) =>
          client.query(
            "UPDATE business.command_audit SET action = 'tampered' WHERE command_id = $1",
            [emitted.commandId],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });

      let arrivals = 0;
      let releaseDeadlock!: () => void;
      const deadlockBarrier = new Promise<void>((resolve) => {
        releaseDeadlock = resolve;
      });
      const makeDeadlockInput = (key: string) => ({
        actorId,
        kind: "test.deadlock_retry",
        idempotencyKey: key,
        payload: { key },
        apply: async (client: import("pg").PoolClient) => {
          arrivals++;
          if (arrivals === 2) releaseDeadlock();
          await deadlockBarrier;
          await client.query(
            "UPDATE business.workspace_member SET role = role WHERE workspace_id = $1 AND user_id = $2",
            [workspaceA, actorId],
          );
          return {
            response: { key },
            audit: {
              action: "test.deadlock_retry",
              targetType: "workspace_member",
              targetId: actorId,
              beforeVersion: null,
              afterVersion: null,
              changedFieldNames: [],
            },
          };
        },
      });
      const deadlockResults = await Promise.all([
        commands.execute(makeDeadlockInput("deadlock-first-01")),
        otherCommands.execute(makeDeadlockInput("deadlock-second-02")),
      ]);
      expect(deadlockResults.every((result) => !result.replayed)).toBe(true);
      expect(arrivals).toBe(3);

      let enteredEffect!: () => void;
      const effectStarted = new Promise<void>((resolve) => {
        enteredEffect = resolve;
      });
      let releaseEffect!: () => void;
      const effectMayCommit = new Promise<void>((resolve) => {
        releaseEffect = resolve;
      });
      const competingCommand = commands.execute({
        actorId,
        kind: "test.permission_race",
        idempotencyKey: "permission-race-01",
        payload: { version: 5 },
        apply: async (client) => {
          enteredEffect();
          await effectMayCommit;
          await client.query(
            "UPDATE business.user_preference SET version = version + 1 WHERE user_id = $1",
            [actorId],
          );
          return {
            response: { version: 5 },
            audit: {
              action: "test.permission_race",
              targetType: "user_preference",
              targetId: actorId,
              beforeVersion: 4,
              afterVersion: 5,
              changedFieldNames: ["version"],
            },
          };
        },
      });
      await effectStarted;
      let suspensionFinished = false;
      const suspension = admin
        .query(
          "UPDATE business.user_access SET state = 'SUSPENDED' WHERE user_id = $1",
          [actorId],
        )
        .then(() => {
          suspensionFinished = true;
        });
      try {
        await new Promise((resolve) => setTimeout(resolve, 25));
        expect(suspensionFinished).toBe(false);
      } finally {
        releaseEffect();
      }
      expect((await competingCommand).response.version).toBe(5);
      await suspension;
      await expect(preferences.setTimeZone(input)).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
    } finally {
      await otherPool.end();
    }
  }, 30_000);
});
