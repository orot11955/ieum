import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { CommandCoordinator } from "../command-coordinator.js";
import { insertCaptureInTransaction } from "../captures.js";
import { IdentityService } from "../identity-service.js";
import { transferHash } from "./archive.js";
import { createCaptureBundle, readCaptureBundle } from "./manifest.js";
import type { TransferStoragePort } from "./storage.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ACTIVE_RUNS = 16;
const MAX_ACTIVE_BYTES = 128 * 1024 * 1024;

export class DataTransferError extends Error {
  constructor(
    public readonly code:
      | "TRANSFER_DISABLED"
      | "TRANSFER_NOT_FOUND"
      | "TRANSFER_EXPIRED"
      | "TRANSFER_UNAVAILABLE"
      | "TRANSFER_QUOTA_EXCEEDED"
      | "PREVIEW_CHANGED",
  ) {
    super(code);
  }
}

interface Run {
  id: string;
  workspace_id: string;
  actor_id: string;
  kind: "EXPORT" | "IMPORT";
  state: "READY" | "STAGED" | "APPLIED" | "PARTIAL";
  bundle_hash: string;
  storage_key: string;
  byte_size: number;
  expires_at: Date;
  created_at: Date;
  applied_at: Date | null;
}

export interface TransferPreviewRow {
  sourceId: string;
  sourceRevision: number;
  state: "NEW" | "DUPLICATE" | "CONFLICT" | "IMPORTED" | "SKIPPED" | "FAILED";
  targetId: string | null;
}

function sourceKey(workspaceId: string, captureId: string): string {
  return `ieum:${workspaceId}:${captureId}`;
}

function requireUuid(value: string): void {
  if (!UUID.test(value)) throw new DataTransferError("TRANSFER_NOT_FOUND");
}

function publicRun(run: Run) {
  return {
    id: run.id,
    scope: "CAPTURES_ONLY" as const,
    kind: run.kind,
    state: run.state,
    bundleHash: run.bundle_hash,
    byteSize: run.byte_size,
    expiresAt: run.expires_at.toISOString(),
    createdAt: run.created_at.toISOString(),
    appliedAt: run.applied_at?.toISOString() ?? null,
  };
}

async function loadRun(
  client: PoolClient,
  workspaceId: string,
  actorId: string,
  id: string,
  kind: "EXPORT" | "IMPORT",
): Promise<Run> {
  const found = await client.query<Run>(
    `SELECT * FROM business.transfer_run
     WHERE workspace_id=$1 AND actor_id=$2 AND id=$3 AND kind=$4`,
    [workspaceId, actorId, id, kind],
  );
  const run = found.rows[0];
  if (!run) throw new DataTransferError("TRANSFER_NOT_FOUND");
  if (run.expires_at.getTime() <= Date.now())
    throw new DataTransferError("TRANSFER_EXPIRED");
  return run;
}

function previewHash(rows: TransferPreviewRow[]): string {
  return transferHash(Buffer.from(JSON.stringify(rows)));
}

async function lockQuota(
  client: PoolClient,
  workspaceId: string,
  actorId: string,
  nextBytes: number,
): Promise<void> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 2121))",
    [`${workspaceId}:${actorId}:transfer`],
  );
  const usage = await client.query<{ count: string; bytes: string }>(
    `SELECT count(*)::text AS count,coalesce(sum(byte_size),0)::text AS bytes
     FROM business.transfer_run WHERE workspace_id=$1 AND actor_id=$2 AND expires_at>now()`,
    [workspaceId, actorId],
  );
  const count = Number(usage.rows[0]?.count ?? 0);
  const bytes = Number(usage.rows[0]?.bytes ?? 0);
  if (count >= MAX_ACTIVE_RUNS || bytes + nextBytes > MAX_ACTIVE_BYTES)
    throw new DataTransferError("TRANSFER_QUOTA_EXCEEDED");
}

async function existingImport(
  client: PoolClient,
  workspaceId: string,
  actorId: string,
  hash: string,
): Promise<Run | undefined> {
  const found = await client.query<Run>(
    `SELECT * FROM business.transfer_run
     WHERE workspace_id=$1 AND actor_id=$2 AND kind='IMPORT'
       AND bundle_hash=$3 AND expires_at>now()
     ORDER BY created_at DESC LIMIT 1`,
    [workspaceId, actorId, hash],
  );
  return found.rows[0];
}

