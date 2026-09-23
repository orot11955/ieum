import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { insertCaptureInTransaction, CaptureError } from "./captures.js";
import { CommandCoordinator, CommandError } from "./command-coordinator.js";
import type { CommandOutcome } from "./command-coordinator.js";
import { IdentityService } from "./identity-service.js";

export type TaskState =
  "TODO" | "IN_PROGRESS" | "ON_HOLD" | "DONE" | "CANCELED";
export type TaskDue =
  | { kind: "NONE" }
  | { kind: "DATE"; date: string }
  | { kind: "INSTANT"; at: string; timeZone: string };
export type TaskErrorCode =
  | "TASK_NOT_FOUND"
  | "TASK_TRANSITION_INVALID"
  | "TASK_RESULT_DUPLICATE"
  | "TASK_CONTEXT_INVALID"
  | "TASK_ORIGIN_INVALID";
export class TaskError extends Error {
  constructor(public readonly code: TaskErrorCode) {
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
function title(value: string): string {
  if (value.trim().length < 1 || value.length > 300 || value.includes("\u0000"))
    throw new CommandError("INVALID_COMMAND");
  return value.trim();
}
function description(value: string): string {
  if (value.length > 10000 || value.includes("\u0000"))
    throw new CommandError("INVALID_COMMAND");
  return value;
}
function validDate(value: string): boolean {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith("0000"))
    return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
function dueValues(value: TaskDue): {
  kind: string;
  date: string | null;
  at: string | null;
  timeZone: string | null;
} {
  if (value.kind === "NONE")
    return { kind: "NONE", date: null, at: null, timeZone: null };
  if (value.kind === "DATE") {
    if (!validDate(value.date)) throw new CommandError("INVALID_COMMAND");
    return { kind: "DATE", date: value.date, at: null, timeZone: null };
  }
  if (value.kind === "INSTANT") {
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        value.at,
      ) ||
      !Number.isFinite(Date.parse(value.at)) ||
      value.timeZone.length < 1 ||
      value.timeZone.length > 100
    )
      throw new CommandError("INVALID_COMMAND");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value.timeZone });
    } catch {
      throw new CommandError("INVALID_COMMAND");
    }
    return {
      kind: "INSTANT",
      date: null,
      at: new Date(value.at).toISOString(),
      timeZone: value.timeZone,
    };
  }
  throw new CommandError("INVALID_COMMAND");
}
function sqlConstraint(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "constraint" in error &&
    typeof error.constraint === "string"
    ? error.constraint
    : undefined;
}
function audit(
  action: string,
  id: string,
  before: number | null,
  after: number | null,
  fields: string[],
  requestId?: string,
) {
  return {
    action,
    targetType: "task",
    targetId: id,
    beforeVersion: before,
    afterVersion: after,
    changedFieldNames: fields,
    ...(requestId ? { requestId } : {}),
  };
}
function scope(actual: string, expected: string): void {
  if (actual !== expected) throw new TaskError("TASK_NOT_FOUND");
}
interface TaskRow {
  id: string;
  title: string;
  description: string;
  state: TaskState;
  version: number;
  due_kind: "NONE" | "DATE" | "INSTANT";
  due_date: string | null;
  due_at: Date | null;
  due_time_zone: string | null;
  context_id: string | null;
  origin_kind: string;
  origin_unit_id: string | null;
  origin_unit_revision: number | null;
  completed_at: Date | null;
  completion_version: number | null;
  created_at: Date;
  updated_at: Date;
}
function dueFromRow(row: TaskRow): TaskDue {
  if (row.due_kind === "DATE") return { kind: "DATE", date: row.due_date! };
  if (row.due_kind === "INSTANT")
    return {
      kind: "INSTANT",
      at: row.due_at!.toISOString(),
      timeZone: row.due_time_zone!,
    };
  return { kind: "NONE" };
}
function view(row: TaskRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    state: row.state,
    version: row.version,
    due: dueFromRow(row),
    contextId: row.context_id,
    origin: {
      kind: "EXPLICIT" as const,
      unitId: row.origin_unit_id,
      unitRevision: row.origin_unit_revision,
    },
    completedAt: row.completed_at?.toISOString() ?? null,
    completionVersion: row.completion_version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
const selectTask =
  "SELECT id,title,description,state,version,due_kind,due_date::text AS due_date,due_at,due_time_zone,context_id,origin_kind,origin_unit_id,origin_unit_revision,completed_at,completion_version,created_at,updated_at FROM business.task WHERE workspace_id=$1 AND id=$2";
const transitions: Record<TaskState, readonly TaskState[]> = {
  TODO: ["IN_PROGRESS", "ON_HOLD", "DONE", "CANCELED"],
  IN_PROGRESS: ["TODO", "ON_HOLD", "DONE", "CANCELED"],
  ON_HOLD: ["TODO", "IN_PROGRESS", "DONE", "CANCELED"],
  DONE: ["TODO", "IN_PROGRESS"],
  CANCELED: ["TODO", "IN_PROGRESS"],
};

/** Reuses Task validation inside an already authorized command transaction. */
export async function insertExtractedTaskInTransaction(
  client: PoolClient,
  input: {
    workspaceId: string;
    actorId: string;
    title: string;
    description: string;
    originUnitId: string;
  },
): Promise<string> {
  uuid(input.originUnitId);
  const cleanTitle = title(input.title);
  const cleanDescription = description(input.description);
  const id = randomUUID();
  await client.query(
    `INSERT INTO business.task
     (id,workspace_id,created_by_id,title,description,origin_unit_id,origin_unit_revision)
     VALUES ($1,$2,$3,$4,$5,$6,1)`,
    [
      id,
      input.workspaceId,
      input.actorId,
      cleanTitle,
      cleanDescription,
      input.originUnitId,
    ],
  );
  return id;
}
export class TaskService {
  constructor(
    private readonly identity: IdentityService,
    private readonly commands: CommandCoordinator,
  ) {}
  private async context(
    client: PoolClient,
    workspaceId: string,
    contextId: string | null,
  ): Promise<void> {
    if (contextId === null) return;
    uuid(contextId);
    const result = await client.query<{ kind: string; state: string }>(
      "SELECT kind,state FROM business.context WHERE workspace_id=$1 AND id=$2 FOR SHARE",
      [workspaceId, contextId],
    );
    if (
      result.rows[0]?.state !== "ACTIVE" ||
      result.rows[0]?.kind !== "PROJECT"
    )
      throw new TaskError("TASK_CONTEXT_INVALID");
  }
  private async origin(
    client: PoolClient,
    workspaceId: string,
    origin?: { unitId: string; revision: number },
  ): Promise<void> {
    if (!origin) return;
    uuid(origin.unitId);
    positive(origin.revision);
    const result = await client.query<{
      state: string;
      current_revision: number;
    }>(
      "SELECT state,current_revision FROM business.thought_unit WHERE workspace_id=$1 AND id=$2 FOR SHARE",
      [workspaceId, origin.unitId],
    );
    if (
      result.rows[0]?.state !== "ACTIVE" ||
      result.rows[0]?.current_revision !== origin.revision
    )
      throw new TaskError("TASK_ORIGIN_INVALID");
  }
  async create(input: {
    actorId: string;
    workspaceId: string;
    idempotencyKey: string;
    title: string;
    description?: string;
    due: TaskDue;
    contextId?: string | null;
    origin?: { unitId: string; revision: number };
    requestId?: string;
  }): Promise<CommandOutcome> {
    const cleanTitle = title(input.title),
      cleanDescription = description(input.description ?? ""),
      due = dueValues(input.due);
    if (input.contextId) uuid(input.contextId);
    if (input.origin) {
      uuid(input.origin.unitId);
      positive(input.origin.revision);
    }
    return this.commands.execute({
      actorId: input.actorId,
      kind: "task.create",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        title: cleanTitle,
        description: cleanDescription,
        due,
        contextId: input.contextId ?? null,
        origin: input.origin ?? null,
      },
      apply: async (client, access) => {
        scope(access.workspaceId, input.workspaceId);
        await this.context(client, access.workspaceId, input.contextId ?? null);
        await this.origin(client, access.workspaceId, input.origin);
        const id = randomUUID();
        await client.query(
          "INSERT INTO business.task (id,workspace_id,created_by_id,title,description,due_kind,due_date,due_at,due_time_zone,context_id,origin_unit_id,origin_unit_revision) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
          [
            id,
            access.workspaceId,
            input.actorId,
            cleanTitle,
            cleanDescription,
            due.kind,
            due.date,
            due.at,
            due.timeZone,
            input.contextId ?? null,
            input.origin?.unitId ?? null,
            input.origin?.revision ?? null,
          ],
        );
        return {
          response: { id, version: 1, state: "TODO" },
          audit: audit(
            "task.create",
            id,
            null,
            1,
            ["title", "description", "due", "context_id", "origin"],
            input.requestId,
          ),
        };
      },
    });
  }
  async edit(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    baseVersion: number;
    title?: string;
    description?: string;
    due?: TaskDue;
    contextId?: string | null;
    requestId?: string;
  }): Promise<CommandOutcome> {
    uuid(input.id);
    positive(input.baseVersion);
    if (
      [input.title, input.description, input.due, input.contextId].every(
        (v) => v === undefined,
      )
    )
      throw new CommandError("INVALID_COMMAND");
    const cleanTitle =
        input.title === undefined ? undefined : title(input.title),
      cleanDescription =
        input.description === undefined
          ? undefined
          : description(input.description),
      due = input.due === undefined ? undefined : dueValues(input.due);
    if (input.contextId) uuid(input.contextId);
    return this.commands.execute({
      actorId: input.actorId,
      kind: "task.edit",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        id: input.id,
        baseVersion: input.baseVersion,
        title: cleanTitle ?? null,
        description: cleanDescription ?? null,
        due: due ?? null,
        contextId:
          input.contextId === undefined ? "UNCHANGED" : input.contextId,
      },
      apply: async (client, access) => {
        scope(access.workspaceId, input.workspaceId);
        const row = await this.lockTask(client, access.workspaceId, input.id);
        if (row.version !== input.baseVersion)
          throw new CommandError("VERSION_CONFLICT", row.version);
        if (input.contextId !== undefined)
          await this.context(client, access.workspaceId, input.contextId);
        const nextVersion = row.version + 1;
        await client.query(
          "UPDATE business.task SET title=$3,description=$4,due_kind=$5,due_date=$6,due_at=$7,due_time_zone=$8,context_id=$9,version=$10,updated_at=now() WHERE workspace_id=$1 AND id=$2",
          [
            access.workspaceId,
            input.id,
            cleanTitle ?? row.title,
            cleanDescription ?? row.description,
            due?.kind ?? row.due_kind,
            due ? due.date : row.due_date,
            due ? due.at : row.due_at,
            due ? due.timeZone : row.due_time_zone,
            input.contextId === undefined ? row.context_id : input.contextId,
            nextVersion,
          ],
        );
        const fields = [
          input.title !== undefined ? "title" : null,
          input.description !== undefined ? "description" : null,
          input.due !== undefined ? "due" : null,
          input.contextId !== undefined ? "context_id" : null,
        ].filter((v): v is string => v !== null);
        return {
          response: { id: input.id, version: nextVersion, state: row.state },
          audit: audit(
            "task.edit",
            input.id,
            row.version,
            nextVersion,
            fields,
            input.requestId,
          ),
        };
      },
    });
  }
  async transition(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    baseVersion: number;
    targetState: TaskState;
    requestId?: string;
  }): Promise<CommandOutcome> {
    uuid(input.id);
    positive(input.baseVersion);
    if (
      !["TODO", "IN_PROGRESS", "ON_HOLD", "DONE", "CANCELED"].includes(
        input.targetState,
      )
    )
      throw new CommandError("INVALID_COMMAND");
    return this.commands.execute({
      actorId: input.actorId,
      kind: "task.transition",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        id: input.id,
        baseVersion: input.baseVersion,
        targetState: input.targetState,
      },
      apply: async (client, access) => {
        scope(access.workspaceId, input.workspaceId);
        const row = await this.lockTask(client, access.workspaceId, input.id);
        if (row.version !== input.baseVersion)
          throw new CommandError("VERSION_CONFLICT", row.version);
        if (!transitions[row.state].includes(input.targetState))
          throw new TaskError("TASK_TRANSITION_INVALID");
        const version = row.version + 1,
          done = input.targetState === "DONE";
        await client.query(
          "UPDATE business.task SET state=$3,version=$4,completed_at=CASE WHEN $5::boolean THEN now() ELSE NULL END,completion_version=$6,updated_at=now() WHERE workspace_id=$1 AND id=$2",
          [
            access.workspaceId,
            input.id,
            input.targetState,
            version,
            done,
            done ? version : null,
          ],
        );
        await client.query(
          "INSERT INTO business.task_transition (workspace_id,task_id,version,from_state,to_state,actor_id) VALUES ($1,$2,$3,$4,$5,$6)",
          [
            access.workspaceId,
            input.id,
            version,
            row.state,
            input.targetState,
            input.actorId,
          ],
        );
        return {
          response: {
            id: input.id,
            version,
            state: input.targetState,
            completionVersion: done ? version : null,
          },
          audit: audit(
            "task.transition",
            input.id,
            row.version,
            version,
            ["state", "completed_at"],
            input.requestId,
          ),
        };
      },
    });
  }
  async addResult(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    baseVersion: number;
    title: string;
    rawBody: string;
    requestId?: string;
  }): Promise<CommandOutcome> {
    uuid(input.id);
    positive(input.baseVersion);
    title(input.title);
    try {
      return await this.commands.execute({
        actorId: input.actorId,
        kind: "task.add_result",
        idempotencyKey: input.idempotencyKey,
        payload: {
          workspaceId: input.workspaceId,
          id: input.id,
          baseVersion: input.baseVersion,
          title: input.title,
          rawBody: input.rawBody,
        },
        apply: async (client, access) => {
          scope(access.workspaceId, input.workspaceId);
          const row = await this.lockTask(client, access.workspaceId, input.id);
          if (row.version !== input.baseVersion)
            throw new CommandError("VERSION_CONFLICT", row.version);
          if (row.state !== "DONE" || row.completion_version === null)
            throw new TaskError("TASK_TRANSITION_INVALID");
          const prior = await client.query(
            "SELECT id FROM business.task_result WHERE workspace_id=$1 AND task_id=$2 AND completion_version=$3",
            [access.workspaceId, input.id, row.completion_version],
          );
          if (prior.rowCount) throw new TaskError("TASK_RESULT_DUPLICATE");
          const resultId = randomUUID();
          const capture = await insertCaptureInTransaction(client, {
            workspaceId: access.workspaceId,
            actorId: input.actorId,
            title: input.title,
            rawBody: input.rawBody,
            sourceKind: "manual",
            sourceKey: `task-result:${input.id}:${row.completion_version}`,
          });
          await client.query(
            "INSERT INTO business.task_result (id,workspace_id,task_id,completion_version,capture_id,created_by_id) VALUES ($1,$2,$3,$4,$5,$6)",
            [
              resultId,
              access.workspaceId,
              input.id,
              row.completion_version,
              capture.id,
              input.actorId,
            ],
          );
          return {
            response: {
              id: resultId,
              taskId: input.id,
              completionVersion: row.completion_version,
              captureId: capture.id,
              unitId: capture.unitId,
            },
            audit: audit(
              "task.add_result",
              input.id,
              row.version,
              row.version,
              ["result"],
              input.requestId,
            ),
          };
        },
      });
    } catch (error) {
      if (
        ["task_result_completion_unique", "capture_source_key_unique"].includes(
          sqlConstraint(error) ?? "",
        ) ||
        (error instanceof CaptureError && error.code === "SOURCE_DUPLICATE")
      )
        throw new TaskError("TASK_RESULT_DUPLICATE");
      throw error;
    }
  }
  async get(actorId: string, workspaceId: string, id: string) {
    uuid(id);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        scope(access.workspaceId, workspaceId);
        const result = await client.query<TaskRow>(selectTask, [
          workspaceId,
          id,
        ]);
        const row = result.rows[0];
        if (!row) throw new TaskError("TASK_NOT_FOUND");
        const history = await client.query<{
          version: number;
          from_state: TaskState;
          to_state: TaskState;
          recorded_at: Date;
        }>(
          "SELECT version,from_state,to_state,recorded_at FROM business.task_transition WHERE workspace_id=$1 AND task_id=$2 ORDER BY version",
          [workspaceId, id],
        );
        const results = await client.query<{
          id: string;
          completion_version: number;
          capture_id: string;
          recorded_at: Date;
        }>(
          "SELECT id,completion_version,capture_id,recorded_at FROM business.task_result WHERE workspace_id=$1 AND task_id=$2 ORDER BY recorded_at,id",
          [workspaceId, id],
        );
        return {
          ...view(row),
          workspaceId,
          history: history.rows.map((h) => ({
            version: h.version,
            fromState: h.from_state,
            toState: h.to_state,
            recordedAt: h.recorded_at.toISOString(),
          })),
          results: results.rows.map((r) => ({
            id: r.id,
            completionVersion: r.completion_version,
            captureId: r.capture_id,
            recordedAt: r.recorded_at.toISOString(),
          })),
        };
      },
    );
  }
  async list(
    actorId: string,
    workspaceId: string,
    state?: TaskState,
    cursor?: string,
    pageSize = 50,
  ) {
    if (
      state !== undefined &&
      !["TODO", "IN_PROGRESS", "ON_HOLD", "DONE", "CANCELED"].includes(state)
    )
      throw new CommandError("INVALID_COMMAND");
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100)
      throw new CommandError("INVALID_COMMAND");
    let time: string | null = null,
      id: string | null = null;
    if (cursor !== undefined) {
      try {
        if (cursor.length > 256) throw new Error("long");
        const parsed: unknown = JSON.parse(
          Buffer.from(cursor, "base64url").toString("utf8"),
        );
        if (
          !Array.isArray(parsed) ||
          parsed.length !== 2 ||
          typeof parsed[0] !== "string" ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(parsed[0]) ||
          typeof parsed[1] !== "string"
        )
          throw new Error("invalid");
        uuid(parsed[1]);
        if (!Number.isFinite(new Date(parsed[0]).getTime()))
          throw new Error("time");
        time = parsed[0];
        id = parsed[1];
      } catch {
        throw new CommandError("INVALID_COMMAND");
      }
    }
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        scope(access.workspaceId, workspaceId);
        const result = await client.query<TaskRow & { cursor_time: string }>(
          `SELECT id,title,description,state,version,due_kind,due_date::text AS due_date,due_at,due_time_zone,context_id,origin_kind,origin_unit_id,origin_unit_revision,completed_at,completion_version,created_at,updated_at,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time FROM business.task WHERE workspace_id=$1 AND ($2::text IS NULL OR state=$2) AND ($3::timestamptz IS NULL OR (updated_at,id)<($3::timestamptz,$4::uuid)) ORDER BY updated_at DESC,id DESC LIMIT $5`,
          [workspaceId, state ?? null, time, id, pageSize + 1],
        );
        const page = result.rows.slice(0, pageSize),
          last = page.at(-1);
        return {
          tasks: page.map(view),
          nextCursor:
            result.rows.length > pageSize && last
              ? Buffer.from(
                  JSON.stringify([last.cursor_time, last.id]),
                  "utf8",
                ).toString("base64url")
              : null,
        };
      },
    );
  }
  private async lockTask(
    client: PoolClient,
    workspaceId: string,
    id: string,
  ): Promise<TaskRow> {
    const result = await client.query<TaskRow>(`${selectTask} FOR UPDATE`, [
      workspaceId,
      id,
    ]);
    if (!result.rows[0]) throw new TaskError("TASK_NOT_FOUND");
    return result.rows[0];
  }
}
