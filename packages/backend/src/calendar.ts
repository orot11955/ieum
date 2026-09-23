import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { CommandCoordinator, CommandError } from "./command-coordinator.js";
import type { CommandOutcome } from "./command-coordinator.js";
import { IdentityService } from "./identity-service.js";
import {
  localAt,
  resolveLocalTime,
  startOfLocalDate,
  timeZoneFormat,
  validCalendarDate,
} from "./calendar-time.js";

export type EventSchedule =
  | {
      kind: "TIMED";
      timeZone: string;
      startLocal: string;
      endLocal: string;
      startOffsetMinutes?: number | undefined;
      endOffsetMinutes?: number | undefined;
    }
  | {
      kind: "ALL_DAY";
      timeZone: string;
      startDate: string;
      endDateExclusive: string;
    };
export type EventState = "CONFIRMED" | "CANCELED";
export class CalendarError extends Error {
  constructor(
    public readonly code:
      "EVENT_NOT_FOUND" | "EVENT_STATE_INVALID" | "PERIOD_TOO_LARGE",
  ) {
    super(code);
  }
}
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uuid(value: string): void {
  if (!uuidPattern.test(value)) throw new CommandError("INVALID_COMMAND");
}
function positive(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new CommandError("INVALID_COMMAND");
}
function cleanTitle(value: string): string {
  if (value.trim().length < 1 || value.length > 300 || value.includes("\u0000"))
    throw new CommandError("INVALID_COMMAND");
  return value.trim();
}
function cleanDescription(value: string): string {
  if (value.length > 10000 || value.includes("\u0000"))
    throw new CommandError("INVALID_COMMAND");
  return value;
}
interface StoredSchedule {
  kind: EventSchedule["kind"];
  timeZone: string;
  startAt: string | null;
  endAt: string | null;
  startLocal: string | null;
  endLocal: string | null;
  startOffsetMinutes: number | null;
  endOffsetMinutes: number | null;
  startDate: string | null;
  endDateExclusive: string | null;
}
function scheduleValues(value: EventSchedule): StoredSchedule {
  timeZoneFormat(value.timeZone);
  if (value.kind === "TIMED") {
    const start = resolveLocalTime(
      value.startLocal,
      value.timeZone,
      value.startOffsetMinutes,
    );
    const end = resolveLocalTime(
      value.endLocal,
      value.timeZone,
      value.endOffsetMinutes,
    );
    if (start.at >= end.at) throw new CommandError("INVALID_COMMAND");
    return {
      kind: "TIMED",
      timeZone: value.timeZone,
      startAt: start.at,
      endAt: end.at,
      startLocal: value.startLocal,
      endLocal: value.endLocal,
      startOffsetMinutes: start.offsetMinutes,
      endOffsetMinutes: end.offsetMinutes,
      startDate: null,
      endDateExclusive: null,
    };
  }
  if (value.kind === "ALL_DAY") {
    if (
      !validCalendarDate(value.startDate) ||
      !validCalendarDate(value.endDateExclusive) ||
      value.startDate >= value.endDateExclusive
    )
      throw new CommandError("INVALID_COMMAND");
    return {
      kind: "ALL_DAY",
      timeZone: value.timeZone,
      startAt: null,
      endAt: null,
      startLocal: null,
      endLocal: null,
      startOffsetMinutes: null,
      endOffsetMinutes: null,
      startDate: value.startDate,
      endDateExclusive: value.endDateExclusive,
    };
  }
  throw new CommandError("INVALID_COMMAND");
}
interface EventRow {
  id: string;
  title: string;
  description: string;
  state: EventState;
  version: number;
  schedule_kind: "TIMED" | "ALL_DAY";
  time_zone: string;
  start_at: Date | null;
  end_at: Date | null;
  start_local: string | null;
  end_local: string | null;
  start_offset_minutes: number | null;
  end_offset_minutes: number | null;
  start_date: string | null;
  end_date_exclusive: string | null;
  created_at: Date;
  updated_at: Date;
}
const selectEvent =
  "SELECT id,title,description,state,version,schedule_kind,time_zone,start_at,end_at,start_local,end_local,start_offset_minutes,end_offset_minutes,start_date::text AS start_date,end_date_exclusive::text AS end_date_exclusive,created_at,updated_at FROM business.calendar_event";
