import { createHash, randomUUID } from "node:crypto";
import { ExternalExcerptFieldsSchema } from "@ieum/contracts/workbench";
import type { ExternalExcerptFields } from "@ieum/contracts/workbench";
import { CommandCoordinator, CommandError } from "../command-coordinator.js";
import { IdentityService } from "../identity-service.js";

export class ExternalExcerptError extends Error {
  constructor(public readonly code: "EXCERPT_NOT_FOUND" | "EXCERPT_DELETED") {
    super(code);
  }
}
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function valid(value: string): boolean {
  if (value.includes("\u0000")) return false;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    if (point >= 0xd800 && point <= 0xdfff) return false;
  }
  return true;
}
function fields(value: ExternalExcerptFields): ExternalExcerptFields {
  const parsed = ExternalExcerptFieldsSchema.safeParse(value);
  if (
    !parsed.success ||
    !Object.values(parsed.data).every((part) => part === null || valid(part))
  )
    throw new CommandError("INVALID_COMMAND");
  return parsed.data;
}
function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function checkScope(actual: string, expected: string): void {
  if (actual !== expected) throw new ExternalExcerptError("EXCERPT_NOT_FOUND");
}
function checkId(value: string): void {
  if (!UUID.test(value)) throw new CommandError("INVALID_COMMAND");
}
function checkVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new CommandError("INVALID_COMMAND");
}
function audit(
  action: string,
  id: string,
  before: number | null,
  after: number | null,
  requestId?: string,
) {
  return {
    action,
    targetType: "external_excerpt",
    targetId: id,
    beforeVersion: before,
    afterVersion: after,
    changedFieldNames:
      action === "EXCERPT_DELETED" ? ["state"] : ["metadata", "excerpt"],
    ...(requestId ? { requestId } : {}),
  };
}

export class ExternalExcerptService {
  constructor(
    private readonly identity: IdentityService,
    private readonly commands: CommandCoordinator,
  ) {}

  async create(input: {
    actorId: string;
    workspaceId: string;
    idempotencyKey: string;
    fields: ExternalExcerptFields;
    requestId?: string;
  }) {
    const data = fields(input.fields);
    const result = await this.commands.execute({
      actorId: input.actorId,
      kind: "excerpt.create",
      idempotencyKey: input.idempotencyKey,
      payload: { workspaceId: input.workspaceId, ...data },
      apply: async (client, access) => {
        checkScope(input.workspaceId, access.workspaceId);
        const id = randomUUID(),
          contentHash = digest(data.excerpt);
        await client.query(
          `INSERT INTO business.external_excerpt (id,workspace_id,created_by_id) VALUES ($1,$2,$3)`,
          [id, access.workspaceId, input.actorId],
        );
        await client.query(
          `INSERT INTO business.external_excerpt_revision
           (workspace_id,excerpt_id,revision,title,url,author,published_at,excerpt,content_hash)
           VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8)`,
          [
            access.workspaceId,
            id,
            data.title,
            data.url,
            data.author,
            data.publishedAt,
            data.excerpt,
            contentHash,
          ],
        );
        return {
          response: {
            id,
            version: 1,
            revision: 1,
            state: "ACTIVE",
            contentHash,
          },
          audit: audit("EXCERPT_CREATED", id, null, 1, input.requestId),
        };
      },
    });
    return {
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    };
  }