export class DataTransferService {
  constructor(
    private readonly identity: IdentityService,
    private readonly commands: CommandCoordinator,
    private readonly storage: TransferStoragePort | null,
  ) {}

  private enabled(): TransferStoragePort {
    if (!this.storage) throw new DataTransferError("TRANSFER_DISABLED");
    return this.storage;
  }

  async createExport(actorId: string, workspaceId: string) {
    const storage = this.enabled();
    const captures = await this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new DataTransferError("TRANSFER_NOT_FOUND");
        const result = await client.query<{
          id: string;
          revision: number;
          title: string;
          raw_body: string;
          source_kind: string;
          source_key: string | null;
        }>(
          `SELECT c.id,c.current_revision AS revision,r.title,r.raw_body,c.source_kind,c.source_key
           FROM business.capture c
           JOIN business.capture_revision r
             ON r.workspace_id=c.workspace_id AND r.capture_id=c.id
            AND r.revision=c.current_revision
           WHERE c.workspace_id=$1 ORDER BY c.id LIMIT 256`,
          [workspaceId],
        );
        if (result.rows.length > 255)
          throw new DataTransferError("TRANSFER_UNAVAILABLE");
        return result.rows.map((row) => {
          const origin =
            row.source_kind === "import" && row.source_key
              ? /^ieum:([0-9a-f-]{36}):([0-9a-f-]{36})$/i.exec(row.source_key)
              : null;
          return {
            id: row.id,
            revision: row.revision,
            title: row.title,
            rawBody: row.raw_body,
            originWorkspaceId: origin?.[1] ?? workspaceId,
            originCaptureId: origin?.[2] ?? row.id,
          };
        });
      },
    );
    const bytes = createCaptureBundle(workspaceId, captures);
    const id = randomUUID();
    const storageKey = randomUUID();
    let wrote = false;
    try {
      return await this.identity.withPersonalWorkspace(
        actorId,
        async (client, access) => {
          if (access.workspaceId !== workspaceId)
            throw new DataTransferError("TRANSFER_NOT_FOUND");
          await lockQuota(client, workspaceId, actorId, bytes.length);
          await storage.write(storageKey, bytes);
          wrote = true;
          const result = await client.query<Run>(
            `INSERT INTO business.transfer_run
             (id,workspace_id,actor_id,kind,state,bundle_hash,storage_key,byte_size,expires_at)
             VALUES($1,$2,$3,'EXPORT','READY',$4,$5,$6,now()+interval '24 hours')
             RETURNING *`,
            [
              id,
              workspaceId,
              actorId,
              transferHash(bytes),
              storageKey,
              bytes.length,
            ],
          );
          return publicRun(result.rows[0]!);
        },
      );
    } catch (error) {
      if (wrote) await storage.remove(storageKey);
      throw error;
    }
  }

  async downloadExport(actorId: string, workspaceId: string, id: string) {
    requireUuid(id);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new DataTransferError("TRANSFER_NOT_FOUND");
        const run = await loadRun(client, workspaceId, actorId, id, "EXPORT");
        let bytes: Buffer;
        try {
          bytes = await this.enabled().read(run.storage_key);
        } catch {
          throw new DataTransferError("TRANSFER_UNAVAILABLE");
        }
        if (
          bytes.length !== run.byte_size ||
          transferHash(bytes) !== run.bundle_hash
        )
          throw new DataTransferError("TRANSFER_UNAVAILABLE");
        return bytes;
      },
    );
  }

  async stageImport(actorId: string, workspaceId: string, bytes: Buffer) {
    const storage = this.enabled();
    await this.identity.withPersonalWorkspace(
      actorId,
      async (_client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new DataTransferError("TRANSFER_NOT_FOUND");
      },
    );
    const { manifest } = readCaptureBundle(bytes);
    const hash = transferHash(bytes);
    const previous = await this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new DataTransferError("TRANSFER_NOT_FOUND");
        return existingImport(client, workspaceId, actorId, hash);
      },
    );
    if (previous) return publicRun(previous);
    const id = randomUUID();
    const storageKey = randomUUID();
    let wrote = false;
    try {
      const result = await this.identity.withPersonalWorkspace(
        actorId,
        async (client, access) => {
          if (access.workspaceId !== workspaceId)
            throw new DataTransferError("TRANSFER_NOT_FOUND");
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 2121))",
            [`${workspaceId}:${actorId}:transfer`],
          );
          const concurrent = await existingImport(
            client,
            workspaceId,
            actorId,
            hash,
          );
          if (concurrent) return { run: publicRun(concurrent), reused: true };
          await lockQuota(client, workspaceId, actorId, bytes.length);
          await storage.write(storageKey, bytes);
          wrote = true;
          const result = await client.query<Run>(
            `INSERT INTO business.transfer_run
             (id,workspace_id,actor_id,kind,state,bundle_hash,storage_key,byte_size,expires_at)
             VALUES($1,$2,$3,'IMPORT','STAGED',$4,$5,$6,now()+interval '24 hours')
             RETURNING *`,
            [id, workspaceId, actorId, hash, storageKey, bytes.length],
          );
          for (const record of manifest.captures)
            await client.query(
              `INSERT INTO business.transfer_row
               (workspace_id,run_id,record_kind,source_id,source_revision)
               VALUES($1,$2,'capture',$3,$4)`,
              [workspaceId, id, record.id, record.revision],
            );
          return { run: publicRun(result.rows[0]!), reused: false };
        },
      );
      return result.run;
    } catch (error) {
      if (wrote) await storage.remove(storageKey);
      throw error;
    }
  }

  private async readImport(actorId: string, workspaceId: string, id: string) {
    requireUuid(id);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new DataTransferError("TRANSFER_NOT_FOUND");
        const run = await loadRun(client, workspaceId, actorId, id, "IMPORT");
        let bytes: Buffer;
        try {
          bytes = await this.enabled().read(run.storage_key);
        } catch {
          throw new DataTransferError("TRANSFER_UNAVAILABLE");
        }
        if (
          bytes.length !== run.byte_size ||
          transferHash(bytes) !== run.bundle_hash
        )
          throw new DataTransferError("TRANSFER_UNAVAILABLE");
        return { run, bundle: readCaptureBundle(bytes) };
      },
    );
  }

  async previewImport(actorId: string, workspaceId: string, id: string) {
    const { run, bundle } = await this.readImport(actorId, workspaceId, id);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new DataTransferError("TRANSFER_NOT_FOUND");
        await loadRun(client, workspaceId, actorId, id, "IMPORT");
        const rows: TransferPreviewRow[] = [];
        for (const record of bundle.captures) {
          const status = await client.query<{
            state: "PENDING" | "IMPORTED" | "SKIPPED" | "FAILED";
            target_id: string | null;
          }>(
            `SELECT state,target_id FROM business.transfer_row
           WHERE workspace_id=$1 AND run_id=$2 AND record_kind='capture' AND source_id=$3`,
            [workspaceId, id, record.id],
          );
          const imported = status.rows[0];
          if (imported && imported.state !== "PENDING") {
            rows.push({
              sourceId: record.id,
              sourceRevision: record.revision,
              state: imported.state,
              targetId: imported.target_id,
            });
            continue;
          }
          const existing = await client.query<{
            id: string;
            title: string;
            raw_body: string;
          }>(
            `SELECT c.id,c.title,r.raw_body FROM business.capture c
           JOIN business.capture_revision r
             ON r.workspace_id=c.workspace_id AND r.capture_id=c.id
            AND r.revision=c.current_revision
           WHERE c.workspace_id=$1 AND c.source_kind='import' AND c.source_key=$2`,
            [
              workspaceId,
              sourceKey(record.originWorkspaceId, record.originCaptureId),
            ],
          );
          const previous = existing.rows[0];
          rows.push({
            sourceId: record.id,
            sourceRevision: record.revision,
            state: !previous
              ? "NEW"
              : previous.title === record.title &&
                  previous.raw_body === record.rawBody
                ? "DUPLICATE"
                : "CONFLICT",
            targetId: previous?.id ?? null,
          });
        }
        return { run: publicRun(run), rows, previewHash: previewHash(rows) };
      },
    );
  }

  async applyImport(
    actorId: string,
    workspaceId: string,
    id: string,
    expectedPreviewHash: string,
  ) {
    const preview = await this.previewImport(actorId, workspaceId, id);
    if (preview.previewHash !== expectedPreviewHash)
      throw new DataTransferError("PREVIEW_CHANGED");
    const { bundle } = await this.readImport(actorId, workspaceId, id);
    for (const record of bundle.captures) {
      const key = createHash("sha256")
        .update(`${id}:capture:${record.id}`)
        .digest("hex");
      await this.commands.execute({
        actorId,
        kind: "transfer.capture.apply",
        idempotencyKey: key,
        payload: {
          workspaceId,
          runId: id,
          sourceId: record.id,
          sourceRevision: record.revision,
          sha256: record.sha256,
        },
        apply: async (client, access) => {
          if (access.workspaceId !== workspaceId)
            throw new DataTransferError("TRANSFER_NOT_FOUND");
          await loadRun(client, workspaceId, actorId, id, "IMPORT");
          const row = await client.query<{
            state: string;
            target_id: string | null;
          }>(
            `SELECT state,target_id FROM business.transfer_row
             WHERE workspace_id=$1 AND run_id=$2 AND record_kind='capture' AND source_id=$3 FOR UPDATE`,
            [workspaceId, id, record.id],
          );
          if (!row.rows[0]) throw new DataTransferError("TRANSFER_NOT_FOUND");
          if (row.rows[0].state !== "PENDING")
            return {
              response: { id: row.rows[0].target_id, state: row.rows[0].state },
              audit: {
                action: "transfer.capture.replay",
                targetType: "transfer_row",
                targetId: record.id,
                beforeVersion: null,
                afterVersion: null,
                changedFieldNames: [],
              },
            };
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 2122))",
            [
              `${workspaceId}:${record.originWorkspaceId}:${record.originCaptureId}:capture`,
            ],
          );
          const existing = await client.query<{
            id: string;
            title: string;
            raw_body: string;
          }>(
            `SELECT c.id,c.title,r.raw_body FROM business.capture c
             JOIN business.capture_revision r
               ON r.workspace_id=c.workspace_id AND r.capture_id=c.id
              AND r.revision=c.current_revision
             WHERE c.workspace_id=$1 AND c.source_kind='import' AND c.source_key=$2 FOR UPDATE OF c`,
            [
              workspaceId,
              sourceKey(record.originWorkspaceId, record.originCaptureId),
            ],
          );
          const previous = existing.rows[0];
          const state = previous
            ? previous.title === record.title &&
              previous.raw_body === record.rawBody
              ? "SKIPPED"
              : "FAILED"
            : "IMPORTED";
          const targetId = previous
            ? previous.id
            : (
                await insertCaptureInTransaction(client, {
                  workspaceId,
                  actorId,
                  title: record.title,
                  rawBody: record.rawBody,
                  sourceKind: "import",
                  sourceKey: sourceKey(
                    record.originWorkspaceId,
                    record.originCaptureId,
                  ),
                })
              ).id;
          if (state !== "FAILED")
            await client.query(
              `INSERT INTO business.transfer_origin
               (workspace_id,record_kind,source_workspace_id,source_id,source_revision,target_id)
               VALUES($1,'capture',$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
              [
                workspaceId,
                record.originWorkspaceId,
                record.originCaptureId,
                record.revision,
                targetId,
              ],
            );
          await client.query(
            `UPDATE business.transfer_row SET state=$4,target_id=$5,reason_code=$6
             WHERE workspace_id=$1 AND run_id=$2 AND record_kind='capture' AND source_id=$3`,
            [
              workspaceId,
              id,
              record.id,
              state,
              targetId,
              state === "FAILED" ? "CONTENT_CONFLICT" : null,
            ],
          );
          return {
            response: { id: targetId, state },
            audit: {
              action: "transfer.capture.apply",
              targetType: state === "IMPORTED" ? "capture" : "transfer_row",
              targetId: state === "IMPORTED" ? targetId : record.id,
              beforeVersion: null,
              afterVersion: state === "IMPORTED" ? 1 : null,
              changedFieldNames:
                state === "IMPORTED"
                  ? ["title", "raw_body", "source"]
                  : ["state"],
            },
          };
        },
      });
    }
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new DataTransferError("TRANSFER_NOT_FOUND");
        const tally = await client.query<{ state: string; count: string }>(
          `SELECT state,count(*)::text AS count FROM business.transfer_row
         WHERE workspace_id=$1 AND run_id=$2 GROUP BY state`,
          [workspaceId, id],
        );
        const counts = Object.fromEntries(
          tally.rows.map((row) => [row.state, Number(row.count)]),
        );
        const state = counts.FAILED || counts.PENDING ? "PARTIAL" : "APPLIED";
        await client.query(
          `UPDATE business.transfer_run SET state=$3,applied_at=now()
         WHERE workspace_id=$1 AND id=$2 AND actor_id=$4 AND kind='IMPORT'`,
          [workspaceId, id, state, actorId],
        );
        return { state, counts };
      },
    );
  }
}
