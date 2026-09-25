import { createHash, randomUUID } from "node:crypto";
import type {
  TransferManifestV2,
  TransferManifestV3,
  TransferManifestV4,
  TransferManifestV5,
} from "@ieum/contracts/data-transfer";
import type { PoolClient } from "pg";
import { CommandCoordinator } from "../command-coordinator.js";
import { insertCaptureInTransaction } from "../captures.js";
import { IdentityService } from "../identity-service.js";
import { transferHash } from "./archive.js";
import { createTaskResultBundle, readCaptureBundle } from "./manifest.js";
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
  recordKind: "capture" | "task" | "event" | "context" | "task_result";
  sourceId: string;
  sourceRevision: number;
  state:
    | "NEW"
    | "DUPLICATE"
    | "CONFLICT"
    | "MISSING_REFERENCE"
    | "IMPORTED"
    | "SKIPPED"
    | "FAILED";
  targetId: string | null;
}

function sourceKey(workspaceId: string, captureId: string): string {
  return `ieum:${workspaceId.toLowerCase()}:${captureId.toLowerCase()}`;
}

function sourceLock(
  workspaceId: string,
  sourceWorkspaceId: string,
  sourceId: string,
  kind: string,
): string {
  return `${workspaceId.toLowerCase()}:${sourceWorkspaceId.toLowerCase()}:${sourceId.toLowerCase()}:${kind}`;
}

function requireUuid(value: string): void {
  if (!UUID.test(value)) throw new DataTransferError("TRANSFER_NOT_FOUND");
}

type TransferScope =
  | "CAPTURES_ONLY"
  | "CAPTURES_TASKS_EVENTS"
  | "CAPTURES_TASKS_EVENTS_CONTEXTS"
  | "CAPTURES_TASKS_EVENTS_CONTEXTS_TASK_HISTORY"
  | "CAPTURES_TASKS_EVENTS_CONTEXTS_TASK_HISTORY_RESULTS";
