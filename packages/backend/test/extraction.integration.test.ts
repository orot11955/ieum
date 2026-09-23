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
import { ExtractionService } from "../src/extraction/extraction-service.js";
import type { ExtractionParser } from "../src/extraction/parser.js";
import { IdentityService } from "../src/identity-service.js";
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

describe("BE-14 extraction candidates and explicit commands", () => {
  let container: StartedPostgreSqlContainer;
  let admin: Pool, app: Pool, lock: Pool;
  let identity: IdentityService,
    captures: CaptureService,
    extraction: ExtractionService,
    tasks: TaskService;
  const actorId = "be14-owner";
  const workspaceId = randomUUID();
  let captureId: string;
  let taskId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer(image)
      .withDatabase("ieum_be14")
      .withUsername("postgres")
      .withPassword("be14_fixture_only")
      .start();
    const base = container.getConnectionUri();
    admin = new Pool({ connectionString: base });
    await migrate(drizzle(admin), { migrationsFolder: authMigrations });
    await admin.query(rolesSql);
    await migrate(drizzle(admin), {
      migrationsFolder: businessMigrations,
      migrationsSchema: "drizzle_business",
    });
    await admin.query(
      "CREATE ROLE ieum_be14_app LOGIN PASSWORD 'be14_fixture_only' IN ROLE ieum_application",
    );
    await admin.query(
      "INSERT INTO auth.\"user\" (id,name,email) VALUES ($1,'BE14','be14@example.test')",
      [actorId],
    );
    const url = new URL(base);
    url.username = "ieum_be14_app";
    url.password = "be14_fixture_only";
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
    identity = new IdentityService(
      app,
      { registerOrVerify: async () => actorId },
      { revokeAll: async () => {} },
      lock,
    );
    const commands = new CommandCoordinator(identity);
    captures = new CaptureService(identity, commands);
    extraction = new ExtractionService(identity, commands);
    tasks = new TaskService(identity, commands);
    const capture = await captures.create({
      actorId,
      workspaceId,
      idempotencyKey: "be14-capture-one",
      title: "회의 기록",
      rawBody:
        "TODO: 보고서 정리\nEVENT: 2026-10-01 09:00 팀 회의\nNOTE: 회의 맥락 정리",
      sourceKind: "manual",
    });
    captureId = capture.response.id as string;
  }, 120_000);

  afterAll(async () => {
    await Promise.allSettled([app?.end(), lock?.end(), admin?.end()]);
    await container?.stop();
  });

  it("keeps candidates separate until confirmation and records one task with immutable source", async () => {
    const generated = await extraction.generate({
      actorId,
      workspaceId,
      captureId,
      idempotencyKey: "be14-generate-one",
    });
    const ids = generated.response.candidateIds as string[];
    expect(ids).toHaveLength(3);
    const task = await extraction.get(actorId, workspaceId, ids[0]!);
    expect(task).toMatchObject({
      state: "CANDIDATE",
      sourceStale: false,
      proposal: { targetKind: "task", unresolvedFields: [] },
    });
    const before = await withWorkspaceTransaction(app, workspaceId, (client) =>
      client.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM business.task WHERE workspace_id=$1",
        [workspaceId],
      ),
    );
    expect(before.rows[0]!.n).toBe(0);
    const accepted = await extraction.decide({
      actorId,
      workspaceId,
      proposalId: ids[0]!,
      expectedCaptureRevision: 1,
      decision: "ACCEPTED",
      title: "보고서 정리",
      body: null,
      idempotencyKey: "be14-accept-task",
    });
    expect(accepted.response).toMatchObject({
      state: "ACCEPTED",
      targetKind: "task",
    });
    taskId = accepted.response.targetId as string;
    const replay = await extraction.decide({
      actorId,
      workspaceId,
      proposalId: ids[0]!,
      expectedCaptureRevision: 1,
      decision: "ACCEPTED",
      title: "보고서 정리",
      body: null,
      idempotencyKey: "be14-accept-task",
    });
    expect(replay.replayed).toBe(true);
    const taskView = await tasks.get(
      actorId,
      workspaceId,
      accepted.response.targetId as string,
    );
    expect(taskView).toMatchObject({
      state: "TODO",
      title: "보고서 정리",
      origin: {
        kind: "EXPLICIT",
        unitId: accepted.response.sourceUnitId,
        unitRevision: 1,
      },
    });
    await expect(
      extraction.decide({
        actorId,
        workspaceId,
        proposalId: ids[0]!,
        expectedCaptureRevision: 1,
        decision: "ACCEPTED",
        title: "다른 제목",
        idempotencyKey: "be14-duplicate-task",
      }),
    ).rejects.toThrow("EXTRACTION_DECIDED");
    expect(
      (
        await withWorkspaceTransaction(app, workspaceId, (client) =>
          client.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM business.command_outbox WHERE workspace_id=$1 AND event_type='extraction.accepted'",
            [workspaceId],
          ),
        )
      ).rows[0]!.n,
    ).toBe(1);
  });

  it("requires a confirmed event time zone and applies the shared DST validation", async () => {
    const ids = (
      await extraction.generate({
        actorId,
        workspaceId,
        captureId,
        idempotencyKey: "be14-generate-two",
      })
    ).response.candidateIds as string[];
    const proposal = await extraction.get(actorId, workspaceId, ids[1]!);
    expect(proposal.proposal.unresolvedFields).toEqual([
      "time_zone",
      "start_time",
    ]);
    await expect(
      extraction.decide({
        actorId,
        workspaceId,
        proposalId: ids[1]!,
        expectedCaptureRevision: 1,
        decision: "ACCEPTED",
        title: "팀 회의",
        idempotencyKey: "be14-no-timezone",
      }),
    ).rejects.toThrow("EXTRACTION_UNRESOLVED");
    const accepted = await extraction.decide({
      actorId,
      workspaceId,
      proposalId: ids[1]!,
      expectedCaptureRevision: 1,
      decision: "ACCEPTED",
      title: "팀 회의",
      schedule: {
        kind: "TIMED",
        timeZone: "Asia/Seoul",
        startLocal: "2026-10-01T09:00:00",
        endLocal: "2026-10-01T10:00:00",
      },
      idempotencyKey: "be14-accept-event",
    });
    expect(accepted.response.targetKind).toBe("event");
    const event = await withWorkspaceTransaction(app, workspaceId, (client) =>
      client.query<{ start_at: Date }>(
        "SELECT start_at FROM business.calendar_event WHERE workspace_id=$1 AND id=$2",
        [workspaceId, accepted.response.targetId],
      ),
    );
    expect(event.rows[0]!.start_at.toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );
  });

  it("creates a sourced paraphrase unit without replacing the original capture", async () => {
    const ids = (
      await extraction.generate({
        actorId,
        workspaceId,
        captureId,
        idempotencyKey: "be14-generate-three",
      })
    ).response.candidateIds as string[];
    const accepted = await extraction.decide({
      actorId,
      workspaceId,
      proposalId: ids[2]!,
      expectedCaptureRevision: 1,
      decision: "ACCEPTED",
      title: "회의는 협의의 맥락이다",
      idempotencyKey: "be14-accept-unit",
    });
    const source = await withWorkspaceTransaction(app, workspaceId, (client) =>
      client.query<{
        raw_body: string;
        content_kind: string;
        content_text: string;
      }>(
        `SELECT cr.raw_body,ur.content_kind,ur.content_text FROM business.capture_revision cr
         JOIN business.thought_unit_revision ur ON ur.workspace_id=cr.workspace_id
          AND ur.capture_id=cr.capture_id AND ur.capture_revision=cr.revision
         WHERE cr.workspace_id=$1 AND ur.unit_id=$2`,
        [workspaceId, accepted.response.targetId],
      ),
    );
    expect(source.rows[0]).toMatchObject({
      content_kind: "paraphrase",
      content_text: "회의는 협의의 맥락이다",
    });
    expect(source.rows[0]!.raw_body).toContain("NOTE: 회의 맥락 정리");
  });

  it("blocks stale source revision and a completed exact-source task from being recreated", async () => {
    await tasks.transition({
      actorId,
      workspaceId,
      id: taskId,
      idempotencyKey: "be14-complete-task",
      baseVersion: 1,
      targetState: "DONE",
    });
    const revised = await captures.revise({
      actorId,
      workspaceId,
      id: captureId,
      idempotencyKey: "be14-revise-capture",
      baseVersion: 1,
      title: "회의 기록",
      rawBody:
        "TODO: 보고서 정리\nEVENT: 2026-10-01 09:00 팀 회의\nNOTE: 회의 맥락 정리\nTODO: 보고서 정리하기\nTODO: 새 일",
    });
    expect(revised.response.revision).toBe(2);
    const ids = (
      await extraction.generate({
        actorId,
        workspaceId,
        captureId,
        idempotencyKey: "be14-generate-revision-two",
      })
    ).response.candidateIds as string[];
    const prior = await extraction.get(actorId, workspaceId, ids[0]!);
    expect(prior.priorTargets[0]).toMatchObject({
      match: "EXACT_SOURCE",
      state: "DONE",
    });
    const similar = await extraction.get(actorId, workspaceId, ids[3]!);
    expect(similar.priorTargets[0]).toMatchObject({
      match: "SIMILAR_TITLE",
      state: "DONE",
    });
    await expect(
      extraction.decide({
        actorId,
        workspaceId,
        proposalId: ids[0]!,
        expectedCaptureRevision: 2,
        decision: "ACCEPTED",
        title: "보고서 정리",
        idempotencyKey: "be14-repeat-source",
      }),
    ).rejects.toThrow("EXTRACTION_DUPLICATE");
    const old = (
      await withWorkspaceTransaction(app, workspaceId, (client) =>
        client.query<{ id: string }>(
          "SELECT id FROM business.extraction_candidate WHERE workspace_id=$1 AND capture_revision=1 AND target_kind='task'",
          [workspaceId],
        ),
      )
    ).rows[0]!.id;
    expect((await extraction.get(actorId, workspaceId, old)).sourceStale).toBe(
      true,
    );
    await expect(
      extraction.decide({
        actorId,
        workspaceId,
        proposalId: ids[4]!,
        expectedCaptureRevision: 1,
        decision: "ACCEPTED",
        title: "새 일",
        idempotencyKey: "be14-stale-request",
      }),
    ).rejects.toThrow("EXTRACTION_STALE");
    await captures.revise({
      actorId,
      workspaceId,
      id: captureId,
      idempotencyKey: "be14-revise-again",
      baseVersion: 2,
      title: "회의 기록",
      rawBody: "TODO: 보고서 정리\nTODO: 새 일\nNOTE: 다시 정리",
    });
    expect(
      (await extraction.get(actorId, workspaceId, ids[4]!)).sourceStale,
    ).toBe(true);
    await expect(
      extraction.decide({
        actorId,
        workspaceId,
        proposalId: ids[4]!,
        expectedCaptureRevision: 2,
        decision: "ACCEPTED",
        title: "새 일",
        idempotencyKey: "be14-source-changed",
      }),
    ).rejects.toThrow("EXTRACTION_STALE");
  });

  it("fails closed for invalid parser data and keeps source capture writable", async () => {
    const bad: ExtractionParser = { parse: async () => "not-json" };
    const service = new ExtractionService(
      identity,
      new CommandCoordinator(identity),
      bad,
    );
    await expect(
      service.generate({
        actorId,
        workspaceId,
        captureId,
        idempotencyKey: "be14-bad-parser",
      }),
    ).rejects.toThrow("EXTRACTION_PARSER_UNAVAILABLE");
    const timeout = new ExtractionService(
      identity,
      new CommandCoordinator(identity),
      { parse: () => new Promise(() => {}) },
      20,
    );
    await expect(
      timeout.generate({
        actorId,
        workspaceId,
        captureId,
        idempotencyKey: "be14-timeout-parser",
      }),
    ).rejects.toThrow("EXTRACTION_PARSER_UNAVAILABLE");
    const raw = await captures.get(actorId, workspaceId, captureId);
    expect(raw.rawBody).toContain("TODO: 새 일");
    expect(
      (await app.query("SELECT * FROM business.extraction_candidate")).rows,
    ).toEqual([]);
    expect(
      (
        await withWorkspaceTransaction(app, randomUUID(), (client) =>
          client.query("SELECT id FROM business.extraction_candidate"),
        )
      ).rows,
    ).toEqual([]);
    await expect(
      withWorkspaceTransaction(app, workspaceId, (client) =>
        client.query(
          "UPDATE business.extraction_candidate SET payload='{}'::jsonb",
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
