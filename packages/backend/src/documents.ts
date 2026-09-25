import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  EditorEnvelopeSchema,
  compareEditorBlocks,
} from "@ieum/contracts/editor";
import type { EditorEnvelope, EditorSourceRef } from "@ieum/contracts/editor";
import { CommandCoordinator, CommandError } from "./command-coordinator.js";
import type { CommandOutcome } from "./command-coordinator.js";
import { IdentityService } from "./identity-service.js";

export type DocumentKind = "WIKI" | "ARTICLE" | "NOTE";
export type DocumentErrorCode =
  | "DOCUMENT_NOT_FOUND"
  | "DOCUMENT_REVISION_NOT_FOUND"
  | "DOCUMENT_SOURCE_UNAVAILABLE"
  | "DOCUMENT_LINK_INVALID"
  | "DOCUMENT_ARCHIVED";
export class DocumentError extends Error {
  constructor(public readonly code: DocumentErrorCode) {
    super(code);
  }
}
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emptyContent: EditorEnvelope = {
  schemaVersion: 1,
  content: { type: "doc", content: [] },
};

function checkId(value: string): void {
  if (!UUID.test(value)) throw new CommandError("INVALID_COMMAND");
}
function checkVersion(value: number, zero = false): void {
  if (!Number.isSafeInteger(value) || value < (zero ? 0 : 1))
    throw new CommandError("INVALID_COMMAND");
}
function checkWorkspace(actual: string, expected: string): void {
  if (actual !== expected) throw new DocumentError("DOCUMENT_NOT_FOUND");
}
function validText(value: string): boolean {
  if (value.includes("\u0000")) return false;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    if (point >= 0xd800 && point <= 0xdfff) return false;
  }
  return true;
}
function validJsonStrings(value: unknown): boolean {
  if (typeof value === "string") return validText(value);
  if (Array.isArray(value)) return value.every(validJsonStrings);
  if (value && typeof value === "object")
    return Object.values(value).every(validJsonStrings);
  return true;
}
function content(value: unknown): EditorEnvelope {
  const parsed = EditorEnvelopeSchema.safeParse(value);
  if (!parsed.success) throw new CommandError("INVALID_COMMAND");
  if (!validJsonStrings(parsed.data)) throw new CommandError("INVALID_COMMAND");
  if (Buffer.byteLength(JSON.stringify(parsed.data)) > 200_000)
    throw new CommandError("INVALID_COMMAND");
  return parsed.data;
}
function hashContent(value: EditorEnvelope): string {
  return createHash("sha256")
    .update(JSON.stringify(content(value)))
    .digest("hex");
}
export function documentText(value: EditorEnvelope): string {
  return (value.content.content ?? [])
    .map((block) =>
      (block.content ?? [])
        .map((node) =>
          node.type === "text"
            ? node.text
            : node.type === "hardBreak"
              ? "\n"
              : node.attrs.label,
        )
        .join(""),
    )
    .join("\n");
}
function refs(value: EditorEnvelope): EditorSourceRef[] {
  return (value.content.content ?? []).flatMap((block) =>
    (block.content ?? []).flatMap((node) =>
      node.type === "sourceReference" ? [node.attrs.ref] : [],
    ),
  );
}
async function validateSources(
  client: PoolClient,
  workspaceId: string,
  value: EditorEnvelope,
): Promise<void> {
  const references = refs(value);
  if (references.length > 100) throw new CommandError("INVALID_COMMAND");
  for (const ref of references) {
    if (!UUID.test(ref.sourceId))
      throw new DocumentError("DOCUMENT_SOURCE_UNAVAILABLE");
    if (ref.sourceKind === "unit") {
      const result = await client.query<{
        origin_key: string;
        content_text: string;
      }>(
        `SELECT u.origin_key, r.content_text
         FROM business.thought_unit_revision r
         JOIN business.thought_unit u
           ON u.workspace_id = r.workspace_id AND u.id = r.unit_id
         WHERE r.workspace_id = $1 AND r.unit_id = $2 AND r.revision = $3`,
        [workspaceId, ref.sourceId, ref.sourceRevision],
      );
      const row = result.rows[0];
      if (
        !row ||
        row.origin_key !== ref.originKey ||
        createHash("sha256").update(row.content_text).digest("hex") !==
          ref.sourceHash ||
        (ref.span && ref.span.end > row.content_text.length)
      )
        throw new DocumentError("DOCUMENT_SOURCE_UNAVAILABLE");
    } else if (ref.sourceKind === "document_revision") {
      const result = await client.query<{
        content_hash: string;
        content: unknown;
      }>(
        `SELECT content_hash,content FROM business.document_revision
         WHERE workspace_id = $1 AND document_id = $2 AND revision = $3`,
        [workspaceId, ref.sourceId, ref.sourceRevision],
      );
      if (
        !result.rows[0] ||
        ref.originKey !== `document:${ref.sourceId}` ||
        ref.sourceHash !== result.rows[0].content_hash ||
        (ref.span &&
          ref.span.end > documentText(content(result.rows[0].content)).length)
      )
        throw new DocumentError("DOCUMENT_SOURCE_UNAVAILABLE");
    } else if (ref.sourceKind === "external_excerpt") {
      const result = await client.query<{
        origin_key: string;
        content_hash: string;
        excerpt: string;
        state: string;
      }>(
        `SELECT 'external_excerpt:' || e.id AS origin_key,r.content_hash,r.excerpt,e.state
         FROM business.external_excerpt_revision r
         JOIN business.external_excerpt e ON e.workspace_id=r.workspace_id AND e.id=r.excerpt_id
         WHERE r.workspace_id=$1 AND r.excerpt_id=$2 AND r.revision=$3`,
        [workspaceId, ref.sourceId, ref.sourceRevision],
      );
      const row = result.rows[0];
      if (
        !row ||
        row.state !== "ACTIVE" ||
        row.origin_key !== ref.originKey ||
        row.content_hash !== ref.sourceHash ||
        (ref.span && ref.span.end > row.excerpt.length)
      )
        throw new DocumentError("DOCUMENT_SOURCE_UNAVAILABLE");
    } else {
      throw new DocumentError("DOCUMENT_SOURCE_UNAVAILABLE");
    }
  }
}

