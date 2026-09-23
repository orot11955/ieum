import { performance } from "node:perf_hooks";
import type { Pool } from "pg";
import {
  measureExactCandidates,
  retrieveExactLexicalCandidates,
  runObserveJudgement,
} from "@ieum/core";
import {
  IdentityError,
  withActivePersonalWorkspace,
} from "../identity-service.js";
import { withWorkspaceTransaction } from "../platform/database/scope.js";
import type { OutboxJobRef } from "../platform/jobs/outbox.js";
import {
  buildJudgementSnapshot,
  JudgementSnapshotError,
} from "./snapshot-builder.js";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RequestRow {
  id: string;
  actor_id: string;
  unit_id: string;
  unit_revision: number;
  state: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";
}

async function mark(
  pool: Pool,
  workspaceId: string,
  requestId: string,
  state: RequestRow["state"],
  retryCount?: number,
): Promise<void> {
  await withWorkspaceTransaction(pool, workspaceId, async (client) => {
    await client.query(
      `UPDATE business.judgement_request SET state=$3,
         retry_count=COALESCE($4,retry_count)
       WHERE workspace_id=$1 AND id=$2 AND state NOT IN ('SUCCEEDED','CANCELED')`,
      [workspaceId, requestId, state, retryCount ?? null],
    );
  });
}

