import type { Pool, PoolClient } from "pg";
import type { PgBoss } from "pg-boss";
import {
  IdentityError,
  withActivePersonalWorkspace,
} from "../../identity-service.js";
import { withWorkspaceTransaction } from "../database/scope.js";

export const CONTEXT_MEMBERSHIP_QUEUE = "context-membership-invalidation";
export const JUDGEMENT_QUEUE = "judgement-run";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface OutboxJobRef {
  outboxId: string;
  workspaceId: string;
}
export type PublicJobState =
  "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "UNKNOWN";
export class JobNotFoundError extends Error {
  constructor() {
    super("JOB_NOT_FOUND");
  }
}
interface OutboxRow extends OutboxJobRef {
  command_id: string;
  event_type: string;
  payload_ref: unknown;
}
function validRef(value: unknown): value is OutboxJobRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "outboxId" in value &&
    typeof value.outboxId === "string" &&
    uuid.test(value.outboxId) &&
    "workspaceId" in value &&
    typeof value.workspaceId === "string" &&
    uuid.test(value.workspaceId)
  );
}
function contextIds(value: unknown): string[] {
  if (
    typeof value !== "object" ||
    value === null ||
    !("contextIds" in value) ||
    !Array.isArray(value.contextIds) ||
    value.contextIds.length < 1 ||
    value.contextIds.length > 1000 ||
    !value.contextIds.every((id) => typeof id === "string" && uuid.test(id))
  )
    throw new Error("INVALID_OUTBOX_PAYLOAD");
  return [...new Set(value.contextIds as string[])];
}

/** Refuse an admin, application, auth, or business-owner URL at the relay boundary. */
export async function assertJobRelayDatabaseRole(pool: Pool): Promise<void> {
  const result = await pool.query<{
    rolsuper: boolean;
    rolbypassrls: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolreplication: boolean;
    relay_member: boolean;
    app_member: boolean;
    auth_member: boolean;
    migrator_member: boolean;
    owns_business: boolean;
    owns_queue: boolean;
    auth_usage: boolean;
    can_set_dangerous_role: boolean;
  }>(`SELECT r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,
      pg_has_role(current_user,'ieum_job_relay','USAGE') AS relay_member,
      pg_has_role(current_user,'ieum_application','MEMBER') AS app_member,
      pg_has_role(current_user,'ieum_auth_runtime','MEMBER') AS auth_member,
      pg_has_role(current_user,'ieum_migrator','MEMBER') AS migrator_member,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='business' AND c.relkind='r' AND c.relowner=r.oid) AS owns_business,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='pgboss' AND c.relowner=r.oid) AS owns_queue,
      has_schema_privilege(current_user,'auth','USAGE') AS auth_usage,
      EXISTS (SELECT 1 FROM pg_roles target
        WHERE pg_has_role(current_user,target.oid,'SET')
          AND (target.rolsuper OR target.rolbypassrls OR target.rolcreatedb
            OR target.rolcreaterole OR target.rolreplication
            OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname IN ('business','pgboss') AND c.relowner=target.oid)))
        AS can_set_dangerous_role
      FROM pg_roles r WHERE r.rolname=current_user`);
  const role = result.rows[0];
  if (
    !role ||
    role.rolsuper ||
    role.rolbypassrls ||
    role.rolcreatedb ||
    role.rolcreaterole ||
    role.rolreplication ||
    !role.relay_member ||
    role.app_member ||
    role.auth_member ||
    role.migrator_member ||
    role.owns_business ||
    role.owns_queue ||
    role.auth_usage ||
    role.can_set_dangerous_role
  )
    throw new Error("Job relay database role is not isolated");
}