interface DocumentRow {
  id: string;
  workspace_id: string;
  kind: DocumentKind;
  title: string;
  state: "ACTIVE" | "ARCHIVED";
  latest_revision: number;
  link_version: number;
  draft_version: number;
  content: unknown;
  created_at: Date;
  updated_at: Date;
}
async function currentDocument(
  client: PoolClient,
  workspaceId: string,
  id: string,
  lock = false,
): Promise<DocumentRow> {
  const found = await client.query<DocumentRow>(
    `SELECT d.id,d.workspace_id,d.kind,d.title,d.state,d.latest_revision,d.link_version,
            d.created_at,d.updated_at,dr.version AS draft_version,dr.content
     FROM business.document d JOIN business.document_draft dr
       ON dr.workspace_id = d.workspace_id AND dr.document_id = d.id
     WHERE d.workspace_id = $1 AND d.id = $2 ${lock ? "FOR UPDATE OF d,dr" : ""}`,
    [workspaceId, id],
  );
  if (!found.rows[0]) throw new DocumentError("DOCUMENT_NOT_FOUND");
  return found.rows[0];
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
    targetType: "document",
    targetId: id,
    beforeVersion: before,
    afterVersion: after,
    changedFieldNames: fields,
    ...(requestId ? { requestId } : {}),
  };
}
function commandResponse(outcome: CommandOutcome) {
  return {
    ...outcome.response,
    commandId: outcome.commandId,
    replayed: outcome.replayed,
  };
}

export class DocumentService {
  constructor(
    private readonly identity: IdentityService,
    private readonly commands: CommandCoordinator,
  ) {}

