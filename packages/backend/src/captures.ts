import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { CommandCoordinator, CommandError } from "./command-coordinator.js";
import type { CommandOutcome } from "./command-coordinator.js";
import { IdentityService } from "./identity-service.js";

export type CaptureErrorCode =
  | "CAPTURE_NOT_FOUND"
  | "CAPTURE_ARCHIVED"
  | "SOURCE_DUPLICATE"
  | "INVALID_SPANS";

export class CaptureError extends Error {
  constructor(public readonly code: CaptureErrorCode) {
    super(code);
  }
}

export interface CaptureSpan {
  start: number;
  end: number;
  encoding: "utf16";
}

export interface CaptureUnit {
  id: string;
  revision: number;
  captureRevision: number;
  originKey: string;
  state: "ACTIVE" | "SUPERSEDED";
  sourceSpan: CaptureSpan;
  content: { kind: "quote"; text: string };
  recordedAt: string;
}

export interface CaptureDetail {
  id: string;
  workspaceId: string;
  title: string;
  source: { kind: "manual" | "import"; key: string | null; originKey: string };
  state: "ACTIVE" | "ARCHIVED";
  version: number;
  currentRevision: number;
  unitSetVersion: number;
  revision: number;
  rawBody: string;
  recordedAt: string;
  units: CaptureUnit[];
}

export function validText(value: string, max: number): boolean {
  if (
    value.trim().length === 0 ||
    value.length > max ||
    value.includes("\u0000")
  )
    return false;
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!Number.isFinite(next) || next < 0xdc00 || next > 0xdfff)
        return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

export function validRawBody(value: string): boolean {
  return (
    validText(value, 1_000_000) && Buffer.byteLength(value, "utf8") <= 200_000
  );
}

function validateSpans(rawBody: string, spans: CaptureSpan[]): void {
  if (spans.length < 2 || spans.length > 100 || spans[0]?.start !== 0)
    throw new CaptureError("INVALID_SPANS");
  let next = 0;
  for (const span of spans) {
    if (
      span.encoding !== "utf16" ||
      !Number.isSafeInteger(span.start) ||
      !Number.isSafeInteger(span.end) ||
      span.start !== next ||
      span.end <= span.start ||
      span.end > rawBody.length ||
      !validText(rawBody.slice(span.start, span.end), rawBody.length)
    ) {
      throw new CaptureError("INVALID_SPANS");
    }
    const before = rawBody.charCodeAt(span.end - 1);
    const after = rawBody.charCodeAt(span.end);
    if (
      before >= 0xd800 &&
      before <= 0xdbff &&
      after >= 0xdc00 &&
      after <= 0xdfff
    )
      throw new CaptureError("INVALID_SPANS");
    next = span.end;
  }
  if (next !== rawBody.length) throw new CaptureError("INVALID_SPANS");
}

async function insertUnit(
  client: PoolClient,
  workspaceId: string,
  captureId: string,
  captureRevision: number,
  originKey: string,
  span: CaptureSpan,
  rawBody: string,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO business.thought_unit
     (id, workspace_id, capture_id, capture_revision, origin_key)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, workspaceId, captureId, captureRevision, originKey],
  );
  await client.query(
    `INSERT INTO business.thought_unit_revision
     (workspace_id, unit_id, revision, capture_id, capture_revision,
      source_start, source_end, content_kind, content_text)
     VALUES ($1, $2, 1, $3, $4, $5, $6, 'quote', $7)`,
    [
      workspaceId,
      id,
      captureId,
      captureRevision,
      span.start,
      span.end,
      rawBody.slice(span.start, span.end),
    ],
  );
  return id;
}

