import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CalendarService } from "../src/calendar.js";
import { CalendarTimeError } from "../src/calendar-time.js";
import {
  CommandCoordinator,
  CommandError,
} from "../src/command-coordinator.js";
import { IdentityService } from "../src/identity-service.js";
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

describe("BE-10 calendar schedule and period boundaries", () => {
  let container: StartedPostgreSqlContainer,
    admin: Pool,
    app: Pool,
    lock: Pool,
    calendar: CalendarService;
  const actorId = "be10-user",
    workspaceId = randomUUID(),
    foreignWorkspaceId = randomUUID();
  beforeAll(async () => {
    container = await new PostgreSqlContainer(image)
      .withDatabase("ieum_be10")
      .withUsername("postgres")
      .withPassword("be10_fixture_only")
      .start();
    admin = new Pool({ connectionString: container.getConnectionUri() });
    await migrate(drizzle(admin), { migrationsFolder: authMigrations });
    await admin.query(rolesSql);
    await migrate(drizzle(admin), {
      migrationsFolder: businessMigrations,
      migrationsSchema: "drizzle_business",
    });
    await admin.query(
      "INSERT INTO auth.\"user\" (id,name,email) VALUES ($1,'BE10','be10@example.test')",
      [actorId],
    );
    await admin.query(
      "CREATE ROLE ieum_be10_app LOGIN PASSWORD 'be10_fixture_only' IN ROLE ieum_application",
    );
    const url = new URL(container.getConnectionUri());
    url.username = "ieum_be10_app";
    url.password = "be10_fixture_only";
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
    calendar = new CalendarService(identity, new CommandCoordinator(identity));
  }, 120_000);
  afterAll(async () => {
    await app?.end();
    await lock?.end();
    await admin?.end();
    await container?.stop();
  });

  it("stores an exclusive one-day event across the month boundary", async () => {
    const created = await calendar.create({
      actorId,
      workspaceId,
      idempotencyKey: "be10-allday-01",
      title: "휴일",
      schedule: {
        kind: "ALL_DAY",
        timeZone: "Asia/Seoul",
        startDate: "2024-02-29",
        endDateExclusive: "2024-03-01",
      },
    });
    expect(created.response).toHaveProperty(
      "id",
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    const id = created.response.id as string;
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect((await calendar.get(actorId, workspaceId, id)).schedule).toEqual({
      kind: "ALL_DAY",
      timeZone: "Asia/Seoul",
      startDate: "2024-02-29",
      endDateExclusive: "2024-03-01",
    });
    expect(
      (
        await calendar.list(
          actorId,
          workspaceId,
          "2024-02-29",
          "2024-03-01",
          "Asia/Seoul",
        )
      ).events.map((event) => event.id),
    ).toContain(id);
    expect(
      (
        await calendar.list(
          actorId,
          workspaceId,
          "2024-03-01",
          "2024-03-02",
          "Asia/Seoul",
        )
      ).events.map((event) => event.id),
    ).not.toContain(id);
    await expect(
      calendar.create({
        actorId,
        workspaceId,
        idempotencyKey: "be10-allday-02",
        title: "역순",
        schedule: {
          kind: "ALL_DAY",
          timeZone: "Asia/Seoul",
          startDate: "2024-03-01",
          endDateExclusive: "2024-03-01",
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  });

  it("preserves the original wall time and renders another zone explicitly", async () => {
    const created = await calendar.create({
      actorId,
      workspaceId,
      idempotencyKey: "be10-timed-01",
      title: "회의",
      schedule: {
        kind: "TIMED",
        timeZone: "Asia/Seoul",
        startLocal: "2024-06-01T09:30:00",
        endLocal: "2024-06-01T10:30:00",
      },
    });
    const id = created.response.id as string;
    const schedule = (await calendar.get(actorId, workspaceId, id)).schedule;
    expect(schedule).toMatchObject({
      kind: "TIMED",
      startLocal: "2024-06-01T09:30:00",
      startAt: "2024-06-01T00:30:00.000Z",
      startOffsetMinutes: 540,
    });
    const ny = await calendar.list(
      actorId,
      workspaceId,
      "2024-05-31",
      "2024-06-01",
      "America/New_York",
    );
    expect(ny.events.find((event) => event.id === id)?.schedule).toMatchObject({
      displayStartLocal: "2024-05-31T20:30:00",
    });
    expect(
      (
        await calendar.list(
          actorId,
          workspaceId,
          "2024-06-01",
          "2024-06-02",
          "America/New_York",
        )
      ).events.map((event) => event.id),
    ).not.toContain(id);
  });

  it("rejects gap, unresolved fold and end before start, but accepts an explicit fold offset", async () => {
    const base = { actorId, workspaceId, title: "DST" };
    await expect(
      calendar.create({
        ...base,
        idempotencyKey: "be10-gap-0001",
        schedule: {
          kind: "TIMED",
          timeZone: "America/New_York",
          startLocal: "2024-03-10T02:30:00",
          endLocal: "2024-03-10T03:30:00",
        },
      }),
    ).rejects.toBeInstanceOf(CalendarTimeError);
    await expect(
      calendar.create({
        ...base,
        idempotencyKey: "be10-fold-001",
        schedule: {
          kind: "TIMED",
          timeZone: "America/New_York",
          startLocal: "2024-11-03T01:30:00",
          endLocal: "2024-11-03T02:30:00",
        },
      }),
    ).rejects.toMatchObject({ code: "AMBIGUOUS_LOCAL_TIME" });
    const folded = await calendar.create({
      ...base,
      idempotencyKey: "be10-fold-002",
      schedule: {
        kind: "TIMED",
        timeZone: "America/New_York",
        startLocal: "2024-11-03T01:30:00",
        startOffsetMinutes: -300,
        endLocal: "2024-11-03T02:30:00",
      },
    });
    expect(
      (await calendar.get(actorId, workspaceId, folded.response.id as string))
        .schedule,
    ).toMatchObject({
      startAt: "2024-11-03T06:30:00.000Z",
      startOffsetMinutes: -300,
    });
    await expect(
      calendar.create({
        ...base,
        idempotencyKey: "be10-order-001",
        schedule: {
          kind: "TIMED",
          timeZone: "UTC",
          startLocal: "2024-06-01T11:00:00",
          endLocal: "2024-06-01T10:00:00",
        },
      }),
    ).rejects.toBeInstanceOf(CommandError);
    await expect(
      calendar.create({
        ...base,
        idempotencyKey: "be10-zone-0001",
        schedule: {
          kind: "TIMED",
          timeZone: "",
          startLocal: "2024-06-01T10:00:00",
          endLocal: "2024-06-01T11:00:00",
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_TIME_ZONE" });
  });

  it("reports overlaps, handles edits/cancel/restore, conflicts and scoped access", async () => {
    const first = await calendar.create({
      actorId,
      workspaceId,
      idempotencyKey: "be10-flow-0001",
      title: "첫 일정",
      schedule: {
        kind: "TIMED",
        timeZone: "UTC",
        startLocal: "2024-08-01T09:00:00",
        endLocal: "2024-08-01T10:00:00",
      },
    });
    const second = await calendar.create({
      actorId,
      workspaceId,
      idempotencyKey: "be10-flow-0002",
      title: "겹침",
      schedule: {
        kind: "TIMED",
        timeZone: "UTC",
        startLocal: "2024-08-01T09:30:00",
        endLocal: "2024-08-01T10:30:00",
      },
    });
    const id = first.response.id as string;
    let listing = await calendar.list(
      actorId,
      workspaceId,
      "2024-08-01",
      "2024-08-02",
      "UTC",
    );
    expect(
      listing.events.find((event) => event.id === id)?.overlappingEventIds,
    ).toContain(second.response.id);
    const changed = await calendar.edit({
      actorId,
      workspaceId,
      id,
      baseVersion: 1,
      idempotencyKey: "be10-flow-0003",
      schedule: {
        kind: "ALL_DAY",
        timeZone: "UTC",
        startDate: "2024-08-02",
        endDateExclusive: "2024-08-03",
      },
    });
    expect(changed.response.version).toBe(2);
    await expect(
      calendar.edit({
        actorId,
        workspaceId,
        id,
        baseVersion: 1,
        idempotencyKey: "be10-flow-0004",
        title: "오래된 수정",
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const canceled = await calendar.setState({
      actorId,
      workspaceId,
      id,
      baseVersion: 2,
      targetState: "CANCELED",
      idempotencyKey: "be10-flow-0005",
    });
    expect(canceled.response.version).toBe(3);
    listing = await calendar.list(
      actorId,
      workspaceId,
      "2024-08-02",
      "2024-08-03",
      "UTC",
    );
    expect(listing.events.map((event) => event.id)).not.toContain(id);
    expect(
      (
        await calendar.list(
          actorId,
          workspaceId,
          "2024-08-02",
          "2024-08-03",
          "UTC",
          true,
        )
      ).events.map((event) => event.id),
    ).toContain(id);
    const restored = await calendar.setState({
      actorId,
      workspaceId,
      id,
      baseVersion: 3,
      targetState: "CONFIRMED",
      idempotencyKey: "be10-flow-0006",
    });
    expect(restored.response.version).toBe(4);
    await expect(
      calendar.get(actorId, foreignWorkspaceId, id),
    ).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
    await expect(
      withWorkspaceTransaction(app, foreignWorkspaceId, (client) =>
        client.query("SELECT id FROM business.calendar_event WHERE id=$1", [
          id,
        ]),
      ),
    ).resolves.toMatchObject({ rowCount: 0 });
    await expect(
      app.query("SELECT id FROM business.calendar_event WHERE id=$1", [id]),
    ).resolves.toMatchObject({ rowCount: 0 });
    await expect(
      app.query("UPDATE business.calendar_event SET title='leak' WHERE id=$1", [
        id,
      ]),
    ).resolves.toMatchObject({ rowCount: 0 });
    await expect(
      withWorkspaceTransaction(app, foreignWorkspaceId, (client) =>
        client.query(
          "UPDATE business.calendar_event SET title='leak' WHERE id=$1",
          [id],
        ),
      ),
    ).resolves.toMatchObject({ rowCount: 0 });
    await expect(
      withWorkspaceTransaction(app, foreignWorkspaceId, (client) =>
        client.query(
          "INSERT INTO business.calendar_event (workspace_id,created_by_id,title,schedule_kind,time_zone,start_date,end_date_exclusive) VALUES ($1,$2,'leak','ALL_DAY','UTC','2024-08-01','2024-08-02')",
          [workspaceId, actorId],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("rejects an overfull period instead of silently hiding event rows", async () => {
    await withWorkspaceTransaction(app, workspaceId, (client) =>
      client.query(
        "INSERT INTO business.calendar_event (workspace_id,created_by_id,title,schedule_kind,time_zone,start_date,end_date_exclusive) SELECT $1,$2,'fixture','ALL_DAY','UTC','2024-09-01','2024-09-02' FROM generate_series(1,501)",
        [workspaceId, actorId],
      ),
    );
    await expect(
      calendar.list(actorId, workspaceId, "2024-09-01", "2024-09-02", "UTC"),
    ).rejects.toMatchObject({ code: "PERIOD_TOO_LARGE" });
  });
});