  async create(input: {
    actorId: string;
    workspaceId: string;
    idempotencyKey: string;
    kind: DocumentKind;
    title: string;
    requestId?: string;
  }) {
    const title = input.title.trim();
    if (
      !title ||
      title.length > 300 ||
      !validText(title) ||
      !["WIKI", "ARTICLE", "NOTE"].includes(input.kind)
    )
      throw new CommandError("INVALID_COMMAND");
    const result = await this.commands.execute({
      actorId: input.actorId,
      kind: "document.create",
      idempotencyKey: input.idempotencyKey,
      payload: { workspaceId: input.workspaceId, kind: input.kind, title },
      apply: async (client, access) => {
        checkWorkspace(input.workspaceId, access.workspaceId);
        const id = randomUUID();
        await client.query(
          `INSERT INTO business.document (id,workspace_id,created_by_id,kind,title)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, access.workspaceId, input.actorId, input.kind, title],
        );
        await client.query(
          `INSERT INTO business.document_draft (workspace_id,document_id,content)
           VALUES ($1,$2,$3::jsonb)`,
          [access.workspaceId, id, JSON.stringify(emptyContent)],
        );
        return {
          response: {
            id,
            kind: input.kind,
            draftVersion: 1,
            latestRevision: 0,
          },
          audit: audit(
            "DOCUMENT_CREATED",
            id,
            null,
            1,
            ["kind", "title", "draft"],
            input.requestId,
          ),
        };
      },
    });
    return commandResponse(result);
  }

  async get(actorId: string, workspaceId: string, id: string) {
    checkId(id);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        checkWorkspace(workspaceId, access.workspaceId);
        const row = await currentDocument(client, access.workspaceId, id);
        const links = await client.query<{ to_document_id: string }>(
          `SELECT to_document_id FROM business.document_link WHERE workspace_id=$1 AND from_document_id=$2 ORDER BY to_document_id`,
          [access.workspaceId, id],
        );
        const backlinks = await client.query<{ from_document_id: string }>(
          `SELECT from_document_id FROM business.document_link WHERE workspace_id=$1 AND to_document_id=$2 ORDER BY from_document_id`,
          [access.workspaceId, id],
        );
        return {
          id: row.id,
          workspaceId: row.workspace_id,
          kind: row.kind,
          title: row.title,
          state: row.state,
          draftVersion: row.draft_version,
          latestRevision: row.latest_revision,
          linkVersion: row.link_version,
          content: content(row.content),
          links: links.rows.map((link) => link.to_document_id),
          backlinks: backlinks.rows.map((link) => link.from_document_id),
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        };
      },
    );
  }

  async list(actorId: string, workspaceId: string) {
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        checkWorkspace(workspaceId, access.workspaceId);
        const result = await client.query<DocumentRow>(
          `SELECT d.id,d.workspace_id,d.kind,d.title,d.state,d.latest_revision,d.link_version,
                d.created_at,d.updated_at,dr.version AS draft_version
         FROM business.document d JOIN business.document_draft dr
           ON dr.workspace_id=d.workspace_id AND dr.document_id=d.id
         WHERE d.workspace_id=$1 ORDER BY d.updated_at DESC,d.id DESC`,
          [access.workspaceId],
        );
        return {
          documents: result.rows.map((row) => ({
            id: row.id,
            workspaceId: row.workspace_id,
            kind: row.kind,
            title: row.title,
            state: row.state,
            draftVersion: row.draft_version,
            latestRevision: row.latest_revision,
            linkVersion: row.link_version,
            createdAt: row.created_at.toISOString(),
            updatedAt: row.updated_at.toISOString(),
          })),
        };
      },
    );
  }

  async save(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    baseVersion: number;
    saveSequence: number;
    content: EditorEnvelope;
    requestId?: string;
  }) {
    checkId(input.id);
    checkVersion(input.baseVersion);
    checkVersion(input.saveSequence, true);
    const next = content(input.content);
    const result = await this.commands.execute({
      actorId: input.actorId,
      kind: "document.save",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        id: input.id,
        baseVersion: input.baseVersion,
        saveSequence: input.saveSequence,
        content: next,
      },
      apply: async (client, access) => {
        checkWorkspace(input.workspaceId, access.workspaceId);
        const row = await currentDocument(
          client,
          access.workspaceId,
          input.id,
          true,
        );
        if (row.state !== "ACTIVE")
          throw new DocumentError("DOCUMENT_ARCHIVED");
        if (row.draft_version !== input.baseVersion)
          throw new CommandError("VERSION_CONFLICT", row.draft_version);
        await validateSources(client, access.workspaceId, next);
        const changes = compareEditorBlocks(content(row.content), next);
        await client.query(
          `UPDATE business.document_draft SET version=version+1, content=$3::jsonb, updated_at=now()
           WHERE workspace_id=$1 AND document_id=$2`,
          [access.workspaceId, input.id, JSON.stringify(next)],
        );
        await client.query(
          `UPDATE business.document SET updated_at=now() WHERE workspace_id=$1 AND id=$2`,
          [access.workspaceId, input.id],
        );
        return {
          response: {
            id: input.id,
            draftVersion: row.draft_version + 1,
            saveSequence: input.saveSequence,
            ...changes,
          },
          audit: audit(
            "DOCUMENT_DRAFT_SAVED",
            input.id,
            row.draft_version,
            row.draft_version + 1,
            ["content"],
            input.requestId,
          ),
        };
      },
    });
    return commandResponse(result);
  }

  async seal(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    draftVersion: number;
    requestId?: string;
  }) {
    checkId(input.id);
    checkVersion(input.draftVersion);
    const result = await this.commands.execute({
      actorId: input.actorId,
      kind: "document.seal",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        id: input.id,
        draftVersion: input.draftVersion,
      },
      apply: async (client, access) => {
        checkWorkspace(input.workspaceId, access.workspaceId);
        const row = await currentDocument(
          client,
          access.workspaceId,
          input.id,
          true,
        );
        if (row.state !== "ACTIVE")
          throw new DocumentError("DOCUMENT_ARCHIVED");
        if (row.draft_version !== input.draftVersion)
          throw new CommandError("VERSION_CONFLICT", row.draft_version);
        const snapshot = content(row.content);
        await validateSources(client, access.workspaceId, snapshot);
        const revision = row.latest_revision + 1;
        const contentHash = hashContent(snapshot);
        await client.query(
          `INSERT INTO business.document_revision
           (workspace_id,document_id,revision,title,content,content_hash,draft_version,created_by_id)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
          [
            access.workspaceId,
            input.id,
            revision,
            row.title,
            JSON.stringify(snapshot),
            contentHash,
            row.draft_version,
            input.actorId,
          ],
        );
        await client.query(
          `UPDATE business.document SET latest_revision=$3,updated_at=now()
           WHERE workspace_id=$1 AND id=$2`,
          [access.workspaceId, input.id, revision],
        );
        return {
          response: {
            id: input.id,
            revision,
            draftVersion: row.draft_version,
            contentHash,
            restoredFromRevision: null,
          },
          audit: audit(
            "DOCUMENT_REVISION_SEALED",
            input.id,
            row.latest_revision,
            revision,
            ["latestRevision"],
            input.requestId,
          ),
        };
      },
    });
    return commandResponse(result);
  }

