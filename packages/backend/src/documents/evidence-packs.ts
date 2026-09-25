import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  CreateEvidencePackRequestSchema,
  EvidencePackManifestSchema,
} from "@ieum/contracts/workbench";
import type {
  CreateEvidencePackRequest,
  PackSourceManifest,
} from "@ieum/contracts/workbench";
import { CommandCoordinator, CommandError } from "../command-coordinator.js";
import { IdentityService } from "../identity-service.js";
import { snapshotSource, sourceState } from "./source-resolver.js";

export class EvidencePackError extends Error {
  constructor(
    public readonly code:
      "PACK_NOT_FOUND" | "PACK_SOURCE_UNAVAILABLE" | "DOCUMENT_NOT_FOUND",
  ) {
    super(code);
  }
}
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
    )
    .join(",")}}`;
}
const hash = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
function checkIds(...values: string[]) {
  if (values.some((value) => !UUID.test(value)))
    throw new CommandError("INVALID_COMMAND");
}
function checkScope(expected: string, actual: string) {
  if (expected !== actual) throw new EvidencePackError("PACK_NOT_FOUND");
}
function validText(value: unknown): boolean {
  if (typeof value === "string") {
    if (value.includes("\u0000")) return false;
    for (const character of value) {
      const point = character.codePointAt(0)!;
      if (point >= 0xd800 && point <= 0xdfff) return false;
    }
  } else if (Array.isArray(value)) return value.every(validText);
  else if (value && typeof value === "object")
    return Object.values(value).every(validText);
  return true;
}
export async function packRevision(
  client: PoolClient,
  workspaceId: string,
  documentId: string,
  id: string,
  revision: number,
) {
  const found = await client.query<{
    current_revision: number;
    manifest: unknown;
    manifest_hash: string;
    created_at: Date;
  }>(
    `SELECT p.current_revision,r.manifest,r.manifest_hash,r.created_at
     FROM business.evidence_pack p JOIN business.evidence_pack_revision r
       ON r.workspace_id=p.workspace_id AND r.pack_id=p.id
     WHERE p.workspace_id=$1 AND p.document_id=$2 AND p.id=$3 AND r.revision=$4`,
    [workspaceId, documentId, id, revision],
  );
  const row = found.rows[0];
  if (!row) throw new EvidencePackError("PACK_NOT_FOUND");
  const manifest = EvidencePackManifestSchema.safeParse(row.manifest);
  if (!manifest.success || hash(manifest.data) !== row.manifest_hash)
    throw new EvidencePackError("PACK_SOURCE_UNAVAILABLE");
  return {
    currentRevision: row.current_revision,
    manifest: manifest.data,
    manifestHash: row.manifest_hash,
    createdAt: row.created_at,
  };
}

export class EvidencePackService {
  constructor(
    private readonly identity: IdentityService,
    private readonly commands: CommandCoordinator,
  ) {}

  private async snapshot(
    client: PoolClient,
    workspaceId: string,
    request: CreateEvidencePackRequest,
  ) {
    const parsed = CreateEvidencePackRequestSchema.safeParse(request);
    if (!parsed.success || !validText(parsed.data))
      throw new CommandError("INVALID_COMMAND");
    const sources: PackSourceManifest[] = [];
    for (const source of parsed.data.sources)
      sources.push(await snapshotSource(client, workspaceId, source));
    return { title: parsed.data.title, sources };
  }

  async create(input: {
    actorId: string;
    workspaceId: string;
    documentId: string;
    idempotencyKey: string;
    request: CreateEvidencePackRequest;
    requestId?: string;
  }) {
    checkIds(input.documentId);
    const result = await this.commands.execute({
      actorId: input.actorId,
      kind: "pack.create",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        documentId: input.documentId,
        request: input.request,
      },
      apply: async (client, access) => {
        checkScope(input.workspaceId, access.workspaceId);
        const document = await client.query<{ state: string }>(
          `SELECT state FROM business.document WHERE workspace_id=$1 AND id=$2 FOR SHARE`,
          [access.workspaceId, input.documentId],
        );
        if (!document.rows[0])
          throw new EvidencePackError("DOCUMENT_NOT_FOUND");
        if (document.rows[0].state !== "ACTIVE")
          throw new EvidencePackError("PACK_SOURCE_UNAVAILABLE");
        const manifest = await this.snapshot(
          client,
          access.workspaceId,
          input.request,
        );
        const id = randomUUID(),
          manifestHash = hash(manifest);
        await client.query(
          `INSERT INTO business.evidence_pack (id,workspace_id,document_id,created_by_id)
          VALUES ($1,$2,$3,$4)`,
          [id, access.workspaceId, input.documentId, input.actorId],
        );
        await client.query(
          `INSERT INTO business.evidence_pack_revision
          (workspace_id,pack_id,revision,manifest,manifest_hash,created_by_id)
          VALUES ($1,$2,1,$3::jsonb,$4,$5)`,
          [
            access.workspaceId,
            id,
            JSON.stringify(manifest),
            manifestHash,
            input.actorId,
          ],
        );
        return {
          response: {
            id,
            documentId: input.documentId,
            revision: 1,
            manifestHash,
          },
          audit: {
            action: "PACK_CREATED",
            targetType: "evidence_pack",
            targetId: id,
            beforeVersion: null,
            afterVersion: 1,
            changedFieldNames: ["manifest"],
            ...(input.requestId ? { requestId: input.requestId } : {}),
          },
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
    documentId: string;
    id: string;
    idempotencyKey: string;
    baseRevision: number;
    request: CreateEvidencePackRequest;
    requestId?: string;
  }) {
    checkIds(input.documentId, input.id);
    if (!Number.isSafeInteger(input.baseRevision) || input.baseRevision < 1)
      throw new CommandError("INVALID_COMMAND");
    const result = await this.commands.execute({
      actorId: input.actorId,
      kind: "pack.revise",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        documentId: input.documentId,
        id: input.id,
        baseRevision: input.baseRevision,
        request: input.request,
      },
      apply: async (client, access) => {
        checkScope(input.workspaceId, access.workspaceId);
        const found = await client.query<{
          current_revision: number;
          state: string;
        }>(
          `SELECT p.current_revision,d.state FROM business.evidence_pack p JOIN business.document d
           ON d.workspace_id=p.workspace_id AND d.id=p.document_id
           WHERE p.workspace_id=$1 AND p.document_id=$2 AND p.id=$3 FOR UPDATE OF p`,
          [access.workspaceId, input.documentId, input.id],
        );
        const row = found.rows[0];
        if (!row) throw new EvidencePackError("PACK_NOT_FOUND");
        if (row.state !== "ACTIVE")
          throw new EvidencePackError("PACK_SOURCE_UNAVAILABLE");
        if (row.current_revision !== input.baseRevision)
          throw new CommandError("VERSION_CONFLICT", row.current_revision);
        const manifest = await this.snapshot(
          client,
          access.workspaceId,
          input.request,
        );
        const revision = row.current_revision + 1,
          manifestHash = hash(manifest);
        await client.query(
          `INSERT INTO business.evidence_pack_revision
          (workspace_id,pack_id,revision,manifest,manifest_hash,created_by_id)
          VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
          [
            access.workspaceId,
            input.id,
            revision,
            JSON.stringify(manifest),
            manifestHash,
            input.actorId,
          ],
        );
        await client.query(
          `UPDATE business.evidence_pack SET current_revision=$3
          WHERE workspace_id=$1 AND id=$2`,
          [access.workspaceId, input.id, revision],
        );
        return {
          response: {
            id: input.id,
            documentId: input.documentId,
            revision,
            manifestHash,
          },
          audit: {
            action: "PACK_REVISED",
            targetType: "evidence_pack",
            targetId: input.id,
            beforeVersion: row.current_revision,
            afterVersion: revision,
            changedFieldNames: ["manifest"],
            ...(input.requestId ? { requestId: input.requestId } : {}),
          },
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
    documentId: string,
    id: string,
    revision: number,
  ) {
    checkIds(documentId, id);
    if (!Number.isSafeInteger(revision) || revision < 1)
      throw new CommandError("INVALID_COMMAND");
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        checkScope(workspaceId, access.workspaceId);
        const row = await packRevision(
          client,
          access.workspaceId,
          documentId,
          id,
          revision,
        );
        const sourceStates = [];
        for (const source of row.manifest.sources)
          sourceStates.push(
            await sourceState(client, access.workspaceId, source),
          );
        return {
          id,
          documentId,
          revision,
          currentRevision: row.currentRevision,
          title: row.manifest.title,
          manifestHash: row.manifestHash,
          sources: row.manifest.sources,
          sourceStates,
          originFamilies: [
            ...new Set(row.manifest.sources.map((source) => source.originKey)),
          ],
          createdAt: row.createdAt.toISOString(),
        };
      },
    );
  }
}
