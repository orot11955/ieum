import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CaptureService } from "../src/captures.js";
import { CommandCoordinator } from "../src/command-coordinator.js";
import { IdentityService } from "../src/identity-service.js";
import { KnowledgeService } from "../src/knowledge.js";
import { withWorkspaceTransaction } from "../src/platform/database/scope.js";
import { TaskService } from "../src/tasks.js";

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
describe("BE-09 task lifecycle, due types and result capture", () => {
  let container: StartedPostgreSqlContainer,
    admin: Pool,
    app: Pool,
    lock: Pool,
    tasks: TaskService,
    captures: CaptureService,
    knowledge: KnowledgeService;
  const actorId = "be09-user",
    workspaceId = randomUUID(),
    foreignWorkspaceId = randomUUID();
  let captureId: string, unitId: string, contextId: string, taskId: string;
  beforeAll(async () => {
    container = await new PostgreSqlContainer(image)
      .withDatabase("ieum_be09")
      .withUsername("postgres")
      .withPassword("be09_fixture_only")
      .start();
    admin = new Pool({ connectionString: container.getConnectionUri() });
    await migrate(drizzle(admin), { migrationsFolder: authMigrations });
    await admin.query(rolesSql);
    await migrate(drizzle(admin), {
      migrationsFolder: businessMigrations,
      migrationsSchema: "drizzle_business",
    });
    await admin.query(
      "INSERT INTO auth.\"user\" (id,name,email) VALUES ($1,'BE09','be09@example.test')",
      [actorId],
    );
    await admin.query(
      "CREATE ROLE ieum_be09_app LOGIN PASSWORD 'be09_fixture_only' IN ROLE ieum_application",
    );
    const url = new URL(container.getConnectionUri());
    url.username = "ieum_be09_app";
    url.password = "be09_fixture_only";
    app = new Pool({ connectionString: url.toString(), max: 4 });
    lock = new Pool({ connectionString: url.toString(), max: 1 });
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
      ),
      commands = new CommandCoordinator(identity);
    tasks = new TaskService(identity, commands);
    captures = new CaptureService(identity, commands);
    knowledge = new KnowledgeService(identity, commands);
    const capture = await captures.create({
      actorId,
      workspaceId,
      idempotencyKey: "be09-capture-01",
      title: "원본 메모",
      rawBody: "해야 할 일",
      sourceKind: "manual",
    });
    captureId = capture.response.id as string;
    unitId = capture.response.unitId as string;
    contextId = (
      await knowledge.create({
        actorId,
        workspaceId,
        idempotencyKey: "be09-context-01",
        name: "프로젝트",
        purpose: "진행",
        scope: "작업",
        kind: "PROJECT",
      })
    ).response.id as string;
    const task = await tasks.create({
      actorId,
      workspaceId,
      idempotencyKey: "be09-task-0001",
      title: "실험",
      description: "메모",
      due: { kind: "DATE", date: "2028-02-29" },
      contextId,
      origin: { unitId, revision: 1 },
    });
    taskId = task.response.id as string;
  }, 120_000);
  afterAll(async () => {
    await Promise.all([app?.end(), lock?.end(), admin?.end()]);
    await container?.stop();
  }, 120_000);

  it("preserves date-only and instant due values and rejects invalid dates", async () => {
    const detail = await tasks.get(actorId, workspaceId, taskId);
    expect(detail).toMatchObject({
      state: "TODO",
      due: { kind: "DATE", date: "2028-02-29" },
      origin: { kind: "EXPLICIT", unitId, unitRevision: 1 },
      contextId,
    });
    await expect(
      tasks.create({
        actorId,
        workspaceId,
        idempotencyKey: "be09-invalid-date",
        title: "잘못된 날짜",
        due: { kind: "DATE", date: "2027-02-29" },
      }),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    const instant = await tasks.create({
      actorId,
      workspaceId,
      idempotencyKey: "be09-instant-01",
      title: "정확한 기한",
      due: {
        kind: "INSTANT",
        at: "2027-03-14T01:30:00-05:00",
        timeZone: "America/New_York",
      },
    });
    expect(
      (await tasks.get(actorId, workspaceId, instant.response.id as string))
        .due,
    ).toEqual({
      kind: "INSTANT",
      at: "2027-03-14T06:30:00.000Z",
      timeZone: "America/New_York",
    });
    await expect(
      tasks.create({
        actorId,
        workspaceId,
        idempotencyKey: "be09-nozone-01",
        title: "모호한 기한",
        due: {
          kind: "INSTANT",
          at: "2027-03-14T01:30:00",
          timeZone: "America/New_York",
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    await expect(
      tasks.create({
        actorId,
        workspaceId,
        idempotencyKey: "be09-badzone-01",
        title: "잘못된 시간대",
        due: {
          kind: "INSTANT",
          at: "2027-03-14T06:30:00Z",
          timeZone: "Invalid/Zone",
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    const edited = await tasks.edit({
      actorId,
      workspaceId,
      id: taskId,
      idempotencyKey: "be09-edit-0001",
      baseVersion: 1,
      due: {
        kind: "INSTANT",
        at: "2027-03-14T06:30:00Z",
        timeZone: "America/New_York",
      },
    });
    expect(edited.response.version).toBe(2);
    expect((await tasks.get(actorId, workspaceId, taskId)).due).toEqual({
      kind: "INSTANT",
      at: "2027-03-14T06:30:00.000Z",
      timeZone: "America/New_York",
    });
  });

  it("serializes repeated completion, keeps history and never resends stale editor fields", async () => {
    const complete = {
      actorId,
      workspaceId,
      id: taskId,
      idempotencyKey: "be09-done-0001",
      baseVersion: 2,
      targetState: "DONE" as const,
    };
    const first = await tasks.transition(complete);
    expect(first.response).toMatchObject({
      state: "DONE",
      version: 3,
      completionVersion: 3,
    });
    expect(await tasks.transition(complete)).toMatchObject({
      replayed: true,
      commandId: first.commandId,
    });
    await expect(
      tasks.transition({ ...complete, idempotencyKey: "be09-done-0002" }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 3 });
    expect((await tasks.get(actorId, workspaceId, taskId)).due).toEqual({
      kind: "INSTANT",
      at: "2027-03-14T06:30:00.000Z",
      timeZone: "America/New_York",
    });
    const revised = await captures.revise({
      actorId,
      workspaceId,
      id: captureId,
      idempotencyKey: "be09-revise-source",
      baseVersion: 1,
      title: "수정 원본",
      rawBody: "더는 하지 않아도 됨",
    });
    expect(revised.response.version).toBe(2);
    expect((await tasks.get(actorId, workspaceId, taskId)).state).toBe("DONE");
    expect(
      (await tasks.get(actorId, workspaceId, taskId)).origin,
    ).toMatchObject({ unitId, unitRevision: 1 });
    const reopened = await tasks.transition({
      actorId,
      workspaceId,
      id: taskId,
      idempotencyKey: "be09-reopen-001",
      baseVersion: 3,
      targetState: "TODO",
    });
    expect(reopened.response).toMatchObject({
      state: "TODO",
      version: 4,
      completionVersion: null,
    });
    const held = await tasks.transition({
      actorId,
      workspaceId,
      id: taskId,
      idempotencyKey: "be09-hold-0001",
      baseVersion: 4,
      targetState: "ON_HOLD",
    });
    expect(held.response.state).toBe("ON_HOLD");
    expect(
      (await tasks.list(actorId, workspaceId, "ON_HOLD")).tasks.map(
        (row) => row.id,
      ),
    ).toContain(taskId);
    const resumed = await tasks.transition({
      actorId,
      workspaceId,
      id: taskId,
      idempotencyKey: "be09-resume-001",
      baseVersion: 5,
      targetState: "IN_PROGRESS",
    });
    expect(resumed.response.state).toBe("IN_PROGRESS");
    expect(
      (await tasks.get(actorId, workspaceId, taskId)).history.map(
        (h) => h.toState,
      ),
    ).toEqual(["DONE", "TODO", "ON_HOLD", "IN_PROGRESS"]);
  });

  it("links a completed task result to one new Capture atomically without copying raw text into receipts", async () => {
    const done = await tasks.transition({
      actorId,
      workspaceId,
      id: taskId,
      idempotencyKey: "be09-done-0003",
      baseVersion: 6,
      targetState: "DONE",
    });
    expect(done.response.completionVersion).toBe(7);
    const resultInput = {
      actorId,
      workspaceId,
      id: taskId,
      idempotencyKey: "be09-result-001",
      baseVersion: 7,
      title: "실험 결과",
      rawBody: "성공한 경험",
    };
    const result = await tasks.addResult(resultInput);
    expect(result.response).toMatchObject({ taskId, completionVersion: 7 });
    const resultCapture = await captures.get(
      actorId,
      workspaceId,
      result.response.captureId as string,
    );
    expect(resultCapture.rawBody).toBe("성공한 경험");
    expect(
      (await tasks.get(actorId, workspaceId, taskId)).results,
    ).toMatchObject([
      {
        id: result.response.id,
        completionVersion: 7,
        captureId: result.response.captureId,
      },
    ]);
    expect(await tasks.addResult(resultInput)).toMatchObject({
      replayed: true,
      commandId: result.commandId,
    });
    const corrected = await tasks.edit({
      actorId,
      workspaceId,
      id: taskId,
      idempotencyKey: "be09-done-edit-01",
      baseVersion: 7,
      title: "고친 할일 제목",
    });
    expect(corrected.response).toMatchObject({ version: 8, state: "DONE" });
    expect(
      (await tasks.get(actorId, workspaceId, taskId)).completionVersion,
    ).toBe(7);
    await expect(
      tasks.addResult({
        ...resultInput,
        baseVersion: 8,
        idempotencyKey: "be09-result-002",
      }),
    ).rejects.toMatchObject({ code: "TASK_RESULT_DUPLICATE" });
    const metadata = await withWorkspaceTransaction(
      app,
      workspaceId,
      (client) =>
        client.query(
          "SELECT response FROM business.command_receipt WHERE command_id=$1",
          [result.commandId],
        ),
    );
    expect(JSON.stringify(metadata.rows)).not.toContain("성공한 경험");
    await expect(
      withWorkspaceTransaction(app, workspaceId, (client) =>
        client.query(
          "UPDATE business.task_result SET capture_id=$1 WHERE id=$2",
          [captureId, result.response.id],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("rejects concurrent state changes and enforces state and workspace boundaries", async () => {
    const second = await tasks.create({
      actorId,
      workspaceId,
      idempotencyKey: "be09-task-0002",
      title: "동시성",
      due: { kind: "NONE" },
    });
    const id = second.response.id as string;
    const race = await Promise.allSettled([
      tasks.transition({
        actorId,
        workspaceId,
        id,
        idempotencyKey: "be09-race-0001",
        baseVersion: 1,
        targetState: "IN_PROGRESS",
      }),
      tasks.transition({
        actorId,
        workspaceId,
        id,
        idempotencyKey: "be09-race-0002",
        baseVersion: 1,
        targetState: "CANCELED",
      }),
    ]);
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(race.filter((r) => r.status === "rejected")).toMatchObject([
      { status: "rejected", reason: { code: "VERSION_CONFLICT" } },
    ]);
    await expect(
      tasks.transition({
        actorId,
        workspaceId,
        id,
        idempotencyKey: "be09-noop-0001",
        baseVersion: 2,
        targetState: (await tasks.get(actorId, workspaceId, id)).state,
      }),
    ).rejects.toMatchObject({ code: "TASK_TRANSITION_INVALID" });
    await expect(
      tasks.get(actorId, foreignWorkspaceId, id),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    const hidden = await withWorkspaceTransaction(
      app,
      foreignWorkspaceId,
      (client) =>
        client.query("SELECT id FROM business.task WHERE id=$1", [id]),
    );
    expect(hidden.rowCount).toBe(0);
    await expect(
      withWorkspaceTransaction(app, workspaceId, (client) =>
        client.query(
          "UPDATE business.task_transition SET to_state='DONE' WHERE task_id=$1",
          [taskId],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    const listing = await tasks.list(
      actorId,
      workspaceId,
      "DONE",
      undefined,
      1,
    );
    expect(listing.tasks).toMatchObject([{ id: taskId, state: "DONE" }]);
  });

  it("saves one result Capture under concurrent submissions and rolls back invalid input", async () => {
    const created = await tasks.create({
      actorId,
      workspaceId,
      idempotencyKey: "be09-race-result-task",
      title: "결과 경쟁",
      due: { kind: "NONE" },
    });
    const id = created.response.id as string;
    await tasks.transition({
      actorId,
      workspaceId,
      id,
      idempotencyKey: "be09-race-result-done",
      baseVersion: 1,
      targetState: "DONE",
    });
    await expect(
      tasks.addResult({
        actorId,
        workspaceId,
        id,
        idempotencyKey: "be09-invalid-result",
        baseVersion: 2,
        title: "잘못된 결과",
        rawBody: "\uD800",
      }),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    const attempts = await Promise.allSettled([
      tasks.addResult({
        actorId,
        workspaceId,
        id,
        idempotencyKey: "be09-race-result-01",
        baseVersion: 2,
        title: "결과",
        rawBody: "첫 결과",
      }),
      tasks.addResult({
        actorId,
        workspaceId,
        id,
        idempotencyKey: "be09-race-result-02",
        baseVersion: 2,
        title: "결과",
        rawBody: "첫 결과",
      }),
    ]);
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((r) => r.status === "rejected")).toMatchObject([
      { status: "rejected", reason: { code: "TASK_RESULT_DUPLICATE" } },
    ]);
    expect((await tasks.get(actorId, workspaceId, id)).results).toHaveLength(1);
    const captures = await withWorkspaceTransaction(
      app,
      workspaceId,
      (client) =>
        client.query(
          "SELECT id FROM business.capture WHERE workspace_id=$1 AND source_kind='manual' AND source_key=$2",
          [workspaceId, `task-result:${id}:2`],
        ),
    );
    expect(captures.rowCount).toBe(1);
  });
});