/** One relay pass. A global transaction advisory lock makes parallel relays safe without UPDATE on immutable outbox rows. */
export async function relayOutboxOnce(
  pool: Pool,
  boss: PgBoss,
  limit = 50,
): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("INVALID_RELAY_LIMIT");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('ieum.command_outbox.relay', 0))",
    );
    const pending = await client.query<
      OutboxRow & { id: string; workspace_id: string }
    >(
      `SELECT o.id,o.workspace_id,o.command_id,o.event_type,o.payload_ref
       FROM business.command_outbox o
       LEFT JOIN business.command_dispatch d ON d.outbox_id=o.id
       WHERE d.outbox_id IS NULL AND o.event_type IN ('context.membership.changed','judgement.requested')
       ORDER BY o.created_at,o.id LIMIT $1`,
      [limit],
    );
    for (const row of pending.rows) {
      const queue =
        row.event_type === "judgement.requested"
          ? JUDGEMENT_QUEUE
          : CONTEXT_MEMBERSHIP_QUEUE;
      const jobId = await boss.send(
        queue,
        { outboxId: row.id, workspaceId: row.workspace_id },
        {
          db: {
            executeSql: (text: string, values: unknown[]) =>
              client.query(text, values),
          },
          retryLimit: 3,
          retryDelay: 1,
          retryBackoff: true,
          expireInSeconds: 60,
        },
      );
      if (!jobId) throw new Error("QUEUE_SEND_REJECTED");
      await client.query(
        "INSERT INTO business.command_dispatch (outbox_id,workspace_id,job_id) VALUES ($1,$2,$3)",
        [row.id, row.workspace_id, jobId],
      );
    }
    await client.query("COMMIT");
    return pending.rows.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Registers the actual queue handler; each result is persisted by pg-boss. */
export async function registerContextMembershipWorker(
  boss: PgBoss,
  applicationPool: Pool,
): Promise<string> {
  return boss.work(
    CONTEXT_MEMBERSHIP_QUEUE,
    { batchSize: 1, perJobResults: true, pollingIntervalSeconds: 1 },
    async (jobs) => {
      const results = [];
      for (const job of jobs) {
        const outcome = await applyContextInvalidation(
          applicationPool,
          job.data,
          job.signal,
        );
        results.push({
          id: job.id,
          status: "completed" as const,
          output: outcome,
        });
      }
      return results;
    },
  );
}

async function loadOutbox(
  client: PoolClient,
  ref: OutboxJobRef,
): Promise<{ actorId: string; contextIds: string[] } | null> {
  const result = await client.query<OutboxRow & { actor_id: string }>(
    `SELECT o.command_id,o.event_type,o.payload_ref,r.actor_id
     FROM business.command_outbox o JOIN business.command_receipt r
       ON r.workspace_id=o.workspace_id AND r.command_id=o.command_id
     WHERE o.workspace_id=$1 AND o.id=$2`,
    [ref.workspaceId, ref.outboxId],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.event_type !== "context.membership.changed")
    throw new Error("UNSUPPORTED_OUTBOX_EVENT");
  return { actorId: row.actor_id, contextIds: contextIds(row.payload_ref) };
}

