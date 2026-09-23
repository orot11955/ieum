import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CaptureService } from "../src/captures.js";
import { CommandCoordinator } from "../src/command-coordinator.js";
import { IdentityService } from "../src/identity-service.js";
import { KnowledgeService } from "../src/knowledge.js";
import {
  assertApplicationDatabaseRole,
  withWorkspaceTransaction,
} from "../src/platform/database/scope.js";
import {
  CONTEXT_MEMBERSHIP_QUEUE,
  applyContextInvalidation,
  assertJobRelayDatabaseRole,
  getOutboxJobState,
  registerContextMembershipWorker,
  relayOutboxOnce,
} from "../src/platform/jobs/outbox.js";
import type { OutboxJobRef } from "../src/platform/jobs/outbox.js";

const image =
  "postgres:18.4-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15";
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
const queueGrantsSql = readFileSync(
  new URL("../../../db/admin/queue-grants.sql", import.meta.url),
  "utf8",
);

describe("BE-06 transactional outbox relay and scoped job", () => {
  let container: StartedPostgreSqlContainer,
    admin: Pool,
    app: Pool,
    relay: Pool,
    lock: Pool,
    boss: PgBoss,
    knowledge: KnowledgeService,
    captures: CaptureService;
  const actorId = "be06-user",
    workspaceId = randomUUID();
  let unitId: string, contextId: string;
  beforeAll(async () => {
    container = await new PostgreSqlContainer(image)
      .withDatabase("ieum_be06")
      .withUsername("postgres")
      .withPassword("be06_fixture_only")
      .start();
    const base = container.getConnectionUri();
    admin = new Pool({ connectionString: base });
    await migrate(drizzle(admin), { migrationsFolder: authMigrations });
    await admin.query(rolesSql);
    await migrate(drizzle(admin), {
      migrationsFolder: businessMigrations,
      migrationsSchema: "drizzle_business",
    });
    const installer = new PgBoss({
      connectionString: base,
      schedule: false,
      supervise: false,
    });
    await installer.start();
    await installer.createQueue(CONTEXT_MEMBERSHIP_QUEUE);
    await installer.stop();
    await admin.query(queueGrantsSql);
    await admin.query(
      "CREATE ROLE ieum_be06_app LOGIN PASSWORD 'be06_fixture_only' IN ROLE ieum_application",
    );
    await admin.query(
      "CREATE ROLE ieum_be06_relay LOGIN PASSWORD 'be06_fixture_only' IN ROLE ieum_job_relay",
    );
    await admin.query(
      "CREATE ROLE ieum_be06_dual LOGIN PASSWORD 'be06_fixture_only' IN ROLE ieum_application, ieum_job_relay",
    );
    await admin.query(
      "INSERT INTO auth.\"user\" (id,name,email) VALUES ($1,'BE06','be06@example.test')",
      [actorId],
    );
    const roleUrl = (role: string) => {
      const url = new URL(base);
      url.username = role;
      url.password = "be06_fixture_only";
      return url.toString();
    };
    app = new Pool({ connectionString: roleUrl("ieum_be06_app"), max: 4 });
    lock = new Pool({ connectionString: roleUrl("ieum_be06_app"), max: 1 });
    relay = new Pool({ connectionString: roleUrl("ieum_be06_relay"), max: 3 });
    await assertJobRelayDatabaseRole(relay);
    boss = new PgBoss({
      connectionString: roleUrl("ieum_be06_relay"),
      migrate: false,
      schedule: false,
      supervise: false,
    });
    await boss.start();
    await withWorkspaceTransaction(app, workspaceId, async (client) => {
      await client.query(
        "INSERT INTO business.workspace (id,personal_owner_id) VALUES ($1,$2)",
        [workspaceId, actorId],
      );
      await client.query(
        "INSERT INTO business.workspace_member (workspace_id,user_id) VALUES ($1,$2)",
        [workspaceId, actorId],
      );
      await client.query(
        "INSERT INTO business.user_access (user_id,personal_workspace_id) VALUES ($1,$2)",
        [actorId, workspaceId],
      );
      await client.query(
        "INSERT INTO business.user_preference (user_id) VALUES ($1)",
        [actorId],
      );
    });
    const identity = new IdentityService(
      app,
      { registerOrVerify: async () => actorId },
      { revokeAll: async () => {} },
      lock,
    );
    const commands = new CommandCoordinator(identity);
    knowledge = new KnowledgeService(identity, commands);
    captures = new CaptureService(identity, commands);
    unitId = (
      await captures.create({
        actorId,
        workspaceId,
        idempotencyKey: "be06-capture-01",
        title: "원본",
        rawBody: "테스트",
        sourceKind: "manual",
      })
    ).response.unitId as string;
    contextId = (
      await knowledge.create({
        actorId,
        workspaceId,
        idempotencyKey: "be06-context-01",
        name: "맥락",
        purpose: "검증",
        scope: "개인",
        kind: "PROJECT",
      })
    ).response.id as string;
  }, 120_000);
  afterAll(async () => {
    await boss?.stop();
    await Promise.allSettled([
      app?.end(),
      relay?.end(),
      lock?.end(),
      admin?.end(),
    ]);
    await container?.stop();
  });

  it("rejects a login that combines application and queue relay privileges", async () => {
    const dualUrl = new URL(container.getConnectionUri());
    dualUrl.username = "ieum_be06_dual";
    dualUrl.password = "be06_fixture_only";
    const dual = new Pool({ connectionString: dualUrl.toString() });
    try {
      await expect(assertApplicationDatabaseRole(dual)).rejects.toThrow(
        "Application database role is not isolated",
      );
      await expect(assertJobRelayDatabaseRole(dual)).rejects.toThrow(
        "Job relay database role is not isolated",
      );
    } finally {
      await dual.end();
    }
  });

  it("recovers a committed event after a worker restart and applies a duplicate only once", async () => {
    const changed = await knowledge.setMemberships({
      actorId,
      workspaceId,
      idempotencyKey: "be06-membership-01",
      unitId,
      baseVersion: 1,
      memberships: [{ contextId, role: "PRIMARY" }],
    });
    expect(changed.response.membershipVersion).toBe(2);
    const pending = await withWorkspaceTransaction(app, workspaceId, (client) =>
      client.query(
        "SELECT count(*)::int AS n FROM business.command_outbox WHERE event_type='context.membership.changed'",
      ),
    );
    expect(pending.rows[0].n).toBe(1);
    const outbox = await withWorkspaceTransaction(app, workspaceId, (client) =>
      client.query<{ id: string }>(
        "SELECT id FROM business.command_outbox WHERE event_type='context.membership.changed'",
      ),
    );
    const outboxId = outbox.rows[0]!.id;
    await expect(
      getOutboxJobState(app, boss, actorId, randomUUID(), outboxId),
    ).rejects.toThrow("JOB_NOT_FOUND");
    expect(
      await getOutboxJobState(app, boss, actorId, workspaceId, outboxId),
    ).toEqual({ state: "QUEUED", retryCount: 0 });
    expect(await relayOutboxOnce(relay, boss)).toBe(1);
    expect(
      (await getOutboxJobState(app, boss, actorId, workspaceId, outboxId))
        .state,
    ).toBe("QUEUED");
    expect(await relayOutboxOnce(relay, boss)).toBe(0);
    await boss.stop();
    boss = new PgBoss({
      connectionString: new URL(relay.options.connectionString!).toString(),
      migrate: false,
      schedule: false,
      supervise: false,
    });
    await boss.start();
    const jobs = await boss.fetch<OutboxJobRef>(CONTEXT_MEMBERSHIP_QUEUE, {
      batchSize: 1,
    });
    expect(jobs).toHaveLength(1);
    const job = jobs[0]!;
    expect(
      (await getOutboxJobState(app, boss, actorId, workspaceId, outboxId))
        .state,
    ).toBe("RUNNING");
    expect(await applyContextInvalidation(app, job.data)).toEqual({
      outcome: "SUCCEEDED",
      updated: 1,
    });
    expect(await applyContextInvalidation(app, job.data)).toEqual({
      outcome: "SUCCEEDED",
      updated: 0,
    });
    await boss.complete(CONTEXT_MEMBERSHIP_QUEUE, job.id, {
      outcome: "SUCCEEDED",
    });
    expect(
      (await getOutboxJobState(app, boss, actorId, workspaceId, outboxId))
        .state,
    ).toBe("SUCCEEDED");
    const watermark = await withWorkspaceTransaction(
      app,
      workspaceId,
      (client) =>
        client.query(
          "SELECT membership_revision FROM business.context_profile_invalidation WHERE context_id=$1",
          [contextId],
        ),
    );
    expect(watermark.rows[0].membership_revision).toBe(2);
  });

  it("keeps queue send and dispatch receipt atomic and refuses application-role enqueue", async () => {
    const initial = await relayOutboxOnce(relay, boss);
    expect(initial).toBe(0);
    await expect(assertJobRelayDatabaseRole(app)).rejects.toThrow(
      "not isolated",
    );
    await expect(
      relay.query("SELECT id FROM business.context"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(app.query("SELECT id FROM pgboss.job")).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      withWorkspaceTransaction(app, workspaceId, (client) =>
        boss.send(
          CONTEXT_MEMBERSHIP_QUEUE,
          { outboxId: randomUUID(), workspaceId },
          {
            db: {
              executeSql: (text: string, values: unknown[]) =>
                client.query(text, values),
            },
          },
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    const client = await relay.connect();
    try {
      await client.query("BEGIN");
      const id = await boss.send(
        CONTEXT_MEMBERSHIP_QUEUE,
        { outboxId: randomUUID(), workspaceId },
        {
          db: {
            executeSql: (text: string, values: unknown[]) =>
              client.query(text, values),
          },
        },
      );
      expect(id).toBeTruthy();
      await client.query("ROLLBACK");
      expect(
        await boss.fetch(CONTEXT_MEMBERSHIP_QUEUE, { batchSize: 1 }),
      ).toHaveLength(0);
    } finally {
      client.release();
    }
  });

  it("cancels a missing source and an actor suspended after enqueue", async () => {
    const fakeContextId = randomUUID();
    const fakeOutbox = await withWorkspaceTransaction(
      app,
      workspaceId,
      (client) =>
        client.query<{ id: string }>(
          `INSERT INTO business.command_outbox (workspace_id,command_id,event_type,payload_ref)
         SELECT workspace_id,command_id,'context.membership.changed',$2::jsonb
         FROM business.command_receipt WHERE workspace_id=$1 LIMIT 1 RETURNING id`,
          [
            workspaceId,
            JSON.stringify({ unitId, contextIds: [fakeContextId] }),
          ],
        ),
    );
    expect(fakeOutbox.rows).toHaveLength(1);
    expect(await relayOutboxOnce(relay, boss)).toBe(1);
    const missing = (
      await boss.fetch<OutboxJobRef>(CONTEXT_MEMBERSHIP_QUEUE, { batchSize: 1 })
    )[0]!;
    expect(await applyContextInvalidation(app, missing.data)).toEqual({
      outcome: "CANCELED_SOURCE",
      updated: 0,
    });
    await boss.complete(CONTEXT_MEMBERSHIP_QUEUE, missing.id, {
      outcome: "CANCELED_SOURCE",
    });
    expect(
      (
        await getOutboxJobState(
          app,
          boss,
          actorId,
          workspaceId,
          fakeOutbox.rows[0]!.id,
        )
      ).state,
    ).toBe("CANCELED");

    await knowledge.setMemberships({
      actorId,
      workspaceId,
      idempotencyKey: "be06-membership-02",
      unitId,
      baseVersion: 2,
      memberships: [],
    });
    expect(await relayOutboxOnce(relay, boss)).toBe(1);
    const stopped = (
      await boss.fetch<OutboxJobRef>(CONTEXT_MEMBERSHIP_QUEUE, { batchSize: 1 })
    )[0]!;
    await admin.query(
      "UPDATE business.user_access SET state='SUSPENDED' WHERE user_id=$1",
      [actorId],
    );
    expect(await applyContextInvalidation(app, stopped.data)).toEqual({
      outcome: "CANCELED_ACCESS",
      updated: 0,
    });
    await boss.complete(CONTEXT_MEMBERSHIP_QUEUE, stopped.id, {
      outcome: "CANCELED_ACCESS",
    });
    const watermark = await withWorkspaceTransaction(
      app,
      workspaceId,
      (client) =>
        client.query(
          "SELECT membership_revision FROM business.context_profile_invalidation WHERE context_id=$1",
          [contextId],
        ),
    );
    expect(watermark.rows[0].membership_revision).toBe(2);
    await admin.query(
      "UPDATE business.user_access SET state='ACTIVE' WHERE user_id=$1",
      [actorId],
    );
    expect(
      (
        await getOutboxJobState(
          app,
          boss,
          actorId,
          workspaceId,
          stopped.data.outboxId,
        )
      ).state,
    ).toBe("CANCELED");
    const aborted = new AbortController();
    aborted.abort();
    expect(
      await applyContextInvalidation(app, stopped.data, aborted.signal),
    ).toEqual({ outcome: "CANCELED_JOB", updated: 0 });
    const afterAbort = await withWorkspaceTransaction(
      app,
      workspaceId,
      (client) =>
        client.query(
          "SELECT membership_revision FROM business.context_profile_invalidation WHERE context_id=$1",
          [contextId],
        ),
    );
    expect(afterAbort.rows[0].membership_revision).toBe(2);
  });

  it("keeps malformed outbox references out of profile state and enters bounded retry", async () => {
    const bad = await withWorkspaceTransaction(app, workspaceId, (client) =>
      client.query<{ id: string }>(
        `INSERT INTO business.command_outbox (workspace_id,command_id,event_type,payload_ref)
         SELECT workspace_id,command_id,'context.membership.changed',$2::jsonb
         FROM business.command_receipt WHERE workspace_id=$1 LIMIT 1 RETURNING id`,
        [workspaceId, JSON.stringify({ contextIds: "not-an-array" })],
      ),
    );
    expect(await relayOutboxOnce(relay, boss)).toBe(1);
    const poison = (
      await boss.fetch<OutboxJobRef>(CONTEXT_MEMBERSHIP_QUEUE, { batchSize: 1 })
    )[0]!;
    await expect(applyContextInvalidation(app, poison.data)).rejects.toThrow(
      "INVALID_OUTBOX_PAYLOAD",
    );
    await boss.fail(CONTEXT_MEMBERSHIP_QUEUE, poison.id, {
      code: "INVALID_OUTBOX_PAYLOAD",
    });
    expect(
      (
        await getOutboxJobState(
          app,
          boss,
          actorId,
          workspaceId,
          bad.rows[0]!.id,
        )
      ).state,
    ).toBe("QUEUED");
    expect(
      await boss.getJobById(CONTEXT_MEMBERSHIP_QUEUE, poison.id),
    ).toMatchObject({ state: "retry", retryLimit: 3 });
    for (let attempt = 0; attempt < 3; attempt++) {
      const retry = (
        await boss.fetch<OutboxJobRef>(CONTEXT_MEMBERSHIP_QUEUE, {
          batchSize: 1,
          ignoreStartAfter: true,
        })
      )[0]!;
      expect(retry.id).toBe(poison.id);
      await expect(applyContextInvalidation(app, retry.data)).rejects.toThrow(
        "INVALID_OUTBOX_PAYLOAD",
      );
      await boss.fail(CONTEXT_MEMBERSHIP_QUEUE, retry.id, {
        code: "INVALID_OUTBOX_PAYLOAD",
      });
    }
    expect(
      (
        await getOutboxJobState(
          app,
          boss,
          actorId,
          workspaceId,
          bad.rows[0]!.id,
        )
      ).state,
    ).toBe("FAILED");
  });

  it("does not turn a canceled job into success on a late completion", async () => {
    const id = await boss.send(CONTEXT_MEMBERSHIP_QUEUE, {
      outboxId: randomUUID(),
      workspaceId,
    });
    expect(id).toBeTruthy();
    await boss.cancel(CONTEXT_MEMBERSHIP_QUEUE, id!);
    await boss.complete(CONTEXT_MEMBERSHIP_QUEUE, id!, {
      outcome: "SUCCEEDED",
    });
    expect(await boss.getJobById(CONTEXT_MEMBERSHIP_QUEUE, id!)).toMatchObject({
      state: "cancelled",
    });
  });

  it("retries an expired lease under the bounded retry policy", async () => {
    const id = await boss.send(
      CONTEXT_MEMBERSHIP_QUEUE,
      { outboxId: randomUUID(), workspaceId },
      { expireInSeconds: 1, retryLimit: 1, retryDelay: 1 },
    );
    expect(id).toBeTruthy();
    const claimed = (
      await boss.fetch(CONTEXT_MEMBERSHIP_QUEUE, { batchSize: 1 })
    )[0];
    expect(claimed?.id).toBe(id);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await boss.supervise();
    expect(await boss.getJobById(CONTEXT_MEMBERSHIP_QUEUE, id!)).toMatchObject({
      state: "retry",
    });
    await boss.cancel(CONTEXT_MEMBERSHIP_QUEUE, id!);
  });

  it("runs the registered worker handler against a real committed membership change", async () => {
    const change = await knowledge.setMemberships({
      actorId,
      workspaceId,
      idempotencyKey: "be06-membership-03",
      unitId,
      baseVersion: 3,
      memberships: [{ contextId, role: "PRIMARY" }],
    });
    const outbox = await withWorkspaceTransaction(app, workspaceId, (client) =>
      client.query<{ id: string }>(
        "SELECT id FROM business.command_outbox WHERE command_id=$1",
        [change.commandId],
      ),
    );
    const outboxId = outbox.rows[0]!.id;
    expect(await relayOutboxOnce(relay, boss)).toBe(1);
    await registerContextMembershipWorker(boss, app);
    try {
      let state = "QUEUED";
      for (let attempt = 0; attempt < 50; attempt++) {
        state = (
          await getOutboxJobState(app, boss, actorId, workspaceId, outboxId)
        ).state;
        if (state === "SUCCEEDED") break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(state).toBe("SUCCEEDED");
      const watermark = await withWorkspaceTransaction(
        app,
        workspaceId,
        (client) =>
          client.query(
            "SELECT membership_revision FROM business.context_profile_invalidation WHERE context_id=$1",
            [contextId],
          ),
      );
      expect(watermark.rows[0].membership_revision).toBe(4);
    } finally {
      await boss.offWork(CONTEXT_MEMBERSHIP_QUEUE);
    }
  });
});