/** Capture module boundary for a caller already inside a command transaction. */
export async function insertCaptureInTransaction(
  client: PoolClient,
  input: {
    workspaceId: string;
    actorId: string;
    title: string;
    rawBody: string;
    sourceKind: "manual" | "import";
    sourceKey?: string;
  },
): Promise<{ id: string; unitId: string }> {
  if (
    !validText(input.title, 300) ||
    !validRawBody(input.rawBody) ||
    !["manual", "import"].includes(input.sourceKind) ||
    (input.sourceKey !== undefined && !validText(input.sourceKey, 300)) ||
    (input.sourceKind === "import" && !input.sourceKey)
  )
    throw new CommandError("INVALID_COMMAND");
  if (input.sourceKey) {
    const previous = await client.query(
      "SELECT id FROM business.capture WHERE workspace_id=$1 AND source_kind=$2 AND source_key=$3",
      [input.workspaceId, input.sourceKind, input.sourceKey],
    );
    if (previous.rowCount) throw new CaptureError("SOURCE_DUPLICATE");
  }
  const id = randomUUID();
  const originKey = input.sourceKey
    ? `${input.sourceKind}:${input.sourceKey}`
    : `manual:${id}`;
  await client.query(
    `INSERT INTO business.capture (id,workspace_id,created_by_id,title,source_kind,source_key,origin_key) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      id,
      input.workspaceId,
      input.actorId,
      input.title.trim(),
      input.sourceKind,
      input.sourceKey ?? null,
      originKey,
    ],
  );
  await client.query(
    `INSERT INTO business.capture_revision (workspace_id,capture_id,revision,title,raw_body) VALUES ($1,$2,1,$3,$4)`,
    [input.workspaceId, id, input.title.trim(), input.rawBody],
  );
  const unitId = await insertUnit(
    client,
    input.workspaceId,
    id,
    1,
    originKey,
    { start: 0, end: input.rawBody.length, encoding: "utf16" },
    input.rawBody,
  );
  return { id, unitId };
}

function requiredUuid(value: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new CaptureError("CAPTURE_NOT_FOUND");
}

function requirePositive(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new CommandError("INVALID_COMMAND");
}

export class CaptureService {
  constructor(
    private readonly identity: IdentityService,
    private readonly commands: CommandCoordinator,
  ) {}

  async create(input: {
    actorId: string;
    workspaceId: string;
    idempotencyKey: string;
    title: string;
    rawBody: string;
    sourceKind: "manual" | "import";
    sourceKey?: string;
    requestId?: string;
  }): Promise<CommandOutcome> {
    if (
      !validText(input.title, 300) ||
      !validRawBody(input.rawBody) ||
      !["manual", "import"].includes(input.sourceKind) ||
      (input.sourceKey !== undefined && !validText(input.sourceKey, 300)) ||
      (input.sourceKind === "import" && !input.sourceKey)
    )
      throw new CommandError("INVALID_COMMAND");
    try {
      return await this.commands.execute({
        actorId: input.actorId,
        kind: "capture.create",
        idempotencyKey: input.idempotencyKey,
        payload: {
          workspaceId: input.workspaceId,
          title: input.title,
          rawBody: input.rawBody,
          sourceKind: input.sourceKind,
          sourceKey: input.sourceKey ?? null,
        },
        apply: async (client, access) => {
          if (access.workspaceId !== input.workspaceId)
            throw new CaptureError("CAPTURE_NOT_FOUND");
          const { id, unitId } = await insertCaptureInTransaction(client, {
            workspaceId: access.workspaceId,
            actorId: input.actorId,
            title: input.title,
            rawBody: input.rawBody,
            sourceKind: input.sourceKind,
            ...(input.sourceKey ? { sourceKey: input.sourceKey } : {}),
          });
          return {
            response: { id, revision: 1, version: 1, unitId },
            audit: {
              action: "capture.create",
              targetType: "capture",
              targetId: id,
              beforeVersion: null,
              afterVersion: 1,
              changedFieldNames: ["title", "raw_body", "source"],
              ...(input.requestId ? { requestId: input.requestId } : {}),
            },
          };
        },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505" &&
        "constraint" in error &&
        error.constraint === "capture_source_key_unique"
      )
        throw new CaptureError("SOURCE_DUPLICATE");
      throw error;
    }
  }

  async revise(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    baseVersion: number;
    title: string;
    rawBody: string;
    requestId?: string;
  }): Promise<CommandOutcome> {
    requiredUuid(input.id);
    requirePositive(input.baseVersion);
    if (!validText(input.title, 300) || !validRawBody(input.rawBody))
      throw new CommandError("INVALID_COMMAND");
    return this.commands.execute({
      actorId: input.actorId,
      kind: "capture.revise",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        id: input.id,
        baseVersion: input.baseVersion,
        title: input.title,
        rawBody: input.rawBody,
      },
      apply: async (client, access) => {
        if (access.workspaceId !== input.workspaceId)
          throw new CaptureError("CAPTURE_NOT_FOUND");
        const result = await client.query<{
          version: number;
          current_revision: number;
          unit_set_version: number;
          state: string;
          origin_key: string;
        }>(
          "SELECT version, current_revision, unit_set_version, state, origin_key FROM business.capture WHERE workspace_id = $1 AND id = $2 FOR UPDATE",
          [access.workspaceId, input.id],
        );
        const current = result.rows[0];
        if (!current) throw new CaptureError("CAPTURE_NOT_FOUND");
        if (current.state !== "ACTIVE")
          throw new CaptureError("CAPTURE_ARCHIVED");
        if (current.version !== input.baseVersion)
          throw new CommandError("VERSION_CONFLICT", current.version);
        const revision = current.current_revision + 1;
        const version = current.version + 1;
        const unitSetVersion = current.unit_set_version + 1;
        await client.query(
          "INSERT INTO business.capture_revision (workspace_id, capture_id, revision, title, raw_body) VALUES ($1, $2, $3, $4, $5)",
          [
            access.workspaceId,
            input.id,
            revision,
            input.title.trim(),
            input.rawBody,
          ],
        );
        const unitId = await insertUnit(
          client,
          access.workspaceId,
          input.id,
          revision,
          current.origin_key,
          { start: 0, end: input.rawBody.length, encoding: "utf16" },
          input.rawBody,
        );
        await client.query(
          "UPDATE business.capture SET title = $3, version = $4, current_revision = $5, unit_set_version = $6, updated_at = now() WHERE workspace_id = $1 AND id = $2",
          [
            access.workspaceId,
            input.id,
            input.title.trim(),
            version,
            revision,
            unitSetVersion,
          ],
        );
        return {
          response: { id: input.id, revision, version, unitSetVersion, unitId },
          audit: {
            action: "capture.revise",
            targetType: "capture",
            targetId: input.id,
            beforeVersion: current.version,
            afterVersion: version,
            changedFieldNames: ["title", "raw_body"],
            ...(input.requestId ? { requestId: input.requestId } : {}),
          },
        };
      },
    });
  }

  async split(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    baseVersion: number;
    captureRevision: number;
    spans: CaptureSpan[];
    requestId?: string;
  }): Promise<CommandOutcome> {
    requiredUuid(input.id);
    requirePositive(input.baseVersion);
    requirePositive(input.captureRevision);
    return this.commands.execute({
      actorId: input.actorId,
      kind: "capture.units.split",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        id: input.id,
        baseVersion: input.baseVersion,
        captureRevision: input.captureRevision,
        spans: input.spans,
      },
      apply: async (client, access) => {
        if (access.workspaceId !== input.workspaceId)
          throw new CaptureError("CAPTURE_NOT_FOUND");
        const result = await client.query<{
          version: number;
          current_revision: number;
          unit_set_version: number;
          state: string;
          origin_key: string;
        }>(
          "SELECT version, current_revision, unit_set_version, state, origin_key FROM business.capture WHERE workspace_id = $1 AND id = $2 FOR UPDATE",
          [access.workspaceId, input.id],
        );
        const current = result.rows[0];
        if (!current) throw new CaptureError("CAPTURE_NOT_FOUND");
        if (current.state !== "ACTIVE")
          throw new CaptureError("CAPTURE_ARCHIVED");
        if (
          current.version !== input.baseVersion ||
          current.current_revision !== input.captureRevision
        )
          throw new CommandError("VERSION_CONFLICT", current.version);
        const source = await client.query<{ raw_body: string }>(
          "SELECT raw_body FROM business.capture_revision WHERE workspace_id = $1 AND capture_id = $2 AND revision = $3",
          [access.workspaceId, input.id, input.captureRevision],
        );
        if (!source.rows[0]) throw new CaptureError("CAPTURE_NOT_FOUND");
        validateSpans(source.rows[0].raw_body, input.spans);
        await client.query(
          "UPDATE business.thought_unit SET state = 'SUPERSEDED', superseded_at = now() WHERE workspace_id = $1 AND capture_id = $2 AND capture_revision = $3 AND state = 'ACTIVE'",
          [access.workspaceId, input.id, input.captureRevision],
        );
        const unitIds: string[] = [];
        for (const span of input.spans) {
          unitIds.push(
            await insertUnit(
              client,
              access.workspaceId,
              input.id,
              input.captureRevision,
              current.origin_key,
              span,
              source.rows[0].raw_body,
            ),
          );
        }
        const version = current.version + 1;
        const unitSetVersion = current.unit_set_version + 1;
        await client.query(
          "UPDATE business.capture SET version = $3, unit_set_version = $4, updated_at = now() WHERE workspace_id = $1 AND id = $2",
          [access.workspaceId, input.id, version, unitSetVersion],
        );
        return {
          response: {
            id: input.id,
            revision: input.captureRevision,
            version,
            unitSetVersion,
            unitIds,
          },
          audit: {
            action: "capture.units.split",
            targetType: "capture",
            targetId: input.id,
            beforeVersion: current.version,
            afterVersion: version,
            changedFieldNames: ["unit_set"],
            ...(input.requestId ? { requestId: input.requestId } : {}),
          },
        };
      },
    });
  }

  async archive(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    baseVersion: number;
    requestId?: string;
  }): Promise<CommandOutcome> {
    requiredUuid(input.id);
    requirePositive(input.baseVersion);
    return this.commands.execute({
      actorId: input.actorId,
      kind: "capture.archive",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        id: input.id,
        baseVersion: input.baseVersion,
      },
      apply: async (client, access) => {
        if (access.workspaceId !== input.workspaceId)
          throw new CaptureError("CAPTURE_NOT_FOUND");
        const result = await client.query<{ version: number; state: string }>(
          "SELECT version, state FROM business.capture WHERE workspace_id = $1 AND id = $2 FOR UPDATE",
          [access.workspaceId, input.id],
        );
        const current = result.rows[0];
        if (!current) throw new CaptureError("CAPTURE_NOT_FOUND");
        if (current.version !== input.baseVersion)
          throw new CommandError("VERSION_CONFLICT", current.version);
        if (current.state !== "ACTIVE")
          throw new CaptureError("CAPTURE_ARCHIVED");
        const version = current.version + 1;
        await client.query(
          "UPDATE business.capture SET state = 'ARCHIVED', version = $3, updated_at = now() WHERE workspace_id = $1 AND id = $2",
          [access.workspaceId, input.id, version],
        );
        return {
          response: { id: input.id, state: "ARCHIVED", version },
          audit: {
            action: "capture.archive",
            targetType: "capture",
            targetId: input.id,
            beforeVersion: current.version,
            afterVersion: version,
            changedFieldNames: ["state"],
            ...(input.requestId ? { requestId: input.requestId } : {}),
          },
        };
      },
    });
  }

  async list(
    actorId: string,
    workspaceId: string,
    includeArchived = false,
    cursor?: string,
    pageSize = 50,
  ): Promise<{
    captures: Array<{
      id: string;
      title: string;
      state: string;
      version: number;
      currentRevision: number;
      updatedAt: string;
    }>;
    nextCursor: string | null;
  }> {
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100)
      throw new CommandError("INVALID_COMMAND");
    let timestamp: string | null = null;
    let cursorId: string | null = null;
    if (cursor !== undefined) {
      try {
        if (cursor.length > 256) throw new Error("long cursor");
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
          throw new Error("invalid cursor");
        const parsedTime = new Date(parsed[0]);
        if (
          !Number.isFinite(parsedTime.getTime()) ||
          parsedTime.toISOString().slice(0, 19) !== parsed[0].slice(0, 19)
        )
          throw new Error("invalid cursor timestamp");
        requiredUuid(parsed[1]);
        timestamp = parsed[0];
        cursorId = parsed[1];
      } catch {
        throw new CommandError("INVALID_COMMAND");
      }
    }
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new CaptureError("CAPTURE_NOT_FOUND");
        const result = await client.query<{
          id: string;
          title: string;
          state: string;
          version: number;
          current_revision: number;
          updated_at: Date;
          cursor_time: string;
        }>(
          `SELECT id, title, state, version, current_revision, updated_at,
                to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
         FROM business.capture
         WHERE workspace_id = $1 AND ($2::boolean OR state = 'ACTIVE')
           AND ($3::timestamptz IS NULL OR (updated_at, id) < ($3::timestamptz, $4::uuid))
         ORDER BY updated_at DESC, id DESC LIMIT $5`,
          [workspaceId, includeArchived, timestamp, cursorId, pageSize + 1],
        );
        const page = result.rows.slice(0, pageSize);
        const last = page.at(-1);
        return {
          captures: page.map((row) => ({
            id: row.id,
            title: row.title,
            state: row.state,
            version: row.version,
            currentRevision: row.current_revision,
            updatedAt: row.updated_at.toISOString(),
          })),
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

  async get(
    actorId: string,
    workspaceId: string,
    id: string,
    revision?: number,
  ): Promise<CaptureDetail> {
    requiredUuid(id);
    if (revision !== undefined) requirePositive(revision);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new CaptureError("CAPTURE_NOT_FOUND");
        const capture = await client.query<{
          id: string;
          title: string;
          source_kind: "manual" | "import";
          source_key: string | null;
          origin_key: string;
          state: "ACTIVE" | "ARCHIVED";
          version: number;
          current_revision: number;
          unit_set_version: number;
        }>(
          "SELECT id, title, source_kind, source_key, origin_key, state, version, current_revision, unit_set_version FROM business.capture WHERE workspace_id = $1 AND id = $2",
          [workspaceId, id],
        );
        const row = capture.rows[0];
        if (!row) throw new CaptureError("CAPTURE_NOT_FOUND");
        const selectedRevision = revision ?? row.current_revision;
        const source = await client.query<{
          title: string;
          raw_body: string;
          recorded_at: Date;
        }>(
          "SELECT title, raw_body, recorded_at FROM business.capture_revision WHERE workspace_id = $1 AND capture_id = $2 AND revision = $3",
          [workspaceId, id, selectedRevision],
        );
        if (!source.rows[0]) throw new CaptureError("CAPTURE_NOT_FOUND");
        const units = await client.query<{
          id: string;
          revision: number;
          capture_revision: number;
          origin_key: string;
          state: "ACTIVE" | "SUPERSEDED";
          source_start: number;
          source_end: number;
          content_text: string;
          recorded_at: Date;
        }>(
          `SELECT u.id, ur.revision, u.capture_revision, u.origin_key, u.state,
                ur.source_start, ur.source_end, ur.content_text, ur.recorded_at
         FROM business.thought_unit u JOIN business.thought_unit_revision ur
           ON ur.workspace_id = u.workspace_id AND ur.unit_id = u.id AND ur.revision = u.current_revision
         WHERE u.workspace_id = $1 AND u.capture_id = $2 AND u.capture_revision = $3
         ORDER BY ur.source_start, u.created_at, u.id`,
          [workspaceId, id, selectedRevision],
        );
        return {
          id,
          workspaceId,
          title: source.rows[0].title,
          source: {
            kind: row.source_kind,
            key: row.source_key,
            originKey: row.origin_key,
          },
          state: row.state,
          version: row.version,
          currentRevision: row.current_revision,
          unitSetVersion: row.unit_set_version,
          revision: selectedRevision,
          rawBody: source.rows[0].raw_body,
          recordedAt: source.rows[0].recorded_at.toISOString(),
          units: units.rows.map((unit) => ({
            id: unit.id,
            revision: unit.revision,
            captureRevision: unit.capture_revision,
            originKey: unit.origin_key,
            state: unit.state,
            sourceSpan: {
              start: unit.source_start,
              end: unit.source_end,
              encoding: "utf16",
            },
            content: { kind: "quote", text: unit.content_text },
            recordedAt: unit.recorded_at.toISOString(),
          })),
        };
      },
    );
  }
}