/** Applies the current membership watermark. A duplicate or late job cannot lower it. */
export async function applyContextInvalidation(
  pool: Pool,
  data: unknown,
  signal?: AbortSignal,
): Promise<{
  outcome: "SUCCEEDED" | "CANCELED_ACCESS" | "CANCELED_SOURCE" | "CANCELED_JOB";
  updated: number;
}> {
  if (!validRef(data)) throw new Error("INVALID_JOB_REF");
  if (signal?.aborted) return { outcome: "CANCELED_JOB", updated: 0 };
  const initial = await withWorkspaceTransaction(
    pool,
    data.workspaceId,
    (client) => loadOutbox(client, data),
  );
  if (!initial) return { outcome: "CANCELED_SOURCE", updated: 0 };
  try {
    return await withActivePersonalWorkspace(
      pool,
      initial.actorId,
      async (client, access) => {
        if (access.workspaceId !== data.workspaceId)
          return { outcome: "CANCELED_ACCESS" as const, updated: 0 };
        const current = await loadOutbox(client, data);
        if (!current)
          return { outcome: "CANCELED_SOURCE" as const, updated: 0 };
        const contexts = await client.query<{
          id: string;
          membership_revision: number;
        }>(
          "SELECT id,membership_revision FROM business.context WHERE workspace_id=$1 AND id=ANY($2::uuid[]) FOR SHARE",
          [data.workspaceId, current.contextIds],
        );
        if (contexts.rows.length !== current.contextIds.length)
          return { outcome: "CANCELED_SOURCE" as const, updated: 0 };
        if (signal?.aborted)
          return { outcome: "CANCELED_JOB" as const, updated: 0 };
        let updated = 0;
        for (const context of contexts.rows) {
          if (signal?.aborted) throw new JobAbortedError();
          const result = await client.query(
            `INSERT INTO business.context_profile_invalidation (workspace_id,context_id,membership_revision,last_outbox_id)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (workspace_id,context_id) DO UPDATE SET
             membership_revision=EXCLUDED.membership_revision,
             last_outbox_id=EXCLUDED.last_outbox_id,recorded_at=now()
           WHERE business.context_profile_invalidation.membership_revision < EXCLUDED.membership_revision`,
            [
              data.workspaceId,
              context.id,
              context.membership_revision,
              data.outboxId,
            ],
          );
          updated += result.rowCount ?? 0;
        }
        if (signal?.aborted) throw new JobAbortedError();
        return { outcome: "SUCCEEDED" as const, updated };
      },
    );
  } catch (error) {
    if (error instanceof JobAbortedError)
      return { outcome: "CANCELED_JOB", updated: 0 };
    if (error instanceof IdentityError && error.code === "ACCESS_DENIED")
      return { outcome: "CANCELED_ACCESS", updated: 0 };
    throw error;
  }
}

class JobAbortedError extends Error {}

/** A caller must present an active personal workspace; queue tables remain inaccessible to the application role. */
export async function getOutboxJobState(
  pool: Pool,
  boss: PgBoss,
  actorId: string,
  workspaceId: string,
  outboxId: string,
): Promise<{ state: PublicJobState; retryCount: number | null }> {
  if (!uuid.test(outboxId) || !uuid.test(workspaceId))
    throw new JobNotFoundError();
  const jobId = await withActivePersonalWorkspace(
    pool,
    actorId,
    async (client, access) => {
      if (access.workspaceId !== workspaceId) throw new JobNotFoundError();
      const result = await client.query<{
        outbox_id: string;
        job_id: string | null;
      }>(
        `SELECT o.id AS outbox_id,d.job_id FROM business.command_outbox o
       LEFT JOIN business.command_dispatch d ON d.outbox_id=o.id
       WHERE o.workspace_id=$1 AND o.id=$2 AND o.event_type='context.membership.changed'`,
        [workspaceId, outboxId],
      );
      if (!result.rows[0]) throw new JobNotFoundError();
      return result.rows[0].job_id;
    },
  );
  if (!jobId) return { state: "QUEUED", retryCount: 0 };
  const job = await boss.getJobById<{ outboxId: string }>(
    CONTEXT_MEMBERSHIP_QUEUE,
    jobId,
  );
  if (!job) return { state: "UNKNOWN", retryCount: null };
  const outcome =
    typeof job.output === "object" &&
    job.output !== null &&
    "outcome" in job.output
      ? job.output.outcome
      : undefined;
  const state: PublicJobState =
    job.state === "active"
      ? "RUNNING"
      : job.state === "created" || job.state === "retry"
        ? "QUEUED"
        : job.state === "failed"
          ? "FAILED"
          : job.state === "cancelled" ||
              outcome === "CANCELED_ACCESS" ||
              outcome === "CANCELED_SOURCE" ||
              outcome === "CANCELED_JOB"
            ? "CANCELED"
            : job.state === "completed"
              ? "SUCCEEDED"
              : "UNKNOWN";
  return { state, retryCount: job.retryCount };
}
