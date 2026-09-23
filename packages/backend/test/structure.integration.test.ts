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
import { StructureService } from "../src/knowledge/structure.js";
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

describe("BE-15 structure changes", () => {
  let container: StartedPostgreSqlContainer, admin: Pool, app: Pool, lock: Pool;
  let knowledge: KnowledgeService,
    captures: CaptureService,
    structure: StructureService;
  const actorId = "be15-owner",
    workspaceId = randomUUID();
  const createContext = async (name: string) =>
    (
      await knowledge.create({
        actorId,
        workspaceId,
        idempotencyKey: randomUUID(),
        name,
        purpose: "명시적 목적",
        scope: "명시적 범위",
        kind: "PROJECT",
      })
    ).response.id as string;
  const createUnit = async (title: string) =>
    (
      await captures.create({
        actorId,
        workspaceId,
        idempotencyKey: randomUUID(),
        title,
        rawBody: `원문 ${title}`,
        sourceKind: "manual",
      })
    ).response.unitId as string;
  const set = (
    unitId: string,
    baseVersion: number,
    memberships: { contextId: string; role: "PRIMARY" | "SECONDARY" }[],
  ) =>
    knowledge.setMemberships({
      actorId,
      workspaceId,
      unitId,
      baseVersion,
      memberships,
      idempotencyKey: randomUUID(),
    });
  beforeAll(async () => {
    container = await new PostgreSqlContainer(image)
      .withDatabase("ieum_be15")
      .withUsername("postgres")
      .withPassword("be15_fixture_only")
      .start();
    admin = new Pool({ connectionString: container.getConnectionUri() });
    await migrate(drizzle(admin), { migrationsFolder: authMigrations });
    await admin.query(rolesSql);
    await migrate(drizzle(admin), {
      migrationsFolder: businessMigrations,
      migrationsSchema: "drizzle_business",
    });
    await admin.query(
      "INSERT INTO auth.\"user\" (id,name,email) VALUES ($1,'BE15','be15@example.test')",
      [actorId],
    );
    await admin.query(
      "CREATE ROLE ieum_be15_app LOGIN PASSWORD 'be15_fixture_only' IN ROLE ieum_application",
    );
    const url = new URL(container.getConnectionUri());
    url.username = "ieum_be15_app";
    url.password = "be15_fixture_only";
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
    knowledge = new KnowledgeService(identity, commands);
    captures = new CaptureService(identity, commands);
    structure = new StructureService(identity, commands);
  }, 120_000);
  afterAll(async () => {
    await Promise.all([app?.end(), lock?.end(), admin?.end()]);
    await container?.stop();
  }, 120_000);

  it("keeps residual source active and preserves later records on inverse", async () => {
    const source = await createContext("분리 원본");
    const unit = await createUnit("분리할 기록");
    await set(unit, 1, [{ contextId: source, role: "PRIMARY" }]);
    const child = randomUUID();
    const preview = await structure.preview({
      actorId,
      workspaceId,
      sourceContextId: source,
      kind: "SPLIT",
      idempotencyKey: randomUUID(),
      createdContexts: [
        {
          id: child,
          name: "분리 후속",
          purpose: "후속 목적",
          scope: "후속 범위",
          kind: "PROJECT",
        },
      ],
      assignments: [
        {
          unitId: unit,
          unitRevision: 1,
          after: [
            { contextId: source, role: "SECONDARY" },
            { contextId: child, role: "PRIMARY" },
          ],
        },
      ],
    });
    const proposalId = preview.response.proposalId as string;
    expect(
      (
        await app.query(
          "SELECT id FROM business.structure_proposal WHERE id=$1",
          [proposalId],
        )
      ).rows,
    ).toEqual([]);
    await withWorkspaceTransaction(app, randomUUID(), async (client) => {
      expect(
        (
          await client.query(
            "SELECT id FROM business.structure_proposal WHERE id=$1",
            [proposalId],
          )
        ).rows,
      ).toEqual([]);
    });
    await expect(
      withWorkspaceTransaction(app, workspaceId, (client) =>
        client.query(
          "UPDATE business.structure_proposal SET preview='{}'::jsonb WHERE id=$1",
          [proposalId],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    const signature = (preview.response.preview as { signature: string })
      .signature;
    const applied = await structure.accept({
      actorId,
      workspaceId,
      proposalId,
      signature,
      idempotencyKey: randomUUID(),
    });
    const mutationId = applied.response.mutationId as string;
    expect((await knowledge.get(actorId, workspaceId, source)).state).toBe(
      "ACTIVE",
    );
    expect(
      (await knowledge.get(actorId, workspaceId, source)).successors,
    ).toEqual([{ contextId: child, mutationId }]);
    const later = await createUnit("나중에 추가한 기록");
    await set(later, 1, [{ contextId: child, role: "PRIMARY" }]);
    await expect(
      structure.preview({
        actorId,
        workspaceId,
        sourceContextId: source,
        peerContextId: child,
        kind: "MERGE",
        idempotencyKey: randomUUID(),
        assignments: [
          {
            unitId: unit,
            unitRevision: 1,
            after: [{ contextId: child, role: "PRIMARY" }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "STRUCTURE_CONFLICT" });
    const inverse = await structure.previewUndo(
      actorId,
      workspaceId,
      mutationId,
    );
    await structure.undo({
      actorId,
      workspaceId,
      mutationId,
      signature: inverse.signature,
      idempotencyKey: randomUUID(),
    });
    expect(
      (await knowledge.unitMemberships(actorId, workspaceId, unit)).memberships,
    ).toEqual([{ contextId: source, role: "PRIMARY", unitRevision: 1 }]);
    expect(
      (await knowledge.unitMemberships(actorId, workspaceId, later))
        .memberships,
    ).toEqual([{ contextId: child, role: "PRIMARY", unitRevision: 1 }]);
    expect(
      (await knowledge.get(actorId, workspaceId, source)).successors,
    ).toEqual([]);
    expect(
      (await knowledge.get(actorId, workspaceId, source, 1)).successors,
    ).toEqual([]);
  });

  it("marks a full split superseded, retains two successor revisions, and rejects stale approval", async () => {
    const source = await createContext("완전 분리 원본");
    const first = await createUnit("첫 기록");
    const second = await createUnit("둘째 기록");
    await set(first, 1, [{ contextId: source, role: "PRIMARY" }]);
    await set(second, 1, [{ contextId: source, role: "PRIMARY" }]);
    const a = randomUUID(),
      b = randomUUID();
    const createdContexts = [a, b].map((id, index) => ({
      id,
      name: `후속 ${index}`,
      purpose: "후속 목적",
      scope: "후속 범위",
      kind: "PROJECT" as const,
    }));
    const makePreview = () =>
      structure.preview({
        actorId,
        workspaceId,
        sourceContextId: source,
        kind: "SPLIT",
        idempotencyKey: randomUUID(),
        createdContexts,
        assignments: [
          {
            unitId: first,
            unitRevision: 1,
            after: [{ contextId: a, role: "PRIMARY" }],
          },
          {
            unitId: second,
            unitRevision: 1,
            after: [{ contextId: b, role: "PRIMARY" }],
          },
        ],
      });
    const stale = await makePreview();
    const valid = await makePreview();
    const apply = (outcome: typeof valid) =>
      structure.accept({
        actorId,
        workspaceId,
        proposalId: outcome.response.proposalId as string,
        signature: (outcome.response.preview as { signature: string })
          .signature,
        idempotencyKey: randomUUID(),
      });
    const applied = await apply(valid);
    await expect(apply(stale)).rejects.toMatchObject({
      code: "STRUCTURE_STALE",
    });
    const current = await knowledge.get(actorId, workspaceId, source);
    expect(current.state).toBe("SUPERSEDED");
    expect(current.supersededById).toBeNull();
    expect(current.successors.map((x) => x.contextId).sort()).toEqual(
      [a, b].sort(),
    );
    expect((await knowledge.get(actorId, workspaceId, source, 1)).state).toBe(
      "ACTIVE",
    );
    expect(
      (await knowledge.get(actorId, workspaceId, source, 1)).memberships,
    ).toHaveLength(0);
    expect(
      (await knowledge.get(actorId, workspaceId, source, 2)).successors,
    ).toHaveLength(2);
    const inverse = await structure.previewUndo(
      actorId,
      workspaceId,
      applied.response.mutationId as string,
    );
    await structure.undo({
      actorId,
      workspaceId,
      mutationId: inverse.mutationId,
      signature: inverse.signature,
      idempotencyKey: randomUUID(),
    });
    expect((await knowledge.get(actorId, workspaceId, source)).state).toBe(
      "ACTIVE",
    );
    expect((await knowledge.get(actorId, workspaceId, source, 2)).state).toBe(
      "SUPERSEDED",
    );
    expect(
      (await knowledge.get(actorId, workspaceId, source, 2)).successors,
    ).toHaveLength(2);
  });

  it("merges into an existing context and requires a fresh inverse after a touched unit changes", async () => {
    const source = await createContext("병합 원본");
    const peer = await createContext("병합 대상");
    const unit = await createUnit("병합 기록");
    await set(unit, 1, [{ contextId: source, role: "PRIMARY" }]);
    const proposal = await structure.preview({
      actorId,
      workspaceId,
      sourceContextId: source,
      peerContextId: peer,
      kind: "MERGE",
      idempotencyKey: randomUUID(),
      assignments: [
        {
          unitId: unit,
          unitRevision: 1,
          after: [{ contextId: peer, role: "PRIMARY" }],
        },
      ],
    });
    const applied = await structure.accept({
      actorId,
      workspaceId,
      proposalId: proposal.response.proposalId as string,
      signature: (proposal.response.preview as { signature: string }).signature,
      idempotencyKey: randomUUID(),
    });
    const mutationId = applied.response.mutationId as string;
    expect(
      (await knowledge.get(actorId, workspaceId, source)).supersededById,
    ).toBe(peer);
    const inverse = await structure.previewUndo(
      actorId,
      workspaceId,
      mutationId,
    );
    await set(unit, 3, [{ contextId: peer, role: "SECONDARY" }]);
    await expect(
      structure.undo({
        actorId,
        workspaceId,
        mutationId,
        signature: inverse.signature,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "STRUCTURE_CONFLICT" });
    expect((await knowledge.get(actorId, workspaceId, source)).state).toBe(
      "SUPERSEDED",
    );
    expect(
      (await knowledge.unitMemberships(actorId, workspaceId, unit)).memberships,
    ).toEqual([{ contextId: peer, role: "SECONDARY", unitRevision: 1 }]);
  });

  it("rejects a parent cycle before proposal persistence and keeps the graph unchanged", async () => {
    const a = await createContext("계층 A"),
      b = await createContext("계층 B");
    const first = await structure.preview({
      actorId,
      workspaceId,
      sourceContextId: a,
      kind: "LINK",
      idempotencyKey: randomUUID(),
      addedLinks: [{ fromContextId: a, toContextId: b, type: "PARENT_OF" }],
    });
    await structure.accept({
      actorId,
      workspaceId,
      proposalId: first.response.proposalId as string,
      signature: (first.response.preview as { signature: string }).signature,
      idempotencyKey: randomUUID(),
    });
    await expect(
      structure.preview({
        actorId,
        workspaceId,
        sourceContextId: b,
        kind: "LINK",
        idempotencyKey: randomUUID(),
        addedLinks: [{ fromContextId: b, toContextId: a, type: "PARENT_OF" }],
      }),
    ).rejects.toMatchObject({ code: "STRUCTURE_CONFLICT" });
    expect(
      (await knowledge.get(actorId, workspaceId, a)).relations,
    ).toHaveLength(1);
  });

  it("creates a parent through approval and ends only its relation on undo", async () => {
    const source = await createContext("상위 묶음의 자식");
    const parent = randomUUID();
    const proposal = await structure.preview({
      actorId,
      workspaceId,
      sourceContextId: source,
      kind: "CREATE_PARENT",
      idempotencyKey: randomUUID(),
      createdContexts: [
        {
          id: parent,
          name: "상위 묶음",
          purpose: "상위 목적",
          scope: "상위 범위",
          kind: "COLLECTION",
        },
      ],
      addedLinks: [
        { fromContextId: parent, toContextId: source, type: "PARENT_OF" },
      ],
    });
    const accepted = await structure.accept({
      actorId,
      workspaceId,
      proposalId: proposal.response.proposalId as string,
      signature: (proposal.response.preview as { signature: string }).signature,
      idempotencyKey: randomUUID(),
    });
    expect(
      (await knowledge.get(actorId, workspaceId, parent)).relations,
    ).toHaveLength(1);
    const mutationId = accepted.response.mutationId as string;
    const inverse = await structure.previewUndo(
      actorId,
      workspaceId,
      mutationId,
    );
    await structure.undo({
      actorId,
      workspaceId,
      mutationId,
      signature: inverse.signature,
      idempotencyKey: randomUUID(),
    });
    expect(
      (await knowledge.get(actorId, workspaceId, parent)).relations,
    ).toEqual([]);
    expect((await knowledge.get(actorId, workspaceId, parent)).state).toBe(
      "ACTIVE",
    );
  });

  it("rolls back memberships, contexts and lineage when the command receipt fails", async () => {
    const source = await createContext("롤백 원본");
    const unit = await createUnit("롤백 기록");
    await set(unit, 1, [{ contextId: source, role: "PRIMARY" }]);
    const child = randomUUID();
    const proposal = await structure.preview({
      actorId,
      workspaceId,
      sourceContextId: source,
      kind: "SPLIT",
      idempotencyKey: randomUUID(),
      createdContexts: [
        {
          id: child,
          name: "롤백 대상",
          purpose: "후속 목적",
          scope: "후속 범위",
          kind: "PROJECT",
        },
      ],
      assignments: [
        {
          unitId: unit,
          unitRevision: 1,
          after: [{ contextId: child, role: "PRIMARY" }],
        },
      ],
    });
    await admin.query(`CREATE FUNCTION business.be15_fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'BE15 rollback probe'; END $$`);
    await admin.query(`CREATE TRIGGER be15_fail_receipt BEFORE INSERT ON business.command_receipt
      FOR EACH ROW WHEN (NEW.kind = 'structure.accept') EXECUTE FUNCTION business.be15_fail_receipt()`);
    try {
      await expect(
        structure.accept({
          actorId,
          workspaceId,
          proposalId: proposal.response.proposalId as string,
          signature: (proposal.response.preview as { signature: string })
            .signature,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toThrow("BE15 rollback probe");
      expect(
        (await knowledge.unitMemberships(actorId, workspaceId, unit))
          .memberships,
      ).toEqual([{ contextId: source, role: "PRIMARY", unitRevision: 1 }]);
      await expect(
        knowledge.get(actorId, workspaceId, child),
      ).rejects.toMatchObject({ code: "CONTEXT_NOT_FOUND" });
      expect(
        (await knowledge.get(actorId, workspaceId, source)).successors,
      ).toEqual([]);
    } finally {
      await admin.query(
        "DROP TRIGGER be15_fail_receipt ON business.command_receipt",
      );
      await admin.query("DROP FUNCTION business.be15_fail_receipt()");
    }
  });
});
