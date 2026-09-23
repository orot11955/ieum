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

describe("BE-08 context membership and approved relations", () => {
  let container: StartedPostgreSqlContainer,
    admin: Pool,
    app: Pool,
    lock: Pool,
    knowledge: KnowledgeService,
    captures: CaptureService;
  const actorId = "be08-user",
    workspaceId = randomUUID(),
    otherWorkspaceId = randomUUID(),
    foreignContextId = randomUUID();
  let unitId: string,
    secondUnitId: string,
    firstContext: string,
    secondContext: string,
    thirdContext: string;
  const context = (name: string, key: string) =>
    knowledge.create({
      actorId,
      workspaceId,
      idempotencyKey: key,
      name,
      purpose: "목적",
      scope: "범위",
      kind: "PROJECT",
    });
  beforeAll(async () => {
    container = await new PostgreSqlContainer(image)
      .withDatabase("ieum_be08")
      .withUsername("postgres")
      .withPassword("be08_fixture_only")
      .start();
    admin = new Pool({ connectionString: container.getConnectionUri() });
    await migrate(drizzle(admin), { migrationsFolder: authMigrations });
    await admin.query(rolesSql);
    await migrate(drizzle(admin), {
      migrationsFolder: businessMigrations,
      migrationsSchema: "drizzle_business",
    });
    await admin.query(
      "INSERT INTO auth.\"user\" (id,name,email) VALUES ($1,'BE08','be08@example.test')",
      [actorId],
    );
    await admin.query(
      "INSERT INTO auth.\"user\" (id,name,email) VALUES ('be08-other','Other','be08-other@example.test')",
    );
    await admin.query(
      "CREATE ROLE ieum_be08_app LOGIN PASSWORD 'be08_fixture_only' IN ROLE ieum_application",
    );
    const url = new URL(container.getConnectionUri());
    url.username = "ieum_be08_app";
    url.password = "be08_fixture_only";
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
    await withWorkspaceTransaction(app, otherWorkspaceId, async (client) => {
      await client.query(
        "INSERT INTO business.workspace (id,personal_owner_id) VALUES ($1,$2)",
        [otherWorkspaceId, "be08-other"],
      );
      await client.query(
        "INSERT INTO business.workspace_member (workspace_id,user_id) VALUES ($1,$2)",
        [otherWorkspaceId, "be08-other"],
      );
      await client.query(
        "INSERT INTO business.context (id,workspace_id,name,purpose,scope,kind) VALUES ($1,$2,'타 공간','타 목적','타 범위','PROJECT')",
        [foreignContextId, otherWorkspaceId],
      );
      await client.query(
        "INSERT INTO business.context_identity_revision (workspace_id,context_id,revision,name,purpose,scope,kind,state) VALUES ($1,$2,1,'타 공간','타 목적','타 범위','PROJECT','ACTIVE')",
        [otherWorkspaceId, foreignContextId],
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
    const created = await captures.create({
      actorId,
      workspaceId,
      idempotencyKey: "be08-capture-001",
      title: "원본",
      rawBody: "실제 기록",
      sourceKind: "manual",
    });
    unitId = created.response.unitId as string;
    const second = await captures.create({
      actorId,
      workspaceId,
      idempotencyKey: "be08-capture-002",
      title: "다른 원본",
      rawBody: "반대 주장",
      sourceKind: "manual",
    });
    secondUnitId = second.response.unitId as string;
    firstContext = (await context("첫 맥락", "be08-context-001")).response
      .id as string;
    secondContext = (await context("둘째 맥락", "be08-context-002")).response
      .id as string;
    thirdContext = (await context("셋째 맥락", "be08-context-003")).response
      .id as string;
  }, 120_000);
  afterAll(async () => {
    await Promise.all([app?.end(), lock?.end(), admin?.end()]);
    await container?.stop();
  }, 120_000);

  it("moves an optional primary atomically while retaining multiple secondary memberships", async () => {
    const first = await knowledge.setMemberships({
      actorId,
      workspaceId,
      unitId,
      idempotencyKey: "be08-membership-001",
      baseVersion: 1,
      memberships: [
        { contextId: firstContext, role: "PRIMARY" },
        { contextId: secondContext, role: "SECONDARY" },
      ],
    });
    expect(first.response.membershipVersion).toBe(2);
    const moved = await knowledge.setMemberships({
      actorId,
      workspaceId,
      unitId,
      idempotencyKey: "be08-membership-002",
      baseVersion: 2,
      memberships: [
        { contextId: firstContext, role: "SECONDARY" },
        { contextId: secondContext, role: "PRIMARY" },
        { contextId: thirdContext, role: "SECONDARY" },
      ],
    });
    expect(moved.response.membershipVersion).toBe(3);
    const read = await knowledge.unitMemberships(actorId, workspaceId, unitId);
    expect(read.memberships.filter((m) => m.role === "PRIMARY")).toEqual([
      { contextId: secondContext, role: "PRIMARY", unitRevision: 1 },
    ]);
    expect(
      (await knowledge.get(actorId, workspaceId, thirdContext)).memberships,
    ).toMatchObject([{ unitId, role: "SECONDARY" }]);
    const cleared = await knowledge.setMemberships({
      actorId,
      workspaceId,
      unitId,
      idempotencyKey: "be08-membership-003",
      baseVersion: 3,
      memberships: [
        { contextId: firstContext, role: "SECONDARY" },
        { contextId: thirdContext, role: "SECONDARY" },
      ],
    });
    expect(cleared.response.membershipVersion).toBe(4);
    expect(
      (
        await knowledge.unitMemberships(actorId, workspaceId, unitId)
      ).memberships.filter((m) => m.role === "PRIMARY"),
    ).toHaveLength(0);
    const historical = await withWorkspaceTransaction(
      app,
      workspaceId,
      (client) =>
        client.query(
          "SELECT role,ended_at FROM business.context_membership WHERE workspace_id=$1 AND unit_id=$2 AND context_id=$3 ORDER BY started_at",
          [workspaceId, unitId, secondContext],
        ),
    );
    expect(historical.rows).toHaveLength(2);
    expect(historical.rows.every((row) => row.ended_at !== null)).toBe(true);
  });

  it("rejects simultaneous primary changes, duplicate pair and invalid cross-workspace links", async () => {
    await expect(
      knowledge.setMemberships({
        actorId,
        workspaceId,
        unitId,
        idempotencyKey: "be08-duplicate-01",
        baseVersion: 4,
        memberships: [
          { contextId: firstContext, role: "PRIMARY" },
          { contextId: firstContext, role: "SECONDARY" },
        ],
      }),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_DUPLICATE" });
    const requests = [
      knowledge.setMemberships({
        actorId,
        workspaceId,
        unitId,
        idempotencyKey: "be08-race-primary-1",
        baseVersion: 4,
        memberships: [{ contextId: firstContext, role: "PRIMARY" }],
      }),
      knowledge.setMemberships({
        actorId,
        workspaceId,
        unitId,
        idempotencyKey: "be08-race-primary-2",
        baseVersion: 4,
        memberships: [{ contextId: secondContext, role: "PRIMARY" }],
      }),
    ];
    const outcome = await Promise.allSettled(requests);
    expect(outcome.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcome.filter((r) => r.status === "rejected")).toMatchObject([
      { status: "rejected", reason: { code: "VERSION_CONFLICT" } },
    ]);
    const currentPrimary = (
      await knowledge.unitMemberships(actorId, workspaceId, unitId)
    ).memberships.filter((m) => m.role === "PRIMARY");
    expect(currentPrimary).toHaveLength(1);
    await expect(
      withWorkspaceTransaction(app, workspaceId, (client) =>
        client.query(
          "INSERT INTO business.context_membership (workspace_id,unit_id,unit_revision,context_id,role) VALUES ($1,$2,1,$3,'SECONDARY')",
          [workspaceId, unitId, currentPrimary[0]!.contextId],
        ),
      ),
    ).rejects.toMatchObject({
      constraint: "context_membership_active_pair_unique",
    });
    await expect(
      knowledge.setMemberships({
        actorId,
        workspaceId,
        unitId,
        idempotencyKey: "be08-crossspace-01",
        baseVersion: 5,
        memberships: [{ contextId: foreignContextId, role: "SECONDARY" }],
      }),
    ).rejects.toMatchObject({ code: "CONTEXT_NOT_FOUND" });
    await expect(
      knowledge.addContextRelation({
        actorId,
        workspaceId: otherWorkspaceId,
        idempotencyKey: "be08-crossspace-02",
        fromContextId: firstContext,
        toContextId: secondContext,
        type: "PARENT_OF",
      }),
    ).rejects.toMatchObject({ code: "CONTEXT_NOT_FOUND" });
    const hidden = await withWorkspaceTransaction(
      app,
      otherWorkspaceId,
      (client) =>
        client.query("SELECT id FROM business.context WHERE id=$1", [
          firstContext,
        ]),
    );
    expect(hidden.rowCount).toBe(0);
    const foreignHidden = await withWorkspaceTransaction(
      app,
      workspaceId,
      (client) =>
        client.query("SELECT id FROM business.context WHERE id=$1", [
          foreignContextId,
        ]),
    );
    expect(foreignHidden.rowCount).toBe(0);
    await expect(
      withWorkspaceTransaction(app, workspaceId, (client) =>
        client.query(
          "INSERT INTO business.context_membership (workspace_id,unit_id,unit_revision,context_id,role) VALUES ($1,$2,1,$3,'SECONDARY')",
          [workspaceId, unitId, foreignContextId],
        ),
      ),
    ).rejects.toMatchObject({ constraint: "context_membership_context_fk" });
    await expect(
      withWorkspaceTransaction(app, workspaceId, (client) =>
        client.query(
          "INSERT INTO business.context_membership (workspace_id,unit_id,unit_revision,context_id,role) VALUES ($1,$2,1,$3,'PRIMARY')",
          [workspaceId, unitId, thirdContext],
        ),
      ),
    ).rejects.toMatchObject({
      constraint: "context_membership_active_primary_unique",
    });
  });

  it("keeps immutable identity revisions and separates archive from supersede and active search", async () => {
    const membershipRevision = (
      await knowledge.get(actorId, workspaceId, firstContext)
    ).membershipRevision;
    const renamed = await knowledge.changeIdentity({
      actorId,
      workspaceId,
      id: firstContext,
      idempotencyKey: "be08-rename-0001",
      baseRevision: 1,
      name: "이름 변경",
    });
    expect(renamed.response).toMatchObject({
      identityRevision: 2,
      membershipRevision,
      state: "ACTIVE",
    });
    expect(
      (await knowledge.get(actorId, workspaceId, firstContext, 1)).name,
    ).toBe("첫 맥락");
    expect((await knowledge.get(actorId, workspaceId, firstContext)).name).toBe(
      "이름 변경",
    );
    await expect(
      withWorkspaceTransaction(app, workspaceId, (client) =>
        client.query(
          "UPDATE business.context_identity_revision SET name='변조' WHERE context_id=$1",
          [firstContext],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await knowledge.changeIdentity({
      actorId,
      workspaceId,
      id: firstContext,
      idempotencyKey: "be08-archive-0001",
      baseRevision: 2,
      state: "ARCHIVED",
    });
    expect(
      (await knowledge.list(actorId, workspaceId)).contexts.map((c) => c.id),
    ).not.toContain(firstContext);
    expect(
      (
        await knowledge.list(actorId, workspaceId, true, "이름 변경")
      ).contexts.map((c) => c.id),
    ).toContain(firstContext);
    await knowledge.changeIdentity({
      actorId,
      workspaceId,
      id: thirdContext,
      idempotencyKey: "be08-supersede-01",
      baseRevision: 1,
      state: "SUPERSEDED",
      supersededById: secondContext,
    });
    expect(
      (await knowledge.get(actorId, workspaceId, thirdContext)).supersededById,
    ).toBe(secondContext);
    const firstPage = await knowledge.list(
      actorId,
      workspaceId,
      true,
      undefined,
      undefined,
      2,
    );
    expect(firstPage.contexts).toHaveLength(2);
    expect(firstPage.nextCursor).toBeTruthy();
    const secondPage = await knowledge.list(
      actorId,
      workspaceId,
      true,
      undefined,
      firstPage.nextCursor!,
      2,
    );
    expect(secondPage.contexts).toHaveLength(1);
    expect(
      new Set([...firstPage.contexts, ...secondPage.contexts].map((c) => c.id))
        .size,
    ).toBe(3);
  });

  it("rejects parent cycles and preserves CONTRADICTS as an approved typed relation", async () => {
    await expect(
      knowledge.addContextRelation({
        actorId,
        workspaceId,
        idempotencyKey: "be08-parent-0001",
        fromContextId: secondContext,
        toContextId: firstContext,
        type: "PARENT_OF",
      }),
    ).rejects.toMatchObject({ code: "CONTEXT_INACTIVE" });
    const fourthContext = (await context("넷째 맥락", "be08-context-004"))
      .response.id as string;
    const fifthContext = (await context("다섯째 맥락", "be08-context-005"))
      .response.id as string;
    const parent = await knowledge.addContextRelation({
      actorId,
      workspaceId,
      idempotencyKey: "be08-parent-0002",
      fromContextId: secondContext,
      toContextId: fourthContext,
      type: "PARENT_OF",
    });
    await knowledge.addContextRelation({
      actorId,
      workspaceId,
      idempotencyKey: "be08-parent-0003",
      fromContextId: fourthContext,
      toContextId: fifthContext,
      type: "PARENT_OF",
    });
    await expect(
      knowledge.addContextRelation({
        actorId,
        workspaceId,
        idempotencyKey: "be08-parent-cycle",
        fromContextId: fifthContext,
        toContextId: secondContext,
        type: "PARENT_OF",
      }),
    ).rejects.toMatchObject({ code: "PARENT_CYCLE" });
    const relation = await knowledge.addThoughtRelation({
      actorId,
      workspaceId,
      idempotencyKey: "be08-contradict-1",
      fromUnitId: unitId,
      fromRevision: 1,
      toUnitId: secondUnitId,
      toRevision: 1,
      type: "CONTRADICTS",
    });
    expect(relation.response.type).toBe("CONTRADICTS");
    expect(
      (await knowledge.unitRelations(actorId, workspaceId, unitId)).relations,
    ).toMatchObject([{ id: relation.response.id, type: "CONTRADICTS" }]);
    const row = await withWorkspaceTransaction(app, workspaceId, (client) =>
      client.query(
        "SELECT type,approved_by_id FROM business.thought_relation WHERE id=$1",
        [relation.response.id],
      ),
    );
    expect(row.rows[0]).toEqual({
      type: "CONTRADICTS",
      approved_by_id: actorId,
    });
    await expect(
      knowledge.addThoughtRelation({
        actorId,
        workspaceId,
        idempotencyKey: "be08-contradict-2",
        fromUnitId: secondUnitId,
        fromRevision: 1,
        toUnitId: unitId,
        toRevision: 1,
        type: "CONTRADICTS",
      }),
    ).rejects.toMatchObject({ code: "RELATION_DUPLICATE" });
    const endedThought = await knowledge.endThoughtRelation({
      actorId,
      workspaceId,
      id: relation.response.id as string,
      idempotencyKey: "be08-end-thought-1",
    });
    expect(endedThought.response.ended).toBe(true);
    expect(
      (await knowledge.unitRelations(actorId, workspaceId, unitId)).relations,
    ).toHaveLength(0);
    await expect(
      knowledge.endThoughtRelation({
        actorId,
        workspaceId,
        id: relation.response.id as string,
        idempotencyKey: "be08-end-thought-2",
      }),
    ).rejects.toMatchObject({ code: "RELATION_DUPLICATE" });
    const endedParent = await knowledge.endContextRelation({
      actorId,
      workspaceId,
      id: parent.response.id as string,
      idempotencyKey: "be08-end-parent-1",
    });
    expect(endedParent.response.ended).toBe(true);
    expect(
      (await knowledge.get(actorId, workspaceId, fourthContext)).relations.map(
        (r) => r.id,
      ),
    ).not.toContain(parent.response.id);
  });
});
