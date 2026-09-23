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
import { buildJudgementSnapshot } from "../src/judgement/snapshot-builder.js";
import { JudgementService } from "../src/judgement/judgement-service.js";
import { processJudgementJob } from "../src/judgement/judgement-worker.js";
import { KnowledgeService } from "../src/knowledge.js";
import { withWorkspaceTransaction } from "../src/platform/database/scope.js";
import {
  CONTEXT_MEMBERSHIP_QUEUE,
  JUDGEMENT_QUEUE,
  relayOutboxOnce,
} from "../src/platform/jobs/outbox.js";
import type { OutboxJobRef } from "../src/platform/jobs/outbox.js";
import { registerJudgementWorker } from "../src/platform/jobs/judgement.js";

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

describe("BE-12 scoped PostgreSQL snapshot builder", () => {
  let container: StartedPostgreSqlContainer;
  let admin: Pool, app: Pool, lock: Pool, relay: Pool;
  let boss: PgBoss, judgement: JudgementService;
  let captures: CaptureService, knowledge: KnowledgeService;
  const actorId = "be12-user";
  const workspaceId = randomUUID();
  let queryUnitId: string,
    queryCaptureId: string,
    candidateUnitId: string,
    contextId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer(image)
      .withDatabase("ieum_be12")
      .withUsername("postgres")
      .withPassword("be12_fixture_only")
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
    await installer.createQueue(JUDGEMENT_QUEUE);
    await installer.stop();
    await admin.query(queueGrantsSql);
    await admin.query(
      "CREATE ROLE ieum_be12_app LOGIN PASSWORD 'be12_fixture_only' IN ROLE ieum_application",
    );
    await admin.query(
      "CREATE ROLE ieum_be12_relay LOGIN PASSWORD 'be12_fixture_only' IN ROLE ieum_job_relay",
    );
    await admin.query(
      "INSERT INTO auth.\"user\" (id,name,email) VALUES ($1,'BE12','be12@example.test')",
      [actorId],
    );
    const url = new URL(base);
    url.username = "ieum_be12_app";
    url.password = "be12_fixture_only";
    app = new Pool({ connectionString: url.toString(), max: 4 });
    lock = new Pool({ connectionString: url.toString(), max: 1 });
    url.username = "ieum_be12_relay";
    relay = new Pool({ connectionString: url.toString(), max: 3 });
    boss = new PgBoss({
      connectionString: url.toString(),
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
    judgement = new JudgementService(app, commands);
    captures = new CaptureService(identity, commands);
    knowledge = new KnowledgeService(identity, commands);
    const queryCapture = await captures.create({
      actorId,
      workspaceId,
      idempotencyKey: "be12-query-capture",
      title: "질문",
      rawBody: "프로젝트 일정",
      sourceKind: "manual",
    });
    queryUnitId = queryCapture.response.unitId as string;
    queryCaptureId = queryCapture.response.id as string;
    candidateUnitId = (
      await captures.create({
        actorId,
        workspaceId,
        idempotencyKey: "be12-candidate-capture",
        title: "참고",
        rawBody: "프로젝트 일정 계획",
        sourceKind: "manual",
      })
    ).response.unitId as string;
    contextId = (
      await knowledge.create({
        actorId,
        workspaceId,
        idempotencyKey: "be12-context-create",
        name: "프로젝트",
        purpose: "일정",
        scope: "개인",
        kind: "PROJECT",
      })
    ).response.id as string;
    await knowledge.setMemberships({
      actorId,
      workspaceId,
      idempotencyKey: "be12-membership",
      unitId: candidateUnitId,
      baseVersion: 1,
      memberships: [{ contextId, role: "PRIMARY" }],
    });
  }, 120_000);

  afterAll(async () => {
    await boss?.stop();
    await Promise.allSettled([
      app?.end(),
      lock?.end(),
      relay?.end(),
      admin?.end(),
    ]);
    await container?.stop();
  });

  it("builds a replayable scoped snapshot and excludes the query itself", async () => {
    const built = await buildJudgementSnapshot(
      app,
      actorId,
      workspaceId,
      queryUnitId,
      1,
    );
    expect(built.snapshot.query.unitId).toBe(queryUnitId);
    expect(built.snapshot.manifest.eligibleUnits).toContainEqual({
      unitId: candidateUnitId,
      revision: 1,
    });
    expect(built.snapshot.manifest.eligibleContexts[0]?.contextId).toBe(
      contextId,
    );
    expect(
      built.snapshot.manifest.exclusions.some(
        (item) =>
          item.kind === "unit" &&
          item.id === queryUnitId &&
          item.reason === "query",
      ),
    ).toBe(true);
    expect(built.loadedCounts.units).toBe(2);
    expect(built.profileState).toBe("LAGGING");
    expect(built.snapshot.manifest.profileWatermark?.value).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("rejects a stale query revision and another workspace", async () => {
    await expect(
      buildJudgementSnapshot(app, actorId, workspaceId, queryUnitId, 2),
    ).rejects.toThrow("QUERY_UNAVAILABLE");
    await expect(
      buildJudgementSnapshot(app, actorId, randomUUID(), queryUnitId, 1),
    ).rejects.toThrow("QUERY_UNAVAILABLE");
  });

  it("persists a queued request, relays it, and replays an immutable observe run", async () => {
    const input = {
      actorId,
      workspaceId,
      unitId: queryUnitId,
      unitRevision: 1,
      idempotencyKey: "be12-run-request",
    };
    const requested = await judgement.request(input);
    const repeated = await judgement.request(input);
    expect(repeated.replayed).toBe(true);
    expect(repeated.response).toEqual(requested.response);
    const requestId = requested.response.requestId as string;
    expect(
      (await judgement.status(actorId, workspaceId, requestId)).state,
    ).toBe("QUEUED");
    expect(await relayOutboxOnce(relay, boss)).toBe(2);
    const jobs = await boss.fetch<OutboxJobRef>(JUDGEMENT_QUEUE, {
      batchSize: 1,
    });
    expect(jobs).toHaveLength(1);
    const job = jobs[0]!;
    const processed = await processJudgementJob(app, job.data);
    expect(processed.outcome).toBe("SUCCEEDED");
    expect(await processJudgementJob(app, job.data)).toEqual(processed);
    await boss.complete(JUDGEMENT_QUEUE, job.id, processed);
    const status = await judgement.status(actorId, workspaceId, requestId);
    expect(status).toMatchObject({
      state: "SUCCEEDED",
      retryCount: 0,
      inputHash: processed.inputHash,
      eligibleContextCount: 1,
      returnedContextCount: 1,
      profileState: "LAGGING",
    });
    const stored = await withWorkspaceTransaction(app, workspaceId, (client) =>
      client.query<{ n: number; raw_snapshot: unknown; result: unknown }>(
        `SELECT count(*)::int AS n,max(raw_snapshot::text)::jsonb AS raw_snapshot,
           max(result::text)::jsonb AS result
         FROM business.judgement_run WHERE workspace_id=$1 AND request_id=$2`,
        [workspaceId, requestId],
      ),
    );
    expect(stored.rows[0]?.n).toBe(1);
    expect(stored.rows[0]?.raw_snapshot).toBeTruthy();
    expect(stored.rows[0]?.result).toBeTruthy();
    expect(
      (await app.query("SELECT count(*)::int AS n FROM business.judgement_run"))
        .rows[0].n,
    ).toBe(0);
    await expect(
      relay.query("SELECT request_id FROM business.judgement_run"),
    ).rejects.toMatchObject({ code: "42501" });
    expect(
      await processJudgementJob(app, {
        workspaceId,
        outboxId: randomUUID(),
      }),
    ).toEqual({ outcome: "CANCELED" });
    expect(await judgement.replay(actorId, workspaceId, requestId)).toEqual({
      matches: true,
      inputHash: processed.inputHash,
    });
    await expect(
      judgement.status(actorId, randomUUID(), requestId),
    ).rejects.toThrow("REQUEST_NOT_FOUND");
  });

  it("cancels a queued run when its exact query source is archived", async () => {
    const requested = await judgement.request({
      actorId,
      workspaceId,
      unitId: queryUnitId,
      unitRevision: 1,
      idempotencyKey: "be12-stale-request",
    });
    await captures.archive({
      actorId,
      workspaceId,
      id: queryCaptureId,
      idempotencyKey: "be12-archive-query",
      baseVersion: 1,
    });
    expect(await relayOutboxOnce(relay, boss)).toBe(1);
    const job = (
      await boss.fetch<OutboxJobRef>(JUDGEMENT_QUEUE, { batchSize: 1 })
    )[0]!;
    expect(await processJudgementJob(app, job.data)).toEqual({
      outcome: "CANCELED",
    });
    await boss.complete(JUDGEMENT_QUEUE, job.id, { outcome: "CANCELED" });
    expect(
      (
        await judgement.status(
          actorId,
          workspaceId,
          requested.response.requestId as string,
        )
      ).state,
    ).toBe("CANCELED");
  });

  it("cancels a queued run after actor suspension and refuses an aborted job", async () => {
    const suspended = await judgement.request({
      actorId,
      workspaceId,
      unitId: candidateUnitId,
      unitRevision: 1,
      idempotencyKey: "be12-suspended-request",
    });
    expect(await relayOutboxOnce(relay, boss)).toBe(1);
    const suspendedJob = (
      await boss.fetch<OutboxJobRef>(JUDGEMENT_QUEUE, { batchSize: 1 })
    )[0]!;
    await admin.query(
      "UPDATE business.user_access SET state='SUSPENDED' WHERE user_id=$1",
      [actorId],
    );
    expect(await processJudgementJob(app, suspendedJob.data)).toEqual({
      outcome: "CANCELED",
    });
    await boss.complete(JUDGEMENT_QUEUE, suspendedJob.id, {
      outcome: "CANCELED",
    });
    await admin.query(
      "UPDATE business.user_access SET state='ACTIVE' WHERE user_id=$1",
      [actorId],
    );
    expect(
      (
        await judgement.status(
          actorId,
          workspaceId,
          suspended.response.requestId as string,
        )
      ).state,
    ).toBe("CANCELED");

    const aborted = await judgement.request({
      actorId,
      workspaceId,
      unitId: candidateUnitId,
      unitRevision: 1,
      idempotencyKey: "be12-aborted-request",
    });
    expect(await relayOutboxOnce(relay, boss)).toBe(1);
    const abortedJob = (
      await boss.fetch<OutboxJobRef>(JUDGEMENT_QUEUE, { batchSize: 1 })
    )[0]!;
    const controller = new AbortController();
    controller.abort();
    expect(
      await processJudgementJob(app, abortedJob.data, 0, controller.signal),
    ).toEqual({ outcome: "CANCELED" });
    await boss.complete(JUDGEMENT_QUEUE, abortedJob.id, {
      outcome: "CANCELED",
    });
    expect(
      (
        await judgement.status(
          actorId,
          workspaceId,
          aborted.response.requestId as string,
        )
      ).state,
    ).toBe("CANCELED");
  });

  it("consumes a committed request through the registered worker handler", async () => {
    const fresh = await captures.create({
      actorId,
      workspaceId,
      idempotencyKey: "be12-worker-capture",
      title: "새 질문",
      rawBody: "프로젝트 계획",
      sourceKind: "manual",
    });
    const requested = await judgement.request({
      actorId,
      workspaceId,
      unitId: fresh.response.unitId as string,
      unitRevision: 1,
      idempotencyKey: "be12-worker-request",
    });
    expect(await relayOutboxOnce(relay, boss)).toBe(1);
    await registerJudgementWorker(boss, app);
    let state = "QUEUED";
    for (let attempt = 0; attempt < 50; attempt++) {
      state = (
        await judgement.status(
          actorId,
          workspaceId,
          requested.response.requestId as string,
        )
      ).state;
      if (state === "SUCCEEDED") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(state).toBe("SUCCEEDED");
  });

  it("reports the candidate budget truncation in the saved status", async () => {
    for (let index = 0; index < 34; index++) {
      await knowledge.create({
        actorId,
        workspaceId,
        idempotencyKey: `be12-budget-context-${index}`,
        name: `프로젝트 일정 ${index}`,
        purpose: "후보 예산 검증",
        scope: "개인",
        kind: "PROJECT",
      });
    }
    const source = await captures.create({
      actorId,
      workspaceId,
      idempotencyKey: "be12-budget-query-source",
      title: "예산 질문",
      rawBody: "프로젝트 일정",
      sourceKind: "manual",
    });
    const requested = await judgement.request({
      actorId,
      workspaceId,
      unitId: source.response.unitId as string,
      unitRevision: 1,
      idempotencyKey: "be12-budget-request",
    });
    expect(await relayOutboxOnce(relay, boss)).toBe(1);
    const job = (
      await boss.fetch<OutboxJobRef>(JUDGEMENT_QUEUE, { batchSize: 1 })
    )[0]!;
    expect((await processJudgementJob(app, job.data)).outcome).toBe(
      "SUCCEEDED",
    );
    await boss.complete(JUDGEMENT_QUEUE, job.id);
    expect(
      await judgement.status(
        actorId,
        workspaceId,
        requested.response.requestId as string,
      ),
    ).toMatchObject({
      state: "SUCCEEDED",
      eligibleContextCount: 35,
      returnedContextCount: 32,
      truncated: true,
    });
  });
});