function view(row: EventRow, viewTimeZone?: string) {
  const schedule =
    row.schedule_kind === "TIMED"
      ? {
          kind: "TIMED" as const,
          timeZone: row.time_zone,
          startLocal: row.start_local!,
          endLocal: row.end_local!,
          startOffsetMinutes: row.start_offset_minutes!,
          endOffsetMinutes: row.end_offset_minutes!,
          startAt: row.start_at!.toISOString(),
          endAt: row.end_at!.toISOString(),
          ...(viewTimeZone
            ? {
                displayStartLocal: localAt(
                  row.start_at!.toISOString(),
                  viewTimeZone,
                ),
                displayEndLocal: localAt(
                  row.end_at!.toISOString(),
                  viewTimeZone,
                ),
              }
            : {}),
        }
      : {
          kind: "ALL_DAY" as const,
          timeZone: row.time_zone,
          startDate: row.start_date!,
          endDateExclusive: row.end_date_exclusive!,
        };
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    state: row.state,
    version: row.version,
    schedule,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
function audit(
  action: string,
  id: string,
  before: number | null,
  after: number,
  fields: string[],
  requestId?: string,
) {
  return {
    action,
    targetType: "calendar_event",
    targetId: id,
    beforeVersion: before,
    afterVersion: after,
    changedFieldNames: fields,
    ...(requestId ? { requestId } : {}),
  };
}
function scope(actual: string, expected: string): void {
  if (actual !== expected) throw new CalendarError("EVENT_NOT_FOUND");
}
/** Reuses calendar time/DST validation inside an authorized command transaction. */
export async function insertExtractedEventInTransaction(
  client: PoolClient,
  input: {
    workspaceId: string;
    actorId: string;
    title: string;
    description: string;
    schedule: EventSchedule;
  },
): Promise<string> {
  const cleanName = cleanTitle(input.title);
  const cleanBody = cleanDescription(input.description);
  const schedule = scheduleValues(input.schedule);
  const id = randomUUID();
  await client.query(
    `INSERT INTO business.calendar_event
     (id,workspace_id,created_by_id,title,description,schedule_kind,time_zone,start_at,end_at,start_local,end_local,start_offset_minutes,end_offset_minutes,start_date,end_date_exclusive)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      id,
      input.workspaceId,
      input.actorId,
      cleanName,
      cleanBody,
      schedule.kind,
      schedule.timeZone,
      schedule.startAt,
      schedule.endAt,
      schedule.startLocal,
      schedule.endLocal,
      schedule.startOffsetMinutes,
      schedule.endOffsetMinutes,
      schedule.startDate,
      schedule.endDateExclusive,
    ],
  );
  return id;
}

export class CalendarService {
  constructor(
    private readonly identity: IdentityService,
    private readonly commands: CommandCoordinator,
  ) {}

  async create(input: {
    actorId: string;
    workspaceId: string;
    idempotencyKey: string;
    title: string;
    description?: string;
    schedule: EventSchedule;
    requestId?: string;
  }): Promise<CommandOutcome> {
    const title = cleanTitle(input.title),
      description = cleanDescription(input.description ?? ""),
      schedule = scheduleValues(input.schedule);
    return this.commands.execute({
      actorId: input.actorId,
      kind: "calendar.create",
      idempotencyKey: input.idempotencyKey,
      payload: { workspaceId: input.workspaceId, title, description, schedule },
      apply: async (client, access) => {
        scope(access.workspaceId, input.workspaceId);
        const id = randomUUID();
        await client.query(
          "INSERT INTO business.calendar_event (id,workspace_id,created_by_id,title,description,schedule_kind,time_zone,start_at,end_at,start_local,end_local,start_offset_minutes,end_offset_minutes,start_date,end_date_exclusive) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
          [
            id,
            access.workspaceId,
            input.actorId,
            title,
            description,
            schedule.kind,
            schedule.timeZone,
            schedule.startAt,
            schedule.endAt,
            schedule.startLocal,
            schedule.endLocal,
            schedule.startOffsetMinutes,
            schedule.endOffsetMinutes,
            schedule.startDate,
            schedule.endDateExclusive,
          ],
        );
        return {
          response: { id, version: 1, state: "CONFIRMED" },
          audit: audit(
            "calendar.create",
            id,
            null,
            1,
            ["title", "description", "schedule"],
            input.requestId,
          ),
        };
      },
    });
  }

  private async lock(
    client: PoolClient,
    workspaceId: string,
    id: string,
  ): Promise<EventRow> {
    const result = await client.query<EventRow>(
      `${selectEvent} WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
      [workspaceId, id],
    );
    const row = result.rows[0];
    if (!row) throw new CalendarError("EVENT_NOT_FOUND");
    return row;
  }

  async edit(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    baseVersion: number;
    title?: string;
    description?: string;
    schedule?: EventSchedule;
    requestId?: string;
  }): Promise<CommandOutcome> {
    uuid(input.id);
    positive(input.baseVersion);
    if (
      input.title === undefined &&
      input.description === undefined &&
      input.schedule === undefined
    )
      throw new CommandError("INVALID_COMMAND");
    const title =
        input.title === undefined ? undefined : cleanTitle(input.title),
      description =
        input.description === undefined
          ? undefined
          : cleanDescription(input.description),
      schedule =
        input.schedule === undefined
          ? undefined
          : scheduleValues(input.schedule);
    return this.commands.execute({
      actorId: input.actorId,
      kind: "calendar.edit",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        id: input.id,
        baseVersion: input.baseVersion,
        title: title ?? null,
        description: description ?? null,
        schedule: schedule ?? null,
      },
      apply: async (client, access) => {
        scope(access.workspaceId, input.workspaceId);
        const row = await this.lock(client, access.workspaceId, input.id);
        if (row.version !== input.baseVersion)
          throw new CommandError("VERSION_CONFLICT", row.version);
        const next = row.version + 1;
        await client.query(
          "UPDATE business.calendar_event SET title=$3,description=$4,schedule_kind=$5,time_zone=$6,start_at=$7,end_at=$8,start_local=$9,end_local=$10,start_offset_minutes=$11,end_offset_minutes=$12,start_date=$13,end_date_exclusive=$14,version=$15,updated_at=now() WHERE workspace_id=$1 AND id=$2",
          [
            access.workspaceId,
            input.id,
            title ?? row.title,
            description ?? row.description,
            schedule?.kind ?? row.schedule_kind,
            schedule?.timeZone ?? row.time_zone,
            schedule ? schedule.startAt : row.start_at,
            schedule ? schedule.endAt : row.end_at,
            schedule ? schedule.startLocal : row.start_local,
            schedule ? schedule.endLocal : row.end_local,
            schedule ? schedule.startOffsetMinutes : row.start_offset_minutes,
            schedule ? schedule.endOffsetMinutes : row.end_offset_minutes,
            schedule ? schedule.startDate : row.start_date,
            schedule ? schedule.endDateExclusive : row.end_date_exclusive,
            next,
          ],
        );
        const fields = [
          input.title !== undefined ? "title" : null,
          input.description !== undefined ? "description" : null,
          input.schedule !== undefined ? "schedule" : null,
        ].filter((v): v is string => v !== null);
        return {
          response: { id: input.id, version: next, state: row.state },
          audit: audit(
            "calendar.edit",
            input.id,
            row.version,
            next,
            fields,
            input.requestId,
          ),
        };
      },
    });
  }

  async setState(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    baseVersion: number;
    targetState: EventState;
    requestId?: string;
  }): Promise<CommandOutcome> {
    uuid(input.id);
    positive(input.baseVersion);
    if (input.targetState !== "CONFIRMED" && input.targetState !== "CANCELED")
      throw new CommandError("INVALID_COMMAND");
    return this.commands.execute({
      actorId: input.actorId,
      kind: "calendar.set_state",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        id: input.id,
        baseVersion: input.baseVersion,
        targetState: input.targetState,
      },
      apply: async (client, access) => {
        scope(access.workspaceId, input.workspaceId);
        const row = await this.lock(client, access.workspaceId, input.id);
        if (row.version !== input.baseVersion)
          throw new CommandError("VERSION_CONFLICT", row.version);
        if (row.state === input.targetState)
          throw new CalendarError("EVENT_STATE_INVALID");
        const next = row.version + 1;
        await client.query(
          "UPDATE business.calendar_event SET state=$3,version=$4,updated_at=now() WHERE workspace_id=$1 AND id=$2",
          [access.workspaceId, input.id, input.targetState, next],
        );
        return {
          response: { id: input.id, version: next, state: input.targetState },
          audit: audit(
            "calendar.set_state",
            input.id,
            row.version,
            next,
            ["state"],
            input.requestId,
          ),
        };
      },
    });
  }

  async get(actorId: string, workspaceId: string, id: string) {
    uuid(id);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        scope(access.workspaceId, workspaceId);
        const result = await client.query<EventRow>(
          `${selectEvent} WHERE workspace_id=$1 AND id=$2`,
          [workspaceId, id],
        );
        if (!result.rows[0]) throw new CalendarError("EVENT_NOT_FOUND");
        return { ...view(result.rows[0]), workspaceId };
      },
    );
  }

  async list(
    actorId: string,
    workspaceId: string,
    fromDate: string,
    toDateExclusive: string,
    viewTimeZone: string,
    includeCanceled = false,
  ) {
    if (
      !validCalendarDate(fromDate) ||
      !validCalendarDate(toDateExclusive) ||
      fromDate >= toDateExclusive
    )
      throw new CommandError("INVALID_COMMAND");
    const days =
      (Date.parse(`${toDateExclusive}T00:00:00Z`) -
        Date.parse(`${fromDate}T00:00:00Z`)) /
      86_400_000;
    if (days > 366) throw new CalendarError("PERIOD_TOO_LARGE");
    const fromAt = startOfLocalDate(fromDate, viewTimeZone),
      toAt = startOfLocalDate(toDateExclusive, viewTimeZone);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        scope(access.workspaceId, workspaceId);
        const result = await client.query<EventRow>(
          `${selectEvent} WHERE workspace_id=$1 AND ($2::boolean OR state='CONFIRMED') AND ((schedule_kind='TIMED' AND start_at<$4::timestamptz AND end_at>$3::timestamptz) OR (schedule_kind='ALL_DAY' AND start_date<$6::date AND end_date_exclusive>$5::date)) ORDER BY COALESCE(start_at, start_date::timestamp AT TIME ZONE 'UTC'),id LIMIT 501`,
          [
            workspaceId,
            includeCanceled,
            fromAt,
            toAt,
            fromDate,
            toDateExclusive,
          ],
        );
        if (result.rows.length > 500)
          throw new CalendarError("PERIOD_TOO_LARGE");
        const intervals = result.rows.map((row) =>
          row.schedule_kind === "TIMED"
            ? [row.start_at!.getTime(), row.end_at!.getTime()]
            : [
                Date.parse(startOfLocalDate(row.start_date!, viewTimeZone)),
                Date.parse(
                  startOfLocalDate(row.end_date_exclusive!, viewTimeZone),
                ),
              ],
        );
        const events = result.rows.map((row, i) => ({
          ...view(row, viewTimeZone),
          overlappingEventIds: result.rows
            .filter(
              (_, j) =>
                i !== j &&
                intervals[i]![0]! < intervals[j]![1]! &&
                intervals[j]![0]! < intervals[i]![1]!,
            )
            .map((other) => other.id),
        }));
        return { fromDate, toDateExclusive, viewTimeZone, events };
      },
    );
  }
}
