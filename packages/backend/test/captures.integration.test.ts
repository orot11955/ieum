import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CaptureError, CaptureService } from "../src/captures.js";
import {
  CommandCoordinator,
  CommandError,
} from "../src/command-coordinator.js";
import { IdentityService } from "../src/identity-service.js";
import { withWorkspaceTransaction } from "../src/platform/database/scope.js";

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
const image =
  "postgres:18.4-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15";

describe("BE-07 immutable capture and unit revisions", () => {
  let container: StartedPostgreSqlContainer;
  let admin: Pool;
  let app: Pool;
  let lock: Pool;
  let captures: CaptureService;
  const actorId = "be07-user";
  const workspaceId = randomUUID();
  const otherWorkspaceId = randomUUID();

  beforeAll(async () => {
    container = await new PostgreSqlContainer(image)
      .withDatabase("ieum_be07")
      .withUsername("postgres")
      .withPassword("be07_fixture_only")
      .start();
    admin = new Pool({ connectionString: container.getConnectionUri() });
    await migrate(drizzle(admin), { migrationsFolder: authMigrations });
    await admin.query(rolesSql);
    await migrate(drizzle(admin), {
      migrationsFolder: businessMigrations,
      migrationsSchema: "drizzle_business",
    });
    await admin.query(
      "INSERT INTO auth.\"user\" (id, name, email) VALUES ($1, 'BE07', 'be07@example.test')",
      [actorId],
    );
    await admin.query(
      "CREATE ROLE ieum_be07_app LOGIN PASSWORD 'be07_fixture_only' IN ROLE ieum_application",
    );
    const url = new URL(container.getConnectionUri());
    url.username = "ieum_be07_app";
    url.password = "be07_fixture_only";
    app = new Pool({ connectionString: url.toString(), max: 3 });
    lock = new Pool({ connectionString: url.toString(), max: 1 });
    await withWorkspaceTransaction(app, workspaceId, async (client) => {
      await client.query(
        "INSERT INTO business.workspace (id, personal_owner_id) VALUES ($1, $2)",
        [workspaceId, actorId],
      );
      await client.query(
        "INSERT INTO business.workspace_member (workspace_id, user_id) VALUES ($1, $2)",
        [workspaceId, actorId],
      );
      await client.query(
        "INSERT INTO business.user_access (user_id, personal_workspace_id) VALUES ($1, $2)",
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
    captures = new CaptureService(identity, new CommandCoordinator(identity));
  }, 120_000);

  afterAll(async () => {
    await Promise.all([app?.end(), lock?.end(), admin?.end()]);
    await container?.stop();
  }, 120_000);

  it("keeps raw revisions and UTF-16 unit spans while splitting, editing and archiving", async () => {
    const input = {
      actorId,
      workspaceId,
      idempotencyKey: "capture-create-01",
      title: "첫 기록",
      rawBody: "A😀B",
      sourceKind: "manual" as const,
    };
    const created = await captures.create(input);
    const id = created.response.id as string;
    expect(created.response).toMatchObject({ revision: 1, version: 1 });
    expect(await captures.create(input)).toMatchObject({
      commandId: created.commandId,
      replayed: true,
    });
    const initial = await captures.get(actorId, workspaceId, id);
    expect(initial.rawBody).toBe("A😀B");
    expect(initial.units.map((unit) => unit.sourceSpan)).toEqual([
      { start: 0, end: 4, encoding: "utf16" },
    ]);
    expect(initial.units[0]?.content.text).toBe("A😀B");

    await expect(
      captures.split({
        actorId,
        workspaceId,
        id,
        idempotencyKey: "invalid-split-01",
        baseVersion: 1,
        captureRevision: 1,
        spans: [
          { start: 0, end: 2, encoding: "utf16" },
          { start: 2, end: 4, encoding: "utf16" },
        ],
      }),
    ).rejects.toMatchObject({ code: "INVALID_SPANS" });
    expect((await captures.get(actorId, workspaceId, id)).version).toBe(1);
    const split = await captures.split({
      actorId,
      workspaceId,
      id,
      idempotencyKey: "valid-split-001",
      baseVersion: 1,
      captureRevision: 1,
      spans: [
        { start: 0, end: 1, encoding: "utf16" },
        { start: 1, end: 3, encoding: "utf16" },
        { start: 3, end: 4, encoding: "utf16" },
      ],
    });
    expect(split.response).toMatchObject({ version: 2, unitSetVersion: 2 });
    const splitView = await captures.get(actorId, workspaceId, id);
    expect(
      splitView.units
        .filter((unit) => unit.state === "ACTIVE")
        .map((unit) => unit.content.text),
    ).toEqual(["A", "😀", "B"]);
    expect(
      splitView.units.filter((unit) => unit.state === "SUPERSEDED"),
    ).toHaveLength(1);

    const revised = await captures.revise({
      actorId,
      workspaceId,
      id,
      idempotencyKey: "capture-revise-01",
      baseVersion: 2,
      title: "고친 기록",
      rawBody: "C😀D",
    });
    expect(revised.response).toMatchObject({ revision: 2, version: 3 });
    const old = await captures.get(actorId, workspaceId, id, 1);
    expect(old).toMatchObject({
      title: "첫 기록",
      rawBody: "A😀B",
      revision: 1,
    });
    expect(old.units).toHaveLength(4);
    const latest = await captures.get(actorId, workspaceId, id);
    expect(latest).toMatchObject({
      title: "고친 기록",
      rawBody: "C😀D",
      currentRevision: 2,
    });
    expect(latest.units.map((unit) => unit.content.text)).toEqual(["C😀D"]);
    await expect(
      captures.revise({
        actorId,
        workspaceId,
        id,
        idempotencyKey: "capture-stale-001",
        baseVersion: 2,
        title: "stale",
        rawBody: "stale",
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 3 });

    const archived = await captures.archive({
      actorId,
      workspaceId,
      id,
      idempotencyKey: "capture-archive1",
      baseVersion: 3,
    });
    expect(archived.response).toMatchObject({ state: "ARCHIVED", version: 4 });
    expect(
      (await captures.list(actorId, workspaceId)).captures.some(
        (item) => item.id === id,
      ),
    ).toBe(false);
    expect(
      (await captures.list(actorId, workspaceId, true)).captures.some(
        (item) => item.id === id,
      ),
    ).toBe(true);
    await expect(
      captures.revise({
        actorId,
        workspaceId,
        id,
        idempotencyKey: "capture-after-archive",
        baseVersion: 4,
        title: "x",
        rawBody: "x",
      }),
    ).rejects.toBeInstanceOf(CaptureError);
    expect((await captures.get(actorId, workspaceId, id, 1)).rawBody).toBe(
      "A😀B",
    );
    await expect(
      withWorkspaceTransaction(app, workspaceId, (client) =>
        client.query(
          "UPDATE business.capture_revision SET raw_body = 'tampered' WHERE capture_id = $1",
          [id],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      withWorkspaceTransaction(app, workspaceId, (client) =>
        client.query(
          "UPDATE business.thought_unit_revision SET content_text = 'tampered' WHERE capture_id = $1",
          [id],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      withWorkspaceTransaction(app, workspaceId, (client) =>
        client.query(
          "UPDATE business.capture SET origin_key = 'tampered' WHERE id = $1",
          [id],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      withWorkspaceTransaction(app, workspaceId, (client) =>
        client.query(
          "UPDATE business.capture SET current_revision = 999 WHERE id = $1",
          [id],
        ),
      ),
    ).rejects.toMatchObject({ code: "23503" });
  }, 30_000);

  it("deduplicates source keys, rejects cross-workspace reads and protects concurrent versions", async () => {
    const sourceInput = {
      actorId,
      workspaceId,
      idempotencyKey: "import-create-001",
      title: "수집",
      rawBody: "원문",
      sourceKind: "import" as const,
      sourceKey: "remote-001",
    };
    const created = await captures.create(sourceInput);
    await expect(
      captures.create({ ...sourceInput, idempotencyKey: "import-create-002" }),
    ).rejects.toMatchObject({ code: "SOURCE_DUPLICATE" });
    const duplicateRace = await Promise.allSettled([
      captures.create({
        ...sourceInput,
        sourceKey: "remote-race",
        idempotencyKey: "import-race-key-a",
      }),
      captures.create({
        ...sourceInput,
        sourceKey: "remote-race",
        idempotencyKey: "import-race-key-b",
      }),
    ]);
    expect(
      duplicateRace.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      duplicateRace.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      duplicateRace.find((result) => result.status === "rejected"),
    ).toMatchObject({
      reason: expect.objectContaining({ code: "SOURCE_DUPLICATE" }),
    });
    await expect(
      captures.get(actorId, otherWorkspaceId, created.response.id as string),
    ).rejects.toMatchObject({ code: "CAPTURE_NOT_FOUND" });
    await expect(
      captures.create({
        ...sourceInput,
        idempotencyKey: "import-other-workspace",
        workspaceId: otherWorkspaceId,
      }),
    ).rejects.toMatchObject({ code: "CAPTURE_NOT_FOUND" });
    const hidden = await withWorkspaceTransaction(
      app,
      otherWorkspaceId,
      (client) =>
        client.query("SELECT id FROM business.capture WHERE id = $1", [
          created.response.id,
        ]),
    );
    expect(hidden.rowCount).toBe(0);

    const id = created.response.id as string;
    const firstPage = await captures.list(
      actorId,
      workspaceId,
      true,
      undefined,
      1,
    );
    expect(firstPage.captures).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await captures.list(
      actorId,
      workspaceId,
      true,
      firstPage.nextCursor ?? undefined,
      1,
    );
    expect(secondPage.captures).toHaveLength(1);
    expect(secondPage.captures[0]?.id).not.toBe(firstPage.captures[0]?.id);
    await expect(
      captures.list(actorId, workspaceId, true, "bad-cursor"),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    const changes = await Promise.allSettled([
      captures.revise({
        actorId,
        workspaceId,
        id,
        idempotencyKey: "concurrent-revise-a",
        baseVersion: 1,
        title: "A",
        rawBody: "A",
      }),
      captures.revise({
        actorId,
        workspaceId,
        id,
        idempotencyKey: "concurrent-revise-b",
        baseVersion: 1,
        title: "B",
        rawBody: "B",
      }),
    ]);
    expect(
      changes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      changes.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      changes.find((result) => result.status === "rejected"),
    ).toMatchObject({
      reason: expect.objectContaining({ code: "VERSION_CONFLICT" }),
    });
    expect((await captures.get(actorId, workspaceId, id)).version).toBe(2);
    await expect(
      captures.create({
        actorId,
        workspaceId,
        idempotencyKey: "malformed-surrogate",
        title: "bad",
        rawBody: "\ud800",
        sourceKind: "manual",
      }),
    ).rejects.toBeInstanceOf(CommandError);
  }, 30_000);
});
