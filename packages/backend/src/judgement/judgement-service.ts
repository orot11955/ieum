import type { Pool } from "pg";
import { runObserveJudgement, validateSnapshot } from "@ieum/core";
import type { CandidateMeasurements, RetrievalResult } from "@ieum/core";
import type { CommandCoordinator } from "../command-coordinator.js";
import { withActivePersonalWorkspace } from "../identity-service.js";
import { hashSnapshotInput } from "./snapshot-builder.js";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class JudgementError extends Error {
  constructor(
    public readonly code:
      "INVALID_REQUEST" | "QUERY_UNAVAILABLE" | "REQUEST_NOT_FOUND",
  ) {
    super(code);
  }
}

export interface JudgementRequestInput {
  actorId: string;
  workspaceId: string;
  unitId: string;
  unitRevision: number;
  idempotencyKey: string;
  requestId?: string;
}

export interface JudgementStatus {
  requestId: string;
  state: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";
  retryCount: number;
  inputHash: string | null;
  profileState: "FRESH" | "LAGGING" | null;
  eligibleContextCount: number | null;
  returnedContextCount: number | null;
  truncated: boolean | null;
}

export class JudgementService {
  constructor(
    private readonly pool: Pool,
    private readonly commands: CommandCoordinator,
  ) {}

  async request(input: JudgementRequestInput) {
    if (
      !uuid.test(input.workspaceId) ||
      !uuid.test(input.unitId) ||
      !Number.isSafeInteger(input.unitRevision) ||
      input.unitRevision < 1
    )
      throw new JudgementError("INVALID_REQUEST");
    return this.commands.execute({
      actorId: input.actorId,
      kind: "judgement.request",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        unitId: input.unitId,
        unitRevision: input.unitRevision,
      },
      apply: async (client, access, commandId) => {
        if (access.workspaceId !== input.workspaceId)
          throw new JudgementError("QUERY_UNAVAILABLE");
        const source = await client.query<{ id: string }>(
          `SELECT u.id FROM business.thought_unit u
           JOIN business.capture c ON c.workspace_id=u.workspace_id AND c.id=u.capture_id
           WHERE u.workspace_id=$1 AND u.id=$2 AND u.current_revision=$3
             AND u.state='ACTIVE' AND c.state='ACTIVE' FOR SHARE OF u,c`,
          [input.workspaceId, input.unitId, input.unitRevision],
        );
        if (!source.rows[0]) throw new JudgementError("QUERY_UNAVAILABLE");
        await client.query(
          `INSERT INTO business.judgement_request
           (id,workspace_id,actor_id,unit_id,unit_revision) VALUES ($1,$2,$3,$4,$5)`,
          [
            commandId,
            access.workspaceId,
            input.actorId,
            input.unitId,
            input.unitRevision,
          ],
        );
        return {
          response: { requestId: commandId, state: "QUEUED" },
          audit: {
            action: "judgement.request",
            targetType: "thought_unit",
            targetId: input.unitId,
            beforeVersion: input.unitRevision,
            afterVersion: input.unitRevision,
            changedFieldNames: [],
            ...(input.requestId ? { requestId: input.requestId } : {}),
          },
          outbox: [
            {
              eventType: "judgement.requested",
              payloadRef: { requestId: commandId },
            },
          ],
        };
      },
    });
  }

  async status(
    actorId: string,
    workspaceId: string,
    requestId: string,
  ): Promise<JudgementStatus> {
    if (!uuid.test(workspaceId) || !uuid.test(requestId))
      throw new JudgementError("REQUEST_NOT_FOUND");
    return withActivePersonalWorkspace(
      this.pool,
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new JudgementError("REQUEST_NOT_FOUND");
        const result = await client.query<{
          id: string;
          state: JudgementStatus["state"];
          retry_count: number;
          input_hash: string | null;
          profile_state: JudgementStatus["profileState"];
          result: {
            retrieval?: {
              eligibleContextCount?: number;
              returnedContextCount?: number;
              truncated?: boolean;
            };
          } | null;
        }>(
          `SELECT q.id,q.state,q.retry_count,r.input_hash,r.profile_state,r.result
         FROM business.judgement_request q LEFT JOIN business.judgement_run r
           ON r.workspace_id=q.workspace_id AND r.request_id=q.id
         WHERE q.workspace_id=$1 AND q.id=$2 AND q.actor_id=$3`,
          [workspaceId, requestId, actorId],
        );
        const row = result.rows[0];
        if (!row) throw new JudgementError("REQUEST_NOT_FOUND");
        return {
          requestId: row.id,
          state: row.state,
          retryCount: row.retry_count,
          inputHash: row.input_hash,
          profileState: row.profile_state,
          eligibleContextCount:
            row.result?.retrieval?.eligibleContextCount ?? null,
          returnedContextCount:
            row.result?.retrieval?.returnedContextCount ?? null,
          truncated: row.result?.retrieval?.truncated ?? null,
        };
      },
    );
  }

  /** Replay only the stored feature inputs; no new DB search or provider call. */
  async replay(
    actorId: string,
    workspaceId: string,
    requestId: string,
  ): Promise<{ matches: boolean; inputHash: string }> {
    if (!uuid.test(workspaceId) || !uuid.test(requestId))
      throw new JudgementError("REQUEST_NOT_FOUND");
    return withActivePersonalWorkspace(
      this.pool,
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new JudgementError("REQUEST_NOT_FOUND");
        const found = await client.query<{
          input_hash: string;
          raw_snapshot: unknown;
          retrieval: RetrievalResult;
          measurements: [string, CandidateMeasurements][];
          result: unknown;
        }>(
          `SELECT r.input_hash,r.raw_snapshot,r.retrieval,r.measurements,r.result
         FROM business.judgement_run r JOIN business.judgement_request q
           ON q.workspace_id=r.workspace_id AND q.id=r.request_id
         WHERE r.workspace_id=$1 AND r.request_id=$2 AND q.actor_id=$3`,
          [workspaceId, requestId, actorId],
        );
        const row = found.rows[0];
        if (!row) throw new JudgementError("REQUEST_NOT_FOUND");
        if (hashSnapshotInput(row.raw_snapshot) !== row.input_hash)
          throw new Error("STORED_SNAPSHOT_HASH_MISMATCH");
        const snapshot = validateSnapshot(row.raw_snapshot, row.input_hash);
        const replayed = runObserveJudgement(
          snapshot,
          row.retrieval,
          new Map(row.measurements),
        );
        return {
          matches:
            hashSnapshotInput(JSON.parse(JSON.stringify(replayed))) ===
            hashSnapshotInput(row.result),
          inputHash: row.input_hash,
        };
      },
    );
  }
}