  async revision(
    actorId: string,
    workspaceId: string,
    id: string,
    revision: number,
  ) {
    checkId(id);
    checkVersion(revision);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        checkWorkspace(workspaceId, access.workspaceId);
        const result = await client.query<{
          title: string;
          content: unknown;
          content_hash: string;
          draft_version: number | null;
          restored_from_revision: number | null;
          created_at: Date;
        }>(
          `SELECT title,content,content_hash,draft_version,restored_from_revision,created_at
         FROM business.document_revision WHERE workspace_id=$1 AND document_id=$2 AND revision=$3`,
          [access.workspaceId, id, revision],
        );
        const row = result.rows[0];
        if (!row) throw new DocumentError("DOCUMENT_REVISION_NOT_FOUND");
        return {
          id,
          revision,
          title: row.title,
          content: content(row.content),
          contentHash: row.content_hash,
          draftVersion: row.draft_version,
          restoredFromRevision: row.restored_from_revision,
          createdAt: row.created_at.toISOString(),
        };
      },
    );
  }

  async restore(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    baseRevision: number;
    sourceRevision: number;
    requestId?: string;
  }) {
    checkId(input.id);
    checkVersion(input.baseRevision, true);
    checkVersion(input.sourceRevision);
    const result = await this.commands.execute({
      actorId: input.actorId,
      kind: "document.restore",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        id: input.id,
        baseRevision: input.baseRevision,
        sourceRevision: input.sourceRevision,
      },
      apply: async (client, access) => {
        checkWorkspace(input.workspaceId, access.workspaceId);
        const row = await currentDocument(
          client,
          access.workspaceId,
          input.id,
          true,
        );
        if (row.state !== "ACTIVE")
          throw new DocumentError("DOCUMENT_ARCHIVED");
        if (row.latest_revision !== input.baseRevision)
          throw new CommandError("VERSION_CONFLICT", row.latest_revision);
        const source = await client.query<{ title: string; content: unknown }>(
          `SELECT title,content FROM business.document_revision
           WHERE workspace_id=$1 AND document_id=$2 AND revision=$3`,
          [access.workspaceId, input.id, input.sourceRevision],
        );
        if (!source.rows[0])
          throw new DocumentError("DOCUMENT_REVISION_NOT_FOUND");
        const snapshot = content(source.rows[0].content);
        await validateSources(client, access.workspaceId, snapshot);
        const revision = row.latest_revision + 1;
        const contentHash = hashContent(snapshot);
        await client.query(
          `INSERT INTO business.document_revision
           (workspace_id,document_id,revision,title,content,content_hash,restored_from_revision,created_by_id)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
          [
            access.workspaceId,
            input.id,
            revision,
            source.rows[0].title,
            JSON.stringify(snapshot),
            contentHash,
            input.sourceRevision,
            input.actorId,
          ],
        );
        await client.query(
          `UPDATE business.document SET latest_revision=$3,updated_at=now()
           WHERE workspace_id=$1 AND id=$2`,
          [access.workspaceId, input.id, revision],
        );
        return {
          response: {
            id: input.id,
            revision,
            draftVersion: row.draft_version,
            contentHash,
            restoredFromRevision: input.sourceRevision,
          },
          audit: audit(
            "DOCUMENT_REVISION_RESTORED",
            input.id,
            row.latest_revision,
            revision,
            ["latestRevision"],
            input.requestId,
          ),
        };
      },
    });
    return commandResponse(result);
  }

  async replaceLinks(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    baseLinkVersion: number;
    targetIds: string[];
    requestId?: string;
  }) {
    checkId(input.id);
    checkVersion(input.baseLinkVersion);
    if (
      input.targetIds.length > 100 ||
      new Set(input.targetIds).size !== input.targetIds.length ||
      input.targetIds.includes(input.id)
    )
      throw new DocumentError("DOCUMENT_LINK_INVALID");
    input.targetIds.forEach(checkId);
    const targetIds = [...input.targetIds].sort();
    const result = await this.commands.execute({
      actorId: input.actorId,
      kind: "document.links",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        id: input.id,
        baseLinkVersion: input.baseLinkVersion,
        targetIds,
      },
      apply: async (client, access) => {
        checkWorkspace(input.workspaceId, access.workspaceId);
        const row = await currentDocument(
          client,
          access.workspaceId,
          input.id,
          true,
        );
        if (row.kind !== "WIKI" || row.state !== "ACTIVE")
          throw new DocumentError("DOCUMENT_LINK_INVALID");
        if (row.link_version !== input.baseLinkVersion)
          throw new CommandError("VERSION_CONFLICT", row.link_version);
        if (targetIds.length) {
          const targets = await client.query<{ id: string }>(
            `SELECT id FROM business.document
             WHERE workspace_id=$1 AND id=ANY($2::uuid[]) AND kind='WIKI' AND state='ACTIVE'`,
            [access.workspaceId, targetIds],
          );
          if (targets.rows.length !== targetIds.length)
            throw new DocumentError("DOCUMENT_LINK_INVALID");
        }
        await client.query(
          `DELETE FROM business.document_link WHERE workspace_id=$1 AND from_document_id=$2`,
          [access.workspaceId, input.id],
        );
        for (const target of targetIds)
          await client.query(
            `INSERT INTO business.document_link (workspace_id,from_document_id,to_document_id)
             VALUES ($1,$2,$3)`,
            [access.workspaceId, input.id, target],
          );
        await client.query(
          `UPDATE business.document SET link_version=link_version+1,updated_at=now()
           WHERE workspace_id=$1 AND id=$2`,
          [access.workspaceId, input.id],
        );
        return {
          response: {
            id: input.id,
            linkVersion: row.link_version + 1,
            targetIds,
          },
          audit: audit(
            "DOCUMENT_LINKS_REPLACED",
            input.id,
            row.link_version,
            row.link_version + 1,
            ["links"],
            input.requestId,
          ),
        };
      },
    });
    return commandResponse(result);
  }
}