  async revise(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    baseVersion: number;
    fields: ExternalExcerptFields;
    requestId?: string;
  }) {
    checkId(input.id);
    checkVersion(input.baseVersion);
    const data = fields(input.fields);
    const result = await this.commands.execute({
      actorId: input.actorId,
      kind: "excerpt.revise",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        id: input.id,
        baseVersion: input.baseVersion,
        ...data,
      },
      apply: async (client, access) => {
        checkScope(input.workspaceId, access.workspaceId);
        const found = await client.query<{
          version: number;
          current_revision: number;
          state: string;
        }>(
          `SELECT version,current_revision,state FROM business.external_excerpt
           WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
          [access.workspaceId, input.id],
        );
        const row = found.rows[0];
        if (!row) throw new ExternalExcerptError("EXCERPT_NOT_FOUND");
        if (row.state !== "ACTIVE")
          throw new ExternalExcerptError("EXCERPT_DELETED");
        if (row.version !== input.baseVersion)
          throw new CommandError("VERSION_CONFLICT", row.version);
        const revision = row.current_revision + 1,
          contentHash = digest(data.excerpt);
        await client.query(
          `INSERT INTO business.external_excerpt_revision
           (workspace_id,excerpt_id,revision,title,url,author,published_at,excerpt,content_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            access.workspaceId,
            input.id,
            revision,
            data.title,
            data.url,
            data.author,
            data.publishedAt,
            data.excerpt,
            contentHash,
          ],
        );
        await client.query(
          `UPDATE business.external_excerpt SET version=version+1,current_revision=$3,updated_at=now()
           WHERE workspace_id=$1 AND id=$2`,
          [access.workspaceId, input.id, revision],
        );
        return {
          response: {
            id: input.id,
            version: row.version + 1,
            revision,
            state: "ACTIVE",
            contentHash,
          },
          audit: audit(
            "EXCERPT_REVISED",
            input.id,
            row.version,
            row.version + 1,
            input.requestId,
          ),
        };
      },
    });
    return {
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    };
  }

  async retire(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    baseVersion: number;
    requestId?: string;
  }) {
    checkId(input.id);
    checkVersion(input.baseVersion);
    const result = await this.commands.execute({
      actorId: input.actorId,
      kind: "excerpt.retire",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        id: input.id,
        baseVersion: input.baseVersion,
      },
      apply: async (client, access) => {
        checkScope(input.workspaceId, access.workspaceId);
        const found = await client.query<{
          version: number;
          current_revision: number;
          state: string;
        }>(
          `SELECT version,current_revision,state FROM business.external_excerpt
           WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
          [access.workspaceId, input.id],
        );
        const row = found.rows[0];
        if (!row) throw new ExternalExcerptError("EXCERPT_NOT_FOUND");
        if (row.state !== "ACTIVE")
          throw new ExternalExcerptError("EXCERPT_DELETED");
        if (row.version !== input.baseVersion)
          throw new CommandError("VERSION_CONFLICT", row.version);
        await client.query(
          `UPDATE business.external_excerpt SET state='DELETED',version=version+1,updated_at=now()
           WHERE workspace_id=$1 AND id=$2`,
          [access.workspaceId, input.id],
        );
        const source = await client.query<{ content_hash: string }>(
          `SELECT content_hash FROM business.external_excerpt_revision
           WHERE workspace_id=$1 AND excerpt_id=$2 AND revision=$3`,
          [access.workspaceId, input.id, row.current_revision],
        );
        return {
          response: {
            id: input.id,
            version: row.version + 1,
            revision: row.current_revision,
            state: "DELETED",
            contentHash: source.rows[0]!.content_hash,
          },
          audit: audit(
            "EXCERPT_DELETED",
            input.id,
            row.version,
            row.version + 1,
            input.requestId,
          ),
        };
      },
    });
    return {
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    };
  }

  async get(
    actorId: string,
    workspaceId: string,
    id: string,
    revision?: number,
  ) {
    checkId(id);
    if (revision !== undefined) checkVersion(revision);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        checkScope(workspaceId, access.workspaceId);
        const result = await client.query<{
          version: number;
          current_revision: number;
          state: "ACTIVE" | "DELETED";
          title: string;
          url: string;
          author: string;
          published_at: string | null;
          excerpt: string;
          content_hash: string;
          recorded_at: Date;
        }>(
          `SELECT e.version,e.current_revision,e.state,r.title,r.url,r.author,r.published_at::text AS published_at,
                r.excerpt,r.content_hash,r.recorded_at
         FROM business.external_excerpt e JOIN business.external_excerpt_revision r
           ON r.workspace_id=e.workspace_id AND r.excerpt_id=e.id
         WHERE e.workspace_id=$1 AND e.id=$2
           AND r.revision=COALESCE($3::integer,e.current_revision)`,
          [access.workspaceId, id, revision ?? null],
        );
        const row = result.rows[0];
        if (!row) throw new ExternalExcerptError("EXCERPT_NOT_FOUND");
        return {
          id,
          workspaceId: access.workspaceId,
          version: row.version,
          revision: revision ?? row.current_revision,
          state: row.state,
          title: row.title,
          url: row.url,
          author: row.author,
          publishedAt: row.published_at,
          excerpt: row.excerpt,
          contentHash: row.content_hash,
          recordedAt: row.recorded_at.toISOString(),
        };
      },
    );
  }
}
