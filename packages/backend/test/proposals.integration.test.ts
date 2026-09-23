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
import { JudgementService } from "../src/judgement/judgement-service.js";
import { processJudgementJob } from "../src/judgement/judgement-worker.js";
import { ProposalService } from "../src/judgement/proposals.js";
import { KnowledgeService } from "../src/knowledge.js";
import { withWorkspaceTransaction } from "../src/platform/database/scope.js";

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

describe("BE-13 persisted proposals and feedback", () => {
  let container: StartedPostgreSqlContainer;
  let admin: Pool, app: Pool, lock: Pool;
  let captures: CaptureService,
    knowledge: KnowledgeService,
    judgement: JudgementService,
    proposals: ProposalService;
  const actorId = "be13-owner";
  const workspaceId = randomUUID();
  let contextId: string;
  let queryUnitId: string;
  let queryCaptureId: string;
  let requestId: string;

  async function observe(unitId: string, key: string): Promise<string> {
    const requested = await judgement.request({
      actorId,
      workspaceId,
      unitId,
      unitRevision: 1,
      idempotencyKey: key,
    });
    const id = requested.response.requestId as string;
    const outbox = await withWorkspaceTransaction(app, workspaceId, (client) =>
      client.query<{ id: string }>(
        `SELECT id FROM business.command_outbox WHERE workspace_id=$1
         AND command_id=$2 AND event_type='judgement.requested'`,
        [workspaceId, id],
      ),
    );
    expect(
      await processJudgementJob(app, {
        workspaceId,
        outboxId: outbox.rows[0]!.id,
      }),
    ).toMatchObject({ outcome: "SUCCEEDED" });
    return id;
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer(image)
      .withDatabase("ieum_be13")
      .withUsername("postgres")
      .withPassword("be13_fixture_only")
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
      "CREATE ROLE ieum_be13_app LOGIN PASSWORD 'be13_fixture_only' IN ROLE ieum_application",
    );
    await admin.query(
      "INSERT INTO auth.\"user\" (id,name,email) VALUES ($1,'BE13','be13@example.test')",
      [actorId],
    );
    const url = new URL(base);
    url.username = "ieum_be13_app";
    url.password = "be13_fixture_only";
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
    );
    const commands = new CommandCoordinator(identity);
    captures = new CaptureService(identity, commands);
    knowledge = new KnowledgeService(identity, commands);
    judgement = new JudgementService(app, commands);
    proposals = new ProposalService(app, commands);
    const query = await captures.create({
      actorId,
      workspaceId,
      idempotencyKey: "be13-query-capture",
      title: "질문",
      rawBody: "프로젝트 일정",
      sourceKind: "manual",
    });
    queryUnitId = query.response.unitId as string;
    queryCaptureId = query.response.id as string;
    const candidate = await captures.create({
      actorId,
      workspaceId,
      idempotencyKey: "be13-candidate-capture",
      title: "참고",
      rawBody: "프로젝트 일정 계획",
      sourceKind: "manual",
    });
    contextId = (
      await knowledge.create({
        actorId,
        workspaceId,
        idempotencyKey: "be13-context-create",
        name: "프로젝트 일정",
        purpose: "일정",
        scope: "개인",
        kind: "PROJECT",
      })
    ).response.id as string;
    await knowledge.setMemberships({
      actorId,
      workspaceId,
      idempotencyKey: "be13-candidate-membership",
      unitId: candidate.response.unitId as string,
      baseVersion: 1,
      memberships: [{ contextId, role: "PRIMARY" }],
    });
    requestId = await observe(queryUnitId, "be13-first-observe");
  }, 120_000);

  afterAll(async () => {
    await Promise.allSettled([app?.end(), lock?.end(), admin?.end()]);
    await container?.stop();
  });

  it("keeps candidates read-only and requires the exact observed unit", async () => {
    const found = await proposals.candidates(actorId, workspaceId, requestId);
    expect(found).toMatchObject({
      unitId: queryUnitId,
      unitRevision: 1,
      candidates: [{ contextId, decision: "candidate" }],
    });
    expect(
      (
        await app.query(
          "SELECT count(*)::int AS n FROM business.judgement_proposal",
        )
      ).rows[0].n,
    ).toBe(0);
    await expect(
      proposals.create({
        actorId,
        workspaceId,
        runRequestId: requestId,
        unitId: randomUUID(),
        unitRevision: 1,
        contextId,
        role: "SECONDARY",
        idempotencyKey: "be13-wrong-unit",
      }),
    ).rejects.toThrow("CANDIDATE_UNAVAILABLE");
  });

  it("requires exposure, applies exactly the shown membership and replays one receipt", async () => {
    const created = await proposals.create({
      actorId,
      workspaceId,
      runRequestId: requestId,
      unitId: queryUnitId,
      unitRevision: 1,
      contextId,
      role: "SECONDARY",
      idempotencyKey: "be13-proposal-one",
    });
    const proposalId = created.response.proposalId as string;
    const shown = await proposals.get(actorId, workspaceId, proposalId);
    expect(shown.operations.after).toEqual([{ contextId, role: "SECONDARY" }]);
    await expect(
      proposals.decide({
        actorId,
        workspaceId,
        proposalId,
        exposureId: randomUUID(),
        operationsHash: shown.operationsHash,
        decision: "ACCEPTED",
        idempotencyKey: "be13-before-exposure",
      }),
    ).rejects.toThrow("NOT_EXPOSED");
    const exposed = await proposals.expose({
      actorId,
      workspaceId,
      proposalId,
      idempotencyKey: "be13-exposure-one",
    });
    const input = {
      actorId,
      workspaceId,
      proposalId,
      exposureId: exposed.response.exposureId as string,
      operationsHash: shown.operationsHash,
      decision: "ACCEPTED" as const,
      idempotencyKey: "be13-accept-one",
    };
    const accepted = await proposals.decide(input);
    expect(accepted.response).toMatchObject({
      state: "ACCEPTED",
      membershipVersion: 2,
      memberships: [{ contextId, role: "SECONDARY" }],
    });
    expect((await proposals.decide(input)).replayed).toBe(true);
    await expect(
      proposals.decide({ ...input, idempotencyKey: "be13-accept-again" }),
    ).rejects.toThrow("PROPOSAL_CLOSED");
    await expect(
      proposals.create({
        actorId,
        workspaceId,
        runRequestId: requestId,
        unitId: queryUnitId,
        unitRevision: 1,
        contextId,
        role: "PRIMARY",
        idempotencyKey: "be13-stale-observed-context",
      }),
    ).rejects.toThrow("STALE_PROPOSAL");
    expect(
      (await knowledge.unitMemberships(actorId, workspaceId, queryUnitId))
        .memberships,
    ).toEqual([{ contextId, role: "SECONDARY", unitRevision: 1 }]);
    const stored = await withWorkspaceTransaction(app, workspaceId, (client) =>
      client.query<{ kind: string }>(
        "SELECT kind FROM business.judgement_feedback WHERE workspace_id=$1 AND proposal_id=$2",
        [workspaceId, proposalId],
      ),
    );
    expect(stored.rows.map((row) => row.kind)).toEqual(["ACCEPTED"]);
    expect(
      (
        await app.query(
          "SELECT count(*)::int AS n FROM business.judgement_feedback",
        )
      ).rows[0].n,
    ).toBe(0);
    await expect(
      proposals.get("other-user", workspaceId, proposalId),
    ).rejects.toThrow();
  });

  it("changes primary through explicit previews without creating rejection feedback", async () => {
    const firstRun = await observe(queryUnitId, "be13-primary-observe-one");
    const first = await proposals.create({
      actorId,
      workspaceId,
      runRequestId: firstRun,
      unitId: queryUnitId,
      unitRevision: 1,
      contextId,
      role: "PRIMARY",
      idempotencyKey: "be13-primary-proposal-one",
    });
    const firstId = first.response.proposalId as string;
    const firstPreview = await proposals.get(actorId, workspaceId, firstId);
    const firstExposure = await proposals.expose({
      actorId,
      workspaceId,
      proposalId: firstId,
      idempotencyKey: "be13-primary-exposure-one",
    });
    expect(
      (
        await proposals.decide({
          actorId,
          workspaceId,
          proposalId: firstId,
          exposureId: firstExposure.response.exposureId as string,
          operationsHash: firstPreview.operationsHash,
          decision: "ACCEPTED",
          idempotencyKey: "be13-primary-accept-one",
        })
      ).response.state,
    ).toBe("ACCEPTED");
    const secondContextId = (
      await knowledge.create({
        actorId,
        workspaceId,
        idempotencyKey: "be13-primary-context-two",
        name: "프로젝트 일정 계획",
        purpose: "다른 맥락",
        scope: "개인",
        kind: "PROJECT",
      })
    ).response.id as string;
    const source = await captures.create({
      actorId,
      workspaceId,
      idempotencyKey: "be13-primary-candidate-two",
      title: "두 번째 참고",
      rawBody: "프로젝트 일정 계획",
      sourceKind: "manual",
    });
    await knowledge.setMemberships({
      actorId,
      workspaceId,
      idempotencyKey: "be13-primary-member-two",
      unitId: source.response.unitId as string,
      baseVersion: 1,
      memberships: [{ contextId: secondContextId, role: "PRIMARY" }],
    });
    const secondRun = await observe(queryUnitId, "be13-primary-observe-two");
    const second = await proposals.create({
      actorId,
      workspaceId,
      runRequestId: secondRun,
      unitId: queryUnitId,
      unitRevision: 1,
      contextId: secondContextId,
      role: "PRIMARY",
      idempotencyKey: "be13-primary-proposal-two",
    });
    const secondId = second.response.proposalId as string;
    const secondPreview = await proposals.get(actorId, workspaceId, secondId);
    expect(secondPreview.operations.after).toEqual(
      [
        { contextId, role: "SECONDARY" },
        { contextId: secondContextId, role: "PRIMARY" },
      ].sort((a, b) => a.contextId.localeCompare(b.contextId)),
    );
    const secondExposure = await proposals.expose({
      actorId,
      workspaceId,
      proposalId: secondId,
      idempotencyKey: "be13-primary-exposure-two",
    });
    const applied = await proposals.decide({
      actorId,
      workspaceId,
      proposalId: secondId,
      exposureId: secondExposure.response.exposureId as string,
      operationsHash: secondPreview.operationsHash,
      decision: "ACCEPTED",
      idempotencyKey: "be13-primary-accept-two",
    });
    expect(applied.response).toMatchObject({
      state: "ACCEPTED",
      memberships: secondPreview.operations.after,
    });
    const feedback = await withWorkspaceTransaction(
      app,
      workspaceId,
      (client) =>
        client.query<{ kind: string }>(
          `SELECT kind FROM business.judgement_feedback
         WHERE workspace_id=$1 AND proposal_id=ANY($2::uuid[]) ORDER BY kind`,
          [workspaceId, [firstId, secondId]],
        ),
    );
    expect(feedback.rows.map((row) => row.kind)).toEqual([
      "ACCEPTED",
      "ACCEPTED",
    ]);
  });

  it("marks a stale source superseded without a partial membership change", async () => {
    const source = await captures.create({
      actorId,
      workspaceId,
      idempotencyKey: "be13-stale-capture",
      title: "변경될 질문",
      rawBody: "프로젝트 일정",
      sourceKind: "manual",
    });
    const unitId = source.response.unitId as string;
    const runRequestId = await observe(unitId, "be13-stale-observe");
    const created = await proposals.create({
      actorId,
      workspaceId,
      runRequestId,
      unitId,
      unitRevision: 1,
      contextId,
      role: "SECONDARY",
      idempotencyKey: "be13-stale-proposal",
    });
    const proposalId = created.response.proposalId as string;
    const preview = await proposals.get(actorId, workspaceId, proposalId);
    const exposed = await proposals.expose({
      actorId,
      workspaceId,
      proposalId,
      idempotencyKey: "be13-stale-exposure",
    });
    await captures.archive({
      actorId,
      workspaceId,
      id: source.response.id as string,
      idempotencyKey: "be13-stale-archive",
      baseVersion: 1,
    });
    const outcome = await proposals.decide({
      actorId,
      workspaceId,
      proposalId,
      exposureId: exposed.response.exposureId as string,
      operationsHash: preview.operationsHash,
      decision: "ACCEPTED",
      idempotencyKey: "be13-stale-accept",
    });
    expect(outcome.response).toMatchObject({
      state: "SUPERSEDED",
      previewRequired: true,
    });
    expect((await proposals.get(actorId, workspaceId, proposalId)).state).toBe(
      "SUPERSEDED",
    );
    expect(
      (await knowledge.unitMemberships(actorId, workspaceId, unitId))
        .memberships,
    ).toEqual([]);
  });

  it("keeps rejection separate from primary selection and expires old proposals", async () => {
    const fresh = await captures.create({
      actorId,
      workspaceId,
      idempotencyKey: "be13-feedback-capture",
      title: "피드백 질문",
      rawBody: "프로젝트 일정",
      sourceKind: "manual",
    });
    const unitId = fresh.response.unitId as string;
    const runRequestId = await observe(unitId, "be13-feedback-observe");
    const created = await proposals.create({
      actorId,
      workspaceId,
      runRequestId,
      unitId,
      unitRevision: 1,
      contextId,
      role: "PRIMARY",
      idempotencyKey: "be13-rejected-proposal",
    });
    const proposalId = created.response.proposalId as string;
    const shown = await proposals.get(actorId, workspaceId, proposalId);
    const exposed = await proposals.expose({
      actorId,
      workspaceId,
      proposalId,
      idempotencyKey: "be13-rejected-exposure",
    });
    expect(
      (
        await proposals.decide({
          actorId,
          workspaceId,
          proposalId,
          exposureId: exposed.response.exposureId as string,
          operationsHash: shown.operationsHash,
          decision: "REJECTED",
          idempotencyKey: "be13-reject",
        })
      ).response.state,
    ).toBe("REJECTED");
    expect(
      (await knowledge.unitMemberships(actorId, workspaceId, unitId))
        .memberships,
    ).toEqual([]);

    const expiring = await proposals.create({
      actorId,
      workspaceId,
      runRequestId,
      unitId,
      unitRevision: 1,
      contextId,
      role: "SECONDARY",
      idempotencyKey: "be13-expiring-proposal",
    });
    const expiringId = expiring.response.proposalId as string;
    await admin.query(
      "UPDATE business.judgement_proposal SET expires_at=now()-interval '1 day' WHERE id=$1",
      [expiringId],
    );
    expect((await proposals.get(actorId, workspaceId, expiringId)).state).toBe(
      "EXPIRED",
    );
    expect(
      (
        await proposals.expose({
          actorId,
          workspaceId,
          proposalId: expiringId,
          idempotencyKey: "be13-expired-expose",
        })
      ).response.state,
    ).toBe("EXPIRED");
    await captures.archive({
      actorId,
      workspaceId,
      id: queryCaptureId,
      idempotencyKey: "be13-end-query-archive",
      baseVersion: 1,
    });
  });

  it("rejects forged exposure, revoked owner and changed context before approval", async () => {
    const source = await captures.create({
      actorId,
      workspaceId,
      idempotencyKey: "be13-context-stale-capture",
      title: "맥락 변경 질문",
      rawBody: "프로젝트 일정",
      sourceKind: "manual",
    });
    const unitId = source.response.unitId as string;
    const runRequestId = await observe(unitId, "be13-context-stale-observe");
    const first = await proposals.create({
      actorId,
      workspaceId,
      runRequestId,
      unitId,
      unitRevision: 1,
      contextId,
      role: "SECONDARY",
      idempotencyKey: "be13-context-stale-proposal",
    });
    const firstId = first.response.proposalId as string;
    const firstPreview = await proposals.get(actorId, workspaceId, firstId);
    const firstExposure = await proposals.expose({
      actorId,
      workspaceId,
      proposalId: firstId,
      idempotencyKey: "be13-context-stale-exposure",
    });
    const other = await proposals.create({
      actorId,
      workspaceId,
      runRequestId,
      unitId,
      unitRevision: 1,
      contextId,
      role: "BACKGROUND",
      idempotencyKey: "be13-other-proposal",
    });
    const otherExposure = await proposals.expose({
      actorId,
      workspaceId,
      proposalId: other.response.proposalId as string,
      idempotencyKey: "be13-other-exposure",
    });
    const input = {
      actorId,
      workspaceId,
      proposalId: firstId,
      operationsHash: firstPreview.operationsHash,
      decision: "ACCEPTED" as const,
      idempotencyKey: "be13-context-stale-accept",
    };
    await expect(
      proposals.decide({
        ...input,
        exposureId: otherExposure.response.exposureId as string,
      }),
    ).rejects.toThrow("NOT_EXPOSED");
    const withoutScope = await app.query(
      "UPDATE business.judgement_proposal SET state='REJECTED' WHERE id=$1 RETURNING id",
      [firstId],
    );
    expect(withoutScope.rows).toEqual([]);
    await admin.query(
      "UPDATE business.user_access SET state='SUSPENDED' WHERE user_id=$1",
      [actorId],
    );
    await expect(
      proposals.decide({
        ...input,
        exposureId: firstExposure.response.exposureId as string,
      }),
    ).rejects.toThrow();
    await admin.query(
      "UPDATE business.user_access SET state='ACTIVE' WHERE user_id=$1",
      [actorId],
    );
    await knowledge.changeIdentity({
      actorId,
      workspaceId,
      id: contextId,
      idempotencyKey: "be13-context-stale-rename",
      baseRevision: 1,
      name: "새 프로젝트 일정",
    });
    expect(
      (
        await proposals.decide({
          ...input,
          exposureId: firstExposure.response.exposureId as string,
        })
      ).response,
    ).toMatchObject({ state: "SUPERSEDED", previewRequired: true });
    expect(
      (await knowledge.unitMemberships(actorId, workspaceId, unitId))
        .memberships,
    ).toEqual([]);
  });

  it("invalidates approval when the source Capture is revised after preview", async () => {
    const source = await captures.create({
      actorId,
      workspaceId,
      idempotencyKey: "be13-revised-source",
      title: "원문 변경 질문",
      rawBody: "프로젝트 일정",
      sourceKind: "manual",
    });
    const unitId = source.response.unitId as string;
    const runRequestId = await observe(unitId, "be13-revised-observe");
    const created = await proposals.create({
      actorId,
      workspaceId,
      runRequestId,
      unitId,
      unitRevision: 1,
      contextId,
      role: "SECONDARY",
      idempotencyKey: "be13-revised-proposal",
    });
    const proposalId = created.response.proposalId as string;
    const shown = await proposals.get(actorId, workspaceId, proposalId);
    expect(shown.sourceStale).toBe(false);
    const exposed = await proposals.expose({
      actorId,
      workspaceId,
      proposalId,
      idempotencyKey: "be13-revised-exposure",
    });
    await captures.revise({
      actorId,
      workspaceId,
      id: source.response.id as string,
      idempotencyKey: "be13-source-revision-two",
      baseVersion: 1,
      title: "원문 변경 질문",
      rawBody: "프로젝트 일정이 변경됨",
    });
    expect(
      (await proposals.get(actorId, workspaceId, proposalId)).sourceStale,
    ).toBe(true);
    expect(
      (
        await proposals.decide({
          actorId,
          workspaceId,
          proposalId,
          exposureId: exposed.response.exposureId as string,
          operationsHash: shown.operationsHash,
          decision: "ACCEPTED",
          idempotencyKey: "be13-revised-accept",
        })
      ).response,
    ).toMatchObject({ state: "SUPERSEDED", previewRequired: true });
    expect(
      (await knowledge.unitMemberships(actorId, workspaceId, unitId))
        .memberships,
    ).toEqual([]);
  });
});