function publicRun(run: Run, scope: TransferScope) {
  return {
    id: run.id,
    scope,
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

function bundleScope(version: number): TransferScope {
  return version === 5
    ? "CAPTURES_TASKS_EVENTS_CONTEXTS_TASK_HISTORY_RESULTS"
    : version === 4
      ? "CAPTURES_TASKS_EVENTS_CONTEXTS_TASK_HISTORY"
      : version === 3
        ? "CAPTURES_TASKS_EVENTS_CONTEXTS"
        : version === 2
          ? "CAPTURES_TASKS_EVENTS"
          : "CAPTURES_ONLY";
}

function dateOnly(value: string | Date | null): string | null {
  if (!(value instanceof Date)) return value;
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    const snapshot = await this.identity.withPersonalWorkspace(
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
        const captures = result.rows.map((row) => {
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
        const tasks = await client.query<{
          id: string;
          title: string;
          description: string;
          state: TransferManifestV2["tasks"][number]["state"];
          version: number;
          due_kind: TransferManifestV2["tasks"][number]["dueKind"];
          due_date: string | Date | null;
          due_at: Date | null;
          due_time_zone: string | null;
          context_id: string | null;
          origin_unit_id: string | null;
          origin_unit_revision: number | null;
          completed_at: Date | null;
          completion_version: number | null;
          origin_workspace_id: string | null;
          origin_id: string | null;
        }>(
          `SELECT t.id,t.title,t.description,t.state,t.version,t.due_kind,t.due_date,
                  t.due_at,t.due_time_zone,t.context_id,t.origin_unit_id,
                  t.origin_unit_revision,t.completed_at,t.completion_version,
                  o.source_workspace_id AS origin_workspace_id,o.source_id AS origin_id
           FROM business.task t LEFT JOIN LATERAL (
             SELECT source_workspace_id,source_id FROM business.transfer_origin
             WHERE workspace_id=t.workspace_id AND record_kind='task' AND target_id=t.id
             ORDER BY source_workspace_id,source_id LIMIT 1
           ) o ON true
           WHERE t.workspace_id=$1 ORDER BY t.id LIMIT 4097`,
          [workspaceId],
        );
        const events = await client.query<{
          id: string;
          title: string;
          description: string;
          state: TransferManifestV2["events"][number]["state"];
          version: number;
          schedule_kind: TransferManifestV2["events"][number]["scheduleKind"];
          time_zone: string;
          start_at: Date | null;
          end_at: Date | null;
          start_local: string | null;
          end_local: string | null;
          start_offset_minutes: number | null;
          end_offset_minutes: number | null;
          start_date: string | Date | null;
          end_date_exclusive: string | Date | null;
          origin_workspace_id: string | null;
          origin_id: string | null;
        }>(
          `SELECT e.id,e.title,e.description,e.state,e.version,e.schedule_kind,
                  e.time_zone,e.start_at,e.end_at,e.start_local,e.end_local,
                  e.start_offset_minutes,e.end_offset_minutes,e.start_date,e.end_date_exclusive,
                  o.source_workspace_id AS origin_workspace_id,o.source_id AS origin_id
           FROM business.calendar_event e LEFT JOIN LATERAL (
             SELECT source_workspace_id,source_id FROM business.transfer_origin
             WHERE workspace_id=e.workspace_id AND record_kind='event' AND target_id=e.id
             ORDER BY source_workspace_id,source_id LIMIT 1
           ) o ON true
           WHERE e.workspace_id=$1 ORDER BY e.id LIMIT 4097`,
          [workspaceId],
        );
        const contexts = await client.query<{
          id: string;
          name: string;
          purpose: string;
          scope: string;
          kind: TransferManifestV3["contexts"][number]["kind"];
          state: TransferManifestV3["contexts"][number]["state"];
          superseded_by_id: string | null;
          identity_revision: number;
          membership_revision: number;
          origin_workspace_id: string | null;
          origin_id: string | null;
          origin_revision: number | null;
        }>(
          `SELECT c.id,c.name,c.purpose,c.scope,c.kind,c.state,c.superseded_by_id,
                  c.identity_revision,c.membership_revision,
                  o.source_workspace_id AS origin_workspace_id,o.source_id AS origin_id,
                  o.source_revision AS origin_revision
           FROM business.context c LEFT JOIN LATERAL (
             SELECT source_workspace_id,source_id,source_revision FROM business.transfer_origin
             WHERE workspace_id=c.workspace_id AND record_kind='context' AND target_id=c.id
             ORDER BY source_workspace_id,source_id LIMIT 1
           ) o ON true
           WHERE c.workspace_id=$1 ORDER BY c.id LIMIT 4097`,
          [workspaceId],
        );
        const transitions = await client.query<{
          task_id: string;
          version: number;
          from_state: TransferManifestV4["taskTransitions"][number]["fromState"];
          to_state: TransferManifestV4["taskTransitions"][number]["toState"];
          recorded_at: Date;
        }>(
          `SELECT task_id,version,from_state,to_state,recorded_at
           FROM business.task_transition WHERE workspace_id=$1
           ORDER BY task_id,version LIMIT 16385`,
          [workspaceId],
        );
        const taskResults = await client.query<{
          id: string;
          task_id: string;
          capture_id: string;
          completion_version: number;
          recorded_at: Date;
          origin_workspace_id: string | null;
          origin_id: string | null;
        }>(
          `SELECT tr.id,tr.task_id,tr.capture_id,tr.completion_version,tr.recorded_at,
                  o.source_workspace_id AS origin_workspace_id,o.source_id AS origin_id
           FROM business.task_result tr LEFT JOIN LATERAL (
             SELECT source_workspace_id,source_id FROM business.transfer_origin
             WHERE workspace_id=tr.workspace_id AND record_kind='task_result' AND target_id=tr.id
             ORDER BY source_workspace_id,source_id LIMIT 1
           ) o ON true
           WHERE tr.workspace_id=$1 ORDER BY tr.id LIMIT 4097`,
          [workspaceId],
        );
        if (
          tasks.rows.length > 4096 ||
          events.rows.length > 4096 ||
          contexts.rows.length > 4096 ||
          transitions.rows.length > 16384 ||
          taskResults.rows.length > 4096
        )
          throw new DataTransferError("TRANSFER_UNAVAILABLE");
        return {
          captures,
          tasks: tasks.rows.map((row) => ({
            id: row.id,
            originWorkspaceId: row.origin_workspace_id ?? workspaceId,
            originId: row.origin_id ?? row.id,
            title: row.title,
            description: row.description,
            state: row.state,
            version: row.version,
            dueKind: row.due_kind,
            dueDate: dateOnly(row.due_date),
            dueAt: row.due_at?.toISOString() ?? null,
            dueTimeZone: row.due_time_zone,
            contextId: row.context_id,
            originUnitId: row.origin_unit_id,
            originUnitRevision: row.origin_unit_revision,
            completedAt: row.completed_at?.toISOString() ?? null,
            completionVersion: row.completion_version,
          })),
          events: events.rows.map((row) => ({
            id: row.id,
            originWorkspaceId: row.origin_workspace_id ?? workspaceId,
            originId: row.origin_id ?? row.id,
            title: row.title,
            description: row.description,
            state: row.state,
            version: row.version,
            scheduleKind: row.schedule_kind,
            timeZone: row.time_zone,
            startAt: row.start_at?.toISOString() ?? null,
            endAt: row.end_at?.toISOString() ?? null,
            startLocal: row.start_local,
            endLocal: row.end_local,
            startOffsetMinutes: row.start_offset_minutes,
            endOffsetMinutes: row.end_offset_minutes,
            startDate: dateOnly(row.start_date),
            endDateExclusive: dateOnly(row.end_date_exclusive),
          })),
          contexts: contexts.rows.map((row) => ({
            id: row.id,
            originWorkspaceId: row.origin_workspace_id ?? workspaceId,
            originId: row.origin_id ?? row.id,
            name: row.name,
            purpose: row.purpose,
            scope: row.scope,
            kind: row.kind,
            state: row.state,
            supersededById: row.superseded_by_id,
            identityRevision: row.origin_revision ?? row.identity_revision,
            membershipRevision: row.membership_revision,
          })),
          taskTransitions: transitions.rows.map((row) => ({
            taskId: row.task_id,
            version: row.version,
            fromState: row.from_state,
            toState: row.to_state,
            recordedAt: row.recorded_at.toISOString(),
          })),
          taskResults: taskResults.rows.map((row) => ({
            id: row.id,
            originWorkspaceId: row.origin_workspace_id ?? workspaceId,
            originId: row.origin_id ?? row.id,
            taskId: row.task_id,
            captureId: row.capture_id,
            completionVersion: row.completion_version,
            recordedAt: row.recorded_at.toISOString(),
          })),
        };
      },
      "REPEATABLE READ",
    );
    const bytes = createTaskResultBundle(
      workspaceId,
      snapshot.captures,
      snapshot.tasks,
      snapshot.events,
      snapshot.contexts,
      snapshot.taskTransitions,
      snapshot.taskResults,
    );
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
          return publicRun(
            result.rows[0]!,
            "CAPTURES_TASKS_EVENTS_CONTEXTS_TASK_HISTORY_RESULTS",
          );
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
    if (previous) return publicRun(previous, bundleScope(manifest.version));
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
          if (concurrent)
            return {
              run: publicRun(concurrent, bundleScope(manifest.version)),
              reused: true,
            };
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
          if (manifest.version !== 1) {
            for (const [kind, records] of [
              ["task", manifest.tasks],
              ["event", manifest.events],
            ] as const) {
              for (const record of records)
                await client.query(
                  `INSERT INTO business.transfer_row
                 (workspace_id,run_id,record_kind,source_id,source_revision)
                 VALUES($1,$2,$3,$4,$5)`,
                  [workspaceId, id, kind, record.id, record.version],
                );
            }
          }
          if (
            manifest.version === 3 ||
            manifest.version === 4 ||
            manifest.version === 5
          ) {
            for (const context of manifest.contexts)
              await client.query(
                `INSERT INTO business.transfer_row
               (workspace_id,run_id,record_kind,source_id,source_revision)
               VALUES($1,$2,'context',$3,$4)`,
                [workspaceId, id, context.id, context.identityRevision],
              );
          }
          if (manifest.version === 5) {
            for (const result of manifest.taskResults)
              await client.query(
                `INSERT INTO business.transfer_row
                 (workspace_id,run_id,record_kind,source_id,source_revision)
                 VALUES($1,$2,'task_result',$3,$4)`,
                [workspaceId, id, result.id, result.completionVersion],
              );
          }
          return {
            run: publicRun(result.rows[0]!, bundleScope(manifest.version)),
            reused: false,
          };
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
              recordKind: "capture",
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
          const stale = !previous
            ? await client.query<{ target_id: string }>(
                `SELECT target_id FROM business.transfer_origin
             WHERE workspace_id=$1 AND record_kind='capture'
               AND source_workspace_id=$2 AND source_id=$3`,
                [workspaceId, record.originWorkspaceId, record.originCaptureId],
              )
            : null;
          rows.push({
            recordKind: "capture",
            sourceId: record.id,
            sourceRevision: record.revision,
            state: !previous
              ? stale?.rows[0]
                ? "CONFLICT"
                : "NEW"
              : previous.title === record.title &&
                  previous.raw_body === record.rawBody
                ? "DUPLICATE"
                : "CONFLICT",
            targetId: previous?.id ?? stale?.rows[0]?.target_id ?? null,
          });
        }
        if (
          bundle.manifest.version === 3 ||
          bundle.manifest.version === 4 ||
          bundle.manifest.version === 5
        ) {
          for (const record of bundle.manifest.contexts)
            rows.push(
              await this.previewContext(client, workspaceId, id, record),
            );
        }
        if (bundle.manifest.version !== 1) {
          for (const record of bundle.manifest.tasks)
            rows.push(
              await this.previewTask(
                client,
                workspaceId,
                id,
                record,
                bundle.manifest.version === 3 ||
                  bundle.manifest.version === 4 ||
                  bundle.manifest.version === 5
                  ? bundle.manifest.contexts
                  : [],
                bundle.manifest.version === 4 || bundle.manifest.version === 5
                  ? bundle.manifest.taskTransitions.filter(
                      (transition) =>
                        transition.taskId.toLowerCase() ===
                        record.id.toLowerCase(),
                    )
                  : undefined,
              ),
            );
          for (const record of bundle.manifest.events)
            rows.push(await this.previewEvent(client, workspaceId, id, record));
        }
        if (bundle.manifest.version === 5) {
          for (const record of bundle.manifest.taskResults)
            rows.push(
              await this.previewTaskResult(
                client,
                workspaceId,
                id,
                record,
                rows,
              ),
            );
        }
        return {
          run: publicRun(run, bundleScope(bundle.manifest.version)),
          rows,
          previewHash: previewHash(rows),
        };
      },
    );
  }

  private async previewContext(
    client: PoolClient,
    workspaceId: string,
    runId: string,
    record: TransferManifestV3["contexts"][number],
  ): Promise<TransferPreviewRow> {
    const base = {
      recordKind: "context" as const,
      sourceId: record.id,
      sourceRevision: record.identityRevision,
    };
    const row = await client.query<{
      state: "PENDING" | "IMPORTED" | "SKIPPED" | "FAILED";
      target_id: string | null;
    }>(
      `SELECT state,target_id FROM business.transfer_row
       WHERE workspace_id=$1 AND run_id=$2 AND record_kind='context' AND source_id=$3`,
      [workspaceId, runId, record.id],
    );
    if (row.rows[0] && row.rows[0].state !== "PENDING")
      return {
        ...base,
        state: row.rows[0].state,
        targetId: row.rows[0].target_id,
      };
    if (record.state === "SUPERSEDED")
      return { ...base, state: "MISSING_REFERENCE", targetId: null };
    const existing = await client.query<{
      target_id: string;
      same: boolean | null;
    }>(
      `SELECT o.target_id,
         o.source_revision=$4 AND c.name=$5 AND c.purpose=$6 AND c.scope=$7
         AND c.kind=$8 AND c.state=$9 AND c.superseded_by_id IS NULL AS same
       FROM business.transfer_origin o LEFT JOIN business.context c
         ON c.workspace_id=o.workspace_id AND c.id=o.target_id
       WHERE o.workspace_id=$1 AND o.record_kind='context'
         AND o.source_workspace_id=$2 AND o.source_id=$3 LIMIT 1`,
      [
        workspaceId,
        record.originWorkspaceId,
        record.originId,
        record.identityRevision,
        record.name,
        record.purpose,
        record.scope,
        record.kind,
        record.state,
      ],
    );
    const prior = existing.rows[0];
    return {
      ...base,
      state: !prior ? "NEW" : prior.same ? "DUPLICATE" : "CONFLICT",
      targetId: prior?.target_id ?? null,
    };
  }

  private async previewTask(
    client: PoolClient,
    workspaceId: string,
    runId: string,
    record: TransferManifestV2["tasks"][number],
    contexts: TransferManifestV3["contexts"] = [],
    transitions?: TransferManifestV4["taskTransitions"],
  ): Promise<TransferPreviewRow> {
    const base = {
      recordKind: "task" as const,
      sourceId: record.id,
      sourceRevision: record.version,
    };
    const row = await client.query<{
      state: "PENDING" | "IMPORTED" | "SKIPPED" | "FAILED";
      target_id: string | null;
    }>(
      `SELECT state,target_id FROM business.transfer_row
       WHERE workspace_id=$1 AND run_id=$2 AND record_kind='task' AND source_id=$3`,
      [workspaceId, runId, record.id],
    );
    if (row.rows[0] && row.rows[0].state !== "PENDING")
      return {
        ...base,
        state: row.rows[0].state,
        targetId: row.rows[0].target_id,
      };
    const context = await this.taskContextMapping(
      client,
      workspaceId,
      runId,
      record.contextId,
      contexts,
    );
    if (!context.valid || record.originUnitId)
      return { ...base, state: "MISSING_REFERENCE", targetId: null };
    const existing = await client.query<{ target_id: string; same: boolean }>(
      `SELECT o.target_id,
         o.source_revision=$4 AND t.title=$5 AND t.description=$6 AND t.state=$7
         AND t.version=$4 AND t.due_kind=$8
         AND t.due_date IS NOT DISTINCT FROM $9::date
         AND t.due_at IS NOT DISTINCT FROM $10::timestamptz
         AND t.due_time_zone IS NOT DISTINCT FROM $11::text
         AND t.context_id IS NOT DISTINCT FROM $14::uuid AND t.origin_unit_id IS NULL
         AND t.completed_at IS NOT DISTINCT FROM $12::timestamptz
         AND t.completion_version IS NOT DISTINCT FROM $13::integer AS same
       FROM business.transfer_origin o LEFT JOIN business.task t
         ON t.workspace_id=o.workspace_id AND t.id=o.target_id
       WHERE o.workspace_id=$1 AND o.record_kind='task'
         AND o.source_workspace_id=$2 AND o.source_id=$3 LIMIT 1`,
      [
        workspaceId,
        record.originWorkspaceId,
        record.originId,
        record.version,
        record.title,
        record.description,
        record.state,
        record.dueKind,
        record.dueDate,
        record.dueAt,
        record.dueTimeZone,
        record.completedAt,
        record.completionVersion,
        context.targetId,
      ],
    );
    const prior = existing.rows[0];
    let sameHistory = true;
    if (prior?.same && transitions !== undefined) {
      const actual = await client.query<{
        version: number;
        from_state: string;
        to_state: string;
        recorded_at: Date;
      }>(
        `SELECT version,from_state,to_state,recorded_at
         FROM business.task_transition WHERE workspace_id=$1 AND task_id=$2 ORDER BY version`,
        [workspaceId, prior.target_id],
      );
      const expected = [...transitions].sort((a, b) => a.version - b.version);
      sameHistory =
        actual.rows.length === expected.length &&
        actual.rows.every(
          (row, index) =>
            row.version === expected[index]!.version &&
            row.from_state === expected[index]!.fromState &&
            row.to_state === expected[index]!.toState &&
            row.recorded_at.getTime() ===
              new Date(expected[index]!.recordedAt).getTime(),
        );
    }
    return {
      ...base,
      state: !prior
        ? "NEW"
        : prior.same && sameHistory
          ? "DUPLICATE"
          : "CONFLICT",
      targetId: prior?.target_id ?? null,
    };
  }

  private async taskContextMapping(
    client: PoolClient,
    workspaceId: string,
    runId: string,
    sourceId: string | null,
    contexts: TransferManifestV3["contexts"],
  ): Promise<{ valid: boolean; targetId: string | null }> {
    if (!sourceId) return { valid: true, targetId: null };
    const source = contexts.find(
      (context) => context.id.toLowerCase() === sourceId.toLowerCase(),
    );
    if (!source) return { valid: false, targetId: null };
    const preview = await this.previewContext(
      client,
      workspaceId,
      runId,
      source,
    );
    return {
      valid: ["NEW", "DUPLICATE", "IMPORTED", "SKIPPED"].includes(
        preview.state,
      ),
      targetId: preview.targetId,
    };
  }

  private async previewEvent(
    client: PoolClient,
    workspaceId: string,
    runId: string,
    record: TransferManifestV2["events"][number],
  ): Promise<TransferPreviewRow> {
    const base = {
      recordKind: "event" as const,
      sourceId: record.id,
      sourceRevision: record.version,
    };
    const row = await client.query<{
      state: "PENDING" | "IMPORTED" | "SKIPPED" | "FAILED";
      target_id: string | null;
    }>(
      `SELECT state,target_id FROM business.transfer_row
       WHERE workspace_id=$1 AND run_id=$2 AND record_kind='event' AND source_id=$3`,
      [workspaceId, runId, record.id],
    );
    if (row.rows[0] && row.rows[0].state !== "PENDING")
      return {
        ...base,
        state: row.rows[0].state,
        targetId: row.rows[0].target_id,
      };
    const existing = await client.query<{ target_id: string; same: boolean }>(
      `SELECT o.target_id,
         o.source_revision=$4 AND e.title=$5 AND e.description=$6 AND e.state=$7
         AND e.version=$4 AND e.schedule_kind=$8 AND e.time_zone=$9
         AND e.start_at IS NOT DISTINCT FROM $10::timestamptz
         AND e.end_at IS NOT DISTINCT FROM $11::timestamptz
         AND e.start_local IS NOT DISTINCT FROM $12::text
         AND e.end_local IS NOT DISTINCT FROM $13::text
         AND e.start_offset_minutes IS NOT DISTINCT FROM $14::integer
         AND e.end_offset_minutes IS NOT DISTINCT FROM $15::integer
         AND e.start_date IS NOT DISTINCT FROM $16::date
         AND e.end_date_exclusive IS NOT DISTINCT FROM $17::date AS same
       FROM business.transfer_origin o LEFT JOIN business.calendar_event e
         ON e.workspace_id=o.workspace_id AND e.id=o.target_id
       WHERE o.workspace_id=$1 AND o.record_kind='event'
         AND o.source_workspace_id=$2 AND o.source_id=$3 LIMIT 1`,
      [
        workspaceId,
        record.originWorkspaceId,
        record.originId,
        record.version,
        record.title,
        record.description,
        record.state,
        record.scheduleKind,
        record.timeZone,
        record.startAt,
        record.endAt,
        record.startLocal,
        record.endLocal,
        record.startOffsetMinutes,
        record.endOffsetMinutes,
        record.startDate,
        record.endDateExclusive,
      ],
    );
    const prior = existing.rows[0];
    return {
      ...base,
      state: !prior ? "NEW" : prior.same ? "DUPLICATE" : "CONFLICT",
      targetId: prior?.target_id ?? null,
    };
  }

  private async previewTaskResult(
    client: PoolClient,
    workspaceId: string,
    runId: string,
    record: TransferManifestV5["taskResults"][number],
    references: TransferPreviewRow[],
  ): Promise<TransferPreviewRow> {
    const base = {
      recordKind: "task_result" as const,
      sourceId: record.id,
      sourceRevision: record.completionVersion,
    };
    const row = await client.query<{
      state: "PENDING" | "IMPORTED" | "SKIPPED" | "FAILED";
      target_id: string | null;
    }>(
      `SELECT state,target_id FROM business.transfer_row
       WHERE workspace_id=$1 AND run_id=$2 AND record_kind='task_result' AND source_id=$3`,
      [workspaceId, runId, record.id],
    );
    if (row.rows[0] && row.rows[0].state !== "PENDING")
      return {
        ...base,
        state: row.rows[0].state,
        targetId: row.rows[0].target_id,
      };
    const task = references.find(
      (reference) =>
        reference.recordKind === "task" &&
        reference.sourceId.toLowerCase() === record.taskId.toLowerCase(),
    );
    const capture = references.find(
      (reference) =>
        reference.recordKind === "capture" &&
        reference.sourceId.toLowerCase() === record.captureId.toLowerCase(),
    );
    const usable = (reference: TransferPreviewRow | undefined) =>
      reference &&
      ["NEW", "DUPLICATE", "IMPORTED", "SKIPPED"].includes(reference.state);
    if (!usable(task) || !usable(capture))
      return { ...base, state: "MISSING_REFERENCE", targetId: null };
    if (task!.targetId) {
      const transition = await client.query(
        `SELECT 1 FROM business.task_transition
         WHERE workspace_id=$1 AND task_id=$2 AND version=$3 AND to_state='DONE'`,
        [workspaceId, task!.targetId, record.completionVersion],
      );
      if (transition.rowCount !== 1)
        return { ...base, state: "MISSING_REFERENCE", targetId: null };
    }
    const prior = await client.query<{
      target_id: string;
      same: boolean | null;
    }>(
      `SELECT o.target_id,
         o.source_revision=$4 AND tr.task_id IS NOT DISTINCT FROM $5::uuid
         AND tr.capture_id IS NOT DISTINCT FROM $6::uuid
         AND tr.completion_version=$4
         AND tr.recorded_at=$7::timestamptz AS same
       FROM business.transfer_origin o LEFT JOIN business.task_result tr
         ON tr.workspace_id=o.workspace_id AND tr.id=o.target_id
       WHERE o.workspace_id=$1 AND o.record_kind='task_result'
         AND o.source_workspace_id=$2 AND o.source_id=$3 LIMIT 1`,
      [
        workspaceId,
        record.originWorkspaceId,
        record.originId,
        record.completionVersion,
        task!.targetId,
        capture!.targetId,
        record.recordedAt,
      ],
    );
    if (prior.rows[0])
      return {
        ...base,
        state: prior.rows[0].same ? "DUPLICATE" : "CONFLICT",
        targetId: prior.rows[0].target_id,
      };
    if (task!.targetId) {
      const occupied = await client.query<{ id: string }>(
        `SELECT id FROM business.task_result
         WHERE workspace_id=$1 AND task_id=$2 AND completion_version=$3`,
        [workspaceId, task!.targetId, record.completionVersion],
      );
      if (occupied.rows[0])
        return {
          ...base,
          state: "CONFLICT",
          targetId: occupied.rows[0].id,
        };
    }
    if (capture!.targetId) {
      const occupied = await client.query<{ id: string }>(
        `SELECT id FROM business.task_result
         WHERE workspace_id=$1 AND capture_id=$2`,
        [workspaceId, capture!.targetId],
      );
      if (occupied.rows[0])
        return {
          ...base,
          state: "CONFLICT",
          targetId: occupied.rows[0].id,
        };
    }
    return { ...base, state: "NEW", targetId: null };
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
              sourceLock(
                workspaceId,
                record.originWorkspaceId,
                record.originCaptureId,
                "capture",
              ),
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
          const stale = !previous
            ? await client.query<{ target_id: string }>(
                `SELECT target_id FROM business.transfer_origin
             WHERE workspace_id=$1 AND record_kind='capture'
               AND source_workspace_id=$2 AND source_id=$3`,
                [workspaceId, record.originWorkspaceId, record.originCaptureId],
              )
            : null;
          const state = previous
            ? previous.title === record.title &&
              previous.raw_body === record.rawBody
              ? "SKIPPED"
              : "FAILED"
            : stale?.rows[0]
              ? "FAILED"
              : "IMPORTED";
          const targetId = previous
            ? previous.id
            : stale?.rows[0]
              ? stale.rows[0].target_id
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
          if (state !== "FAILED") {
            const origin = await client.query(
              `INSERT INTO business.transfer_origin
               (workspace_id,record_kind,source_workspace_id,source_id,source_revision,target_id)
               VALUES($1,'capture',$2,$3,$4,$5)
               ON CONFLICT (workspace_id,record_kind,source_workspace_id,source_id)
               DO NOTHING
               RETURNING target_id`,
              [
                workspaceId,
                record.originWorkspaceId,
                record.originCaptureId,
                record.revision,
                targetId,
              ],
            );
            if (origin.rowCount !== 1) {
              const mapped = await client.query<{ target_id: string }>(
                `SELECT target_id FROM business.transfer_origin
                 WHERE workspace_id=$1 AND record_kind='capture'
                   AND source_workspace_id=$2 AND source_id=$3`,
                [workspaceId, record.originWorkspaceId, record.originCaptureId],
              );
              if (mapped.rows[0]?.target_id !== targetId)
                throw new DataTransferError("TRANSFER_UNAVAILABLE");
            }
          }
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
    if (
      bundle.manifest.version === 3 ||
      bundle.manifest.version === 4 ||
      bundle.manifest.version === 5
    ) {
      for (const record of bundle.manifest.contexts)
        await this.applyContext(actorId, workspaceId, id, record);
    }
    if (bundle.manifest.version !== 1) {
      for (const record of bundle.manifest.tasks)
        await this.applyTask(
          actorId,
          workspaceId,
          id,
          record,
          bundle.manifest.version === 3 ||
            bundle.manifest.version === 4 ||
            bundle.manifest.version === 5
            ? bundle.manifest.contexts
            : [],
          bundle.manifest.version === 4 || bundle.manifest.version === 5
            ? bundle.manifest.taskTransitions.filter(
                (transition) =>
                  transition.taskId.toLowerCase() === record.id.toLowerCase(),
              )
            : undefined,
        );
      for (const record of bundle.manifest.events)
        await this.applyEvent(actorId, workspaceId, id, record);
    }
    if (bundle.manifest.version === 5) {
      for (const record of bundle.manifest.taskResults)
        await this.applyTaskResult(actorId, workspaceId, id, record);
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

  private async applyContext(
    actorId: string,
    workspaceId: string,
    runId: string,
    record: TransferManifestV3["contexts"][number],
  ): Promise<void> {
    await this.commands.execute({
      actorId,
      kind: "transfer.context.apply",
      idempotencyKey: createHash("sha256")
        .update(`${runId}:context:${record.id}`)
        .digest("hex"),
      payload: {
        workspaceId,
        runId,
        sourceId: record.id,
        sourceRevision: record.identityRevision,
      },
      apply: async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new DataTransferError("TRANSFER_NOT_FOUND");
        await loadRun(client, workspaceId, actorId, runId, "IMPORT");
        const locked = await client.query<{
          state: string;
          target_id: string | null;
        }>(
          `SELECT state,target_id FROM business.transfer_row
           WHERE workspace_id=$1 AND run_id=$2 AND record_kind='context' AND source_id=$3 FOR UPDATE`,
          [workspaceId, runId, record.id],
        );
        if (!locked.rows[0]) throw new DataTransferError("TRANSFER_NOT_FOUND");
        if (locked.rows[0].state !== "PENDING")
          return {
            response: {
              id: locked.rows[0].target_id,
              state: locked.rows[0].state,
            },
            audit: {
              action: "transfer.context.replay",
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
            sourceLock(
              workspaceId,
              record.originWorkspaceId,
              record.originId,
              "context",
            ),
          ],
        );
        const preview = await this.previewContext(
          client,
          workspaceId,
          runId,
          record,
        );
        const state =
          preview.state === "NEW"
            ? "IMPORTED"
            : preview.state === "DUPLICATE"
              ? "SKIPPED"
              : "FAILED";
        const targetId = state === "IMPORTED" ? randomUUID() : preview.targetId;
        if (state === "IMPORTED") {
          await client.query(
            `INSERT INTO business.context
             (id,workspace_id,name,purpose,scope,kind,state)
             VALUES($1,$2,$3,$4,$5,$6,$7)`,
            [
              targetId,
              workspaceId,
              record.name,
              record.purpose,
              record.scope,
              record.kind,
              record.state,
            ],
          );
          await client.query(
            `INSERT INTO business.context_identity_revision
             (workspace_id,context_id,revision,name,purpose,scope,kind,state)
             VALUES($1,$2,1,$3,$4,$5,$6,$7)`,
            [
              workspaceId,
              targetId,
              record.name,
              record.purpose,
              record.scope,
              record.kind,
              record.state,
            ],
          );
          await client.query(
            `INSERT INTO business.transfer_origin
             (workspace_id,record_kind,source_workspace_id,source_id,source_revision,target_id)
             VALUES($1,'context',$2,$3,$4,$5)`,
            [
              workspaceId,
              record.originWorkspaceId,
              record.originId,
              record.identityRevision,
              targetId,
            ],
          );
        }
        await client.query(
          `UPDATE business.transfer_row SET state=$4,target_id=$5,reason_code=$6
           WHERE workspace_id=$1 AND run_id=$2 AND record_kind='context' AND source_id=$3`,
          [
            workspaceId,
            runId,
            record.id,
            state,
            targetId,
            state === "FAILED"
              ? preview.state === "MISSING_REFERENCE"
                ? "MISSING_REFERENCE"
                : "CONTENT_CONFLICT"
              : null,
          ],
        );
        return {
          response: { id: targetId, state },
          audit: {
            action: "transfer.context.apply",
            targetType: state === "IMPORTED" ? "context" : "transfer_row",
            targetId: state === "IMPORTED" ? targetId! : record.id,
            beforeVersion: null,
            afterVersion: state === "IMPORTED" ? 1 : null,
            changedFieldNames:
              state === "IMPORTED"
                ? ["name", "purpose", "scope", "kind", "state"]
                : ["state"],
          },
        };
      },
    });
  }

  private async applyTask(
    actorId: string,
    workspaceId: string,
    runId: string,
    record: TransferManifestV2["tasks"][number],
    contexts: TransferManifestV3["contexts"] = [],
    transitions?: TransferManifestV4["taskTransitions"],
  ): Promise<void> {
    await this.commands.execute({
      actorId,
      kind: "transfer.task.apply",
      idempotencyKey: createHash("sha256")
        .update(`${runId}:task:${record.id}`)
        .digest("hex"),
      payload: {
        workspaceId,
        runId,
        sourceId: record.id,
        sourceRevision: record.version,
      },
      apply: async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new DataTransferError("TRANSFER_NOT_FOUND");
        await loadRun(client, workspaceId, actorId, runId, "IMPORT");
        const locked = await client.query<{
          state: string;
          target_id: string | null;
        }>(
          `SELECT state,target_id FROM business.transfer_row
           WHERE workspace_id=$1 AND run_id=$2 AND record_kind='task' AND source_id=$3 FOR UPDATE`,
          [workspaceId, runId, record.id],
        );
        if (!locked.rows[0]) throw new DataTransferError("TRANSFER_NOT_FOUND");
        if (locked.rows[0].state !== "PENDING")
          return {
            response: {
              id: locked.rows[0].target_id,
              state: locked.rows[0].state,
            },
            audit: {
              action: "transfer.task.replay",
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
            sourceLock(
              workspaceId,
              record.originWorkspaceId,
              record.originId,
              "task",
            ),
          ],
        );
        const preview = await this.previewTask(
          client,
          workspaceId,
          runId,
          record,
          contexts,
          transitions,
        );
        const context = await this.taskContextMapping(
          client,
          workspaceId,
          runId,
          record.contextId,
          contexts,
        );
        const state =
          preview.state === "NEW"
            ? "IMPORTED"
            : preview.state === "DUPLICATE"
              ? "SKIPPED"
              : "FAILED";
        const targetId = state === "IMPORTED" ? randomUUID() : preview.targetId;
        if (state === "IMPORTED") {
          await client.query(
            `INSERT INTO business.task
             (id,workspace_id,created_by_id,title,description,state,version,due_kind,due_date,
              due_at,due_time_zone,context_id,origin_kind,origin_unit_id,origin_unit_revision,
              completed_at,completion_version)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'EXPLICIT',NULL,NULL,$13,$14)`,
            [
              targetId,
              workspaceId,
              actorId,
              record.title,
              record.description,
              record.state,
              record.version,
              record.dueKind,
              record.dueDate,
              record.dueAt,
              record.dueTimeZone,
              context.targetId,
              record.completedAt,
              record.completionVersion,
            ],
          );
          for (const transition of transitions ?? [])
            await client.query(
              `INSERT INTO business.task_transition
               (workspace_id,task_id,version,from_state,to_state,actor_id,recorded_at)
               VALUES($1,$2,$3,$4,$5,$6,$7)`,
              [
                workspaceId,
                targetId,
                transition.version,
                transition.fromState,
                transition.toState,
                actorId,
                transition.recordedAt,
              ],
            );
        }
        if (state === "IMPORTED")
          await client.query(
            `INSERT INTO business.transfer_origin
             (workspace_id,record_kind,source_workspace_id,source_id,source_revision,target_id)
             VALUES($1,'task',$2,$3,$4,$5)`,
            [
              workspaceId,
              record.originWorkspaceId,
              record.originId,
              record.version,
              targetId,
            ],
          );
        await client.query(
          `UPDATE business.transfer_row SET state=$4,target_id=$5,reason_code=$6
           WHERE workspace_id=$1 AND run_id=$2 AND record_kind='task' AND source_id=$3`,
          [
            workspaceId,
            runId,
            record.id,
            state,
            targetId,
            state === "FAILED"
              ? preview.state === "MISSING_REFERENCE"
                ? "MISSING_REFERENCE"
                : "CONTENT_CONFLICT"
              : null,
          ],
        );
        return {
          response: { id: targetId, state },
          audit: {
            action: "transfer.task.apply",
            targetType: state === "IMPORTED" ? "task" : "transfer_row",
            targetId: state === "IMPORTED" ? targetId! : record.id,
            beforeVersion: null,
            afterVersion: state === "IMPORTED" ? record.version : null,
            changedFieldNames:
              state === "IMPORTED"
                ? ["title", "description", "state", "due"]
                : ["state"],
          },
        };
      },
    });
  }

  private async applyEvent(
    actorId: string,
    workspaceId: string,
    runId: string,
    record: TransferManifestV2["events"][number],
  ): Promise<void> {
    await this.commands.execute({
      actorId,
      kind: "transfer.event.apply",
      idempotencyKey: createHash("sha256")
        .update(`${runId}:event:${record.id}`)
        .digest("hex"),
      payload: {
        workspaceId,
        runId,
        sourceId: record.id,
        sourceRevision: record.version,
      },
      apply: async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new DataTransferError("TRANSFER_NOT_FOUND");
        await loadRun(client, workspaceId, actorId, runId, "IMPORT");
        const locked = await client.query<{
          state: string;
          target_id: string | null;
        }>(
          `SELECT state,target_id FROM business.transfer_row
           WHERE workspace_id=$1 AND run_id=$2 AND record_kind='event' AND source_id=$3 FOR UPDATE`,
          [workspaceId, runId, record.id],
        );
        if (!locked.rows[0]) throw new DataTransferError("TRANSFER_NOT_FOUND");
        if (locked.rows[0].state !== "PENDING")
          return {
            response: {
              id: locked.rows[0].target_id,
              state: locked.rows[0].state,
            },
            audit: {
              action: "transfer.event.replay",
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
            sourceLock(
              workspaceId,
              record.originWorkspaceId,
              record.originId,
              "event",
            ),
          ],
        );
        const preview = await this.previewEvent(
          client,
          workspaceId,
          runId,
          record,
        );
        const state =
          preview.state === "NEW"
            ? "IMPORTED"
            : preview.state === "DUPLICATE"
              ? "SKIPPED"
              : "FAILED";
        const targetId = state === "IMPORTED" ? randomUUID() : preview.targetId;
        if (state === "IMPORTED")
          await client.query(
            `INSERT INTO business.calendar_event
           (id,workspace_id,created_by_id,title,description,state,version,schedule_kind,time_zone,
            start_at,end_at,start_local,end_local,start_offset_minutes,end_offset_minutes,start_date,end_date_exclusive)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
            [
              targetId,
              workspaceId,
              actorId,
              record.title,
              record.description,
              record.state,
              record.version,
              record.scheduleKind,
              record.timeZone,
              record.startAt,
              record.endAt,
              record.startLocal,
              record.endLocal,
              record.startOffsetMinutes,
              record.endOffsetMinutes,
              record.startDate,
              record.endDateExclusive,
            ],
          );
        if (state === "IMPORTED")
          await client.query(
            `INSERT INTO business.transfer_origin
             (workspace_id,record_kind,source_workspace_id,source_id,source_revision,target_id)
             VALUES($1,'event',$2,$3,$4,$5)`,
            [
              workspaceId,
              record.originWorkspaceId,
              record.originId,
              record.version,
              targetId,
            ],
          );
        await client.query(
          `UPDATE business.transfer_row SET state=$4,target_id=$5,reason_code=$6
           WHERE workspace_id=$1 AND run_id=$2 AND record_kind='event' AND source_id=$3`,
          [
            workspaceId,
            runId,
            record.id,
            state,
            targetId,
            state === "FAILED" ? "CONTENT_CONFLICT" : null,
          ],
        );
        return {
          response: { id: targetId, state },
          audit: {
            action: "transfer.event.apply",
            targetType: state === "IMPORTED" ? "event" : "transfer_row",
            targetId: state === "IMPORTED" ? targetId! : record.id,
            beforeVersion: null,
            afterVersion: state === "IMPORTED" ? record.version : null,
            changedFieldNames:
              state === "IMPORTED"
                ? ["title", "description", "state", "schedule"]
                : ["state"],
          },
        };
      },
    });
  }

  private async applyTaskResult(
    actorId: string,
    workspaceId: string,
    runId: string,
    record: TransferManifestV5["taskResults"][number],
  ): Promise<void> {
    await this.commands.execute({
      actorId,
      kind: "transfer.task_result.apply",
      idempotencyKey: createHash("sha256")
        .update(`${runId}:task_result:${record.id}`)
        .digest("hex"),
      payload: {
        workspaceId,
        runId,
        sourceId: record.id,
        sourceRevision: record.completionVersion,
      },
      apply: async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new DataTransferError("TRANSFER_NOT_FOUND");
        await loadRun(client, workspaceId, actorId, runId, "IMPORT");
        const locked = await client.query<{
          state: string;
          target_id: string | null;
        }>(
          `SELECT state,target_id FROM business.transfer_row
           WHERE workspace_id=$1 AND run_id=$2 AND record_kind='task_result' AND source_id=$3 FOR UPDATE`,
          [workspaceId, runId, record.id],
        );
        if (!locked.rows[0]) throw new DataTransferError("TRANSFER_NOT_FOUND");
        if (locked.rows[0].state !== "PENDING")
          return {
            response: {
              id: locked.rows[0].target_id,
              state: locked.rows[0].state,
            },
            audit: {
              action: "transfer.task_result.replay",
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
            sourceLock(
              workspaceId,
              record.originWorkspaceId,
              record.originId,
              "task_result",
            ),
          ],
        );
        const references = await client.query<{
          record_kind: "task" | "capture";
          source_id: string;
          source_revision: number;
          state: "PENDING" | "IMPORTED" | "SKIPPED" | "FAILED";
          target_id: string | null;
        }>(
          `SELECT record_kind,source_id,source_revision,state,target_id
           FROM business.transfer_row
           WHERE workspace_id=$1 AND run_id=$2 AND
             ((record_kind='task' AND source_id=$3) OR
              (record_kind='capture' AND source_id=$4))`,
          [workspaceId, runId, record.taskId, record.captureId],
        );
        const resolved: TransferPreviewRow[] = references.rows.map((row) => ({
          recordKind: row.record_kind,
          sourceId: row.source_id,
          sourceRevision: row.source_revision,
          state:
            row.state === "PENDING" || row.target_id === null
              ? "MISSING_REFERENCE"
              : row.state,
          targetId: row.target_id,
        }));
        const taskTarget = resolved.find(
          (row) => row.recordKind === "task",
        )?.targetId;
        const captureTarget = resolved.find(
          (row) => row.recordKind === "capture",
        )?.targetId;
        if (taskTarget && captureTarget) {
          await client.query(
            `SELECT id FROM business.task WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
            [workspaceId, taskTarget],
          );
          const locks = [
            sourceLock(
              workspaceId,
              workspaceId,
              taskTarget,
              `task_completion:${record.completionVersion}`,
            ),
            sourceLock(workspaceId, workspaceId, captureTarget, "task_capture"),
          ].sort();
          for (const key of locks)
            await client.query(
              "SELECT pg_advisory_xact_lock(hashtextextended($1, 2122))",
              [key],
            );
        }
        const preview = await this.previewTaskResult(
          client,
          workspaceId,
          runId,
          record,
          resolved,
        );
        const state =
          preview.state === "NEW"
            ? "IMPORTED"
            : preview.state === "DUPLICATE"
              ? "SKIPPED"
              : "FAILED";
        const targetId = state === "IMPORTED" ? randomUUID() : preview.targetId;
        if (state === "IMPORTED") {
          await client.query(
            `INSERT INTO business.task_result
             (id,workspace_id,task_id,completion_version,capture_id,created_by_id,recorded_at)
             VALUES($1,$2,$3,$4,$5,$6,$7)`,
            [
              targetId,
              workspaceId,
              taskTarget,
              record.completionVersion,
              captureTarget,
              actorId,
              record.recordedAt,
            ],
          );
          await client.query(
            `INSERT INTO business.transfer_origin
             (workspace_id,record_kind,source_workspace_id,source_id,source_revision,target_id)
             VALUES($1,'task_result',$2,$3,$4,$5)`,
            [
              workspaceId,
              record.originWorkspaceId,
              record.originId,
              record.completionVersion,
              targetId,
            ],
          );
        }
        await client.query(
          `UPDATE business.transfer_row SET state=$4,target_id=$5,reason_code=$6
           WHERE workspace_id=$1 AND run_id=$2 AND record_kind='task_result' AND source_id=$3`,
          [
            workspaceId,
            runId,
            record.id,
            state,
            targetId,
            state === "FAILED"
              ? preview.state === "MISSING_REFERENCE"
                ? "MISSING_REFERENCE"
                : "CONTENT_CONFLICT"
              : null,
          ],
        );
        return {
          response: { id: targetId, state },
          audit: {
            action: "transfer.task_result.apply",
            targetType: state === "IMPORTED" ? "task_result" : "transfer_row",
            targetId: state === "IMPORTED" ? targetId! : record.id,
            beforeVersion: null,
            afterVersion:
              state === "IMPORTED" ? record.completionVersion : null,
            changedFieldNames:
              state === "IMPORTED"
                ? ["task_id", "completion_version", "capture_id"]
                : ["state"],
          },
        };
      },
    });
  }
}