/** A retried job reads only its committed outbox/request pair and saves at most one run. */
export async function processJudgementJob(
  pool: Pool,
  ref: OutboxJobRef,
  retryCount = 0,
  signal?: AbortSignal,
): Promise<{ outcome: "SUCCEEDED" | "CANCELED"; inputHash?: string }> {
  if (!uuid.test(ref.workspaceId) || !uuid.test(ref.outboxId))
    throw new Error("INVALID_JOB_REF");
  const loaded = await withWorkspaceTransaction(
    pool,
    ref.workspaceId,
    async (client) => {
      const result = await client.query<RequestRow>(
        `SELECT q.id,q.actor_id,q.unit_id,q.unit_revision,q.state
       FROM business.command_outbox o JOIN business.judgement_request q
         ON q.workspace_id=o.workspace_id AND q.id=o.command_id
       WHERE o.workspace_id=$1 AND o.id=$2 AND o.event_type='judgement.requested'
         AND o.payload_ref->>'requestId'=q.id::text`,
        [ref.workspaceId, ref.outboxId],
      );
      return result.rows[0] ?? null;
    },
  );
  if (!loaded) return { outcome: "CANCELED" };
  if (loaded.state === "SUCCEEDED") {
    const previous = await withWorkspaceTransaction(
      pool,
      ref.workspaceId,
      (client) =>
        client.query<{ input_hash: string }>(
          "SELECT input_hash FROM business.judgement_run WHERE workspace_id=$1 AND request_id=$2",
          [ref.workspaceId, loaded.id],
        ),
    );
    return {
      outcome: "SUCCEEDED",
      ...(previous.rows[0] ? { inputHash: previous.rows[0].input_hash } : {}),
    };
  }
  if (loaded.state === "CANCELED" || loaded.state === "FAILED")
    return { outcome: "CANCELED" };
  if (signal?.aborted) {
    await mark(pool, ref.workspaceId, loaded.id, "CANCELED");
    return { outcome: "CANCELED" };
  }
  try {
    await withActivePersonalWorkspace(
      pool,
      loaded.actor_id,
      async (client, access) => {
        if (access.workspaceId !== ref.workspaceId)
          throw new JudgementSnapshotError("QUERY_UNAVAILABLE");
        await client.query(
          `UPDATE business.judgement_request SET state='RUNNING',retry_count=$3
         WHERE workspace_id=$1 AND id=$2 AND state IN ('QUEUED','RUNNING')`,
          [ref.workspaceId, loaded.id, retryCount],
        );
      },
    );
    const start = performance.now();
    const built = await buildJudgementSnapshot(
      pool,
      loaded.actor_id,
      ref.workspaceId,
      loaded.unit_id,
      loaded.unit_revision,
    );
    const snapshotMs = performance.now() - start;
    const retrievalStart = performance.now();
    const retrieval = retrieveExactLexicalCandidates(built.snapshot);
    const measurements = measureExactCandidates(built.snapshot, retrieval);
    const retrievalMs = performance.now() - retrievalStart;
    const judgementStart = performance.now();
    const result = runObserveJudgement(built.snapshot, retrieval, measurements);
    const judgementMs = performance.now() - judgementStart;
    if (signal?.aborted) {
      await mark(pool, ref.workspaceId, loaded.id, "CANCELED");
      return { outcome: "CANCELED" };
    }
    return await withActivePersonalWorkspace(
      pool,
      loaded.actor_id,
      async (client, access) => {
        if (access.workspaceId !== ref.workspaceId)
          throw new JudgementSnapshotError("QUERY_UNAVAILABLE");
        const current = await client.query<{ id: string }>(
          `SELECT u.id FROM business.thought_unit u JOIN business.capture c
             ON c.workspace_id=u.workspace_id AND c.id=u.capture_id
           WHERE u.workspace_id=$1 AND u.id=$2 AND u.current_revision=$3
             AND u.state='ACTIVE' AND c.state='ACTIVE' FOR SHARE OF u,c`,
          [ref.workspaceId, loaded.unit_id, loaded.unit_revision],
        );
        const expectedContexts = built.snapshot.manifest.eligibleContexts;
        const currentContexts = await client.query<{
          id: string;
          identity_revision: number;
          membership_revision: number;
          state: string;
        }>(
          `SELECT id,identity_revision,membership_revision,state FROM business.context
           WHERE workspace_id=$1 AND id=ANY($2::uuid[]) FOR SHARE`,
          [ref.workspaceId, expectedContexts.map((item) => item.contextId)],
        );
        const contextById = new Map(
          currentContexts.rows.map((row) => [row.id, row]),
        );
        const contextsStable = expectedContexts.every((expected) => {
          const row = contextById.get(expected.contextId);
          return (
            row?.state === "ACTIVE" &&
            row.identity_revision === expected.identityRevision &&
            row.membership_revision === expected.membershipRevision
          );
        });
        const expectedUnits = built.snapshot.manifest.eligibleUnits;
        const currentUnits = await client.query<{
          id: string;
          current_revision: number;
          state: string;
          capture_state: string;
        }>(
          `SELECT u.id,u.current_revision,u.state,c.state AS capture_state
           FROM business.thought_unit u JOIN business.capture c
             ON c.workspace_id=u.workspace_id AND c.id=u.capture_id
           WHERE u.workspace_id=$1 AND u.id=ANY($2::uuid[]) FOR SHARE OF u,c`,
          [ref.workspaceId, expectedUnits.map((item) => item.unitId)],
        );
        const unitById = new Map(currentUnits.rows.map((row) => [row.id, row]));
        const unitsStable = expectedUnits.every((expected) => {
          const row = unitById.get(expected.unitId);
          return (
            row?.state === "ACTIVE" &&
            row.capture_state === "ACTIVE" &&
            row.current_revision === expected.revision
          );
        });
        if (
          !current.rows[0] ||
          !contextsStable ||
          !unitsStable ||
          signal?.aborted
        ) {
          await client.query(
            `UPDATE business.judgement_request SET state='CANCELED'
             WHERE workspace_id=$1 AND id=$2 AND state IN ('QUEUED','RUNNING')`,
            [ref.workspaceId, loaded.id],
          );
          return { outcome: "CANCELED" as const };
        }
        const transition = await client.query<{ id: string }>(
          `UPDATE business.judgement_request SET state='SUCCEEDED'
           WHERE workspace_id=$1 AND id=$2 AND state IN ('QUEUED','RUNNING')
           RETURNING id`,
          [ref.workspaceId, loaded.id],
        );
        if (!transition.rows[0]) return { outcome: "CANCELED" as const };
        await client.query(
          `INSERT INTO business.judgement_run
           (request_id,workspace_id,input_hash,raw_snapshot,retrieval,measurements,result,stage_latency,profile_state)
           VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9)
           ON CONFLICT (request_id) DO NOTHING`,
          [
            loaded.id,
            ref.workspaceId,
            built.inputHash,
            JSON.stringify(built.raw),
            JSON.stringify(retrieval),
            JSON.stringify([...measurements]),
            JSON.stringify(result),
            JSON.stringify({ snapshotMs, retrievalMs, judgementMs }),
            built.profileState,
          ],
        );
        return { outcome: "SUCCEEDED" as const, inputHash: built.inputHash };
      },
    );
  } catch (error) {
    if (
      (error instanceof IdentityError && error.code === "ACCESS_DENIED") ||
      (error instanceof JudgementSnapshotError &&
        error.code === "QUERY_UNAVAILABLE")
    ) {
      await mark(pool, ref.workspaceId, loaded.id, "CANCELED");
      return { outcome: "CANCELED" };
    }
    throw error;
  }
}

export async function recordJudgementFailure(
  pool: Pool,
  ref: OutboxJobRef,
  retryCount: number,
  retryLimit: number,
): Promise<void> {
  if (!uuid.test(ref.workspaceId) || !uuid.test(ref.outboxId)) return;
  await withWorkspaceTransaction(pool, ref.workspaceId, async (client) => {
    await client.query(
      `UPDATE business.judgement_request q SET
         state=CASE WHEN $3 >= $4 THEN 'FAILED' ELSE 'QUEUED' END,
         retry_count=$3
       FROM business.command_outbox o
       WHERE o.workspace_id=q.workspace_id AND o.command_id=q.id
         AND o.workspace_id=$1 AND o.id=$2 AND o.event_type='judgement.requested'
         AND q.state NOT IN ('SUCCEEDED','CANCELED')`,
      [ref.workspaceId, ref.outboxId, retryCount + 1, retryLimit + 1],
    );
  });
}
