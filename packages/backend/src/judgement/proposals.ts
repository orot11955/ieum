import type { Pool, PoolClient } from "pg";
import type { ObserveJudgement } from "@ieum/core";
import type {
  CommandCoordinator,
  CommandOutcome,
} from "../command-coordinator.js";
import { withActivePersonalWorkspace } from "../identity-service.js";
import { hashSnapshotInput } from "./snapshot-builder.js";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type ProposalRole = "PRIMARY" | "SECONDARY" | "BACKGROUND";
export type ProposalState =
  "PENDING" | "ACCEPTED" | "REJECTED" | "DISMISSED" | "EXPIRED" | "SUPERSEDED";
export type ProposalDecision = "ACCEPTED" | "REJECTED" | "DISMISSED";

export class ProposalError extends Error {
  constructor(
    public readonly code:
      | "INVALID_PROPOSAL"
      | "PROPOSAL_NOT_FOUND"
      | "CANDIDATE_UNAVAILABLE"
      | "ALREADY_LINKED"
      | "NOT_EXPOSED"
      | "PROPOSAL_CLOSED"
      | "OPERATIONS_MISMATCH"
      | "STALE_PROPOSAL",
  ) {
    super(code);
  }
}

interface Member {
  contextId: string;
  role: ProposalRole;
}
interface ContextVersion {
  contextId: string;
  identityRevision: number;
  membershipRevision: number;
}
export interface ProposalOperations {
  unitId: string;
  unitRevision: number;
  source: {
    captureId: string;
    captureRevision: number;
    currentCaptureRevision: number;
    captureVersion: number;
  };
  baseMembershipVersion: number;
  before: Member[];
  after: Member[];
  contexts: ContextVersion[];
}
interface ProposalRow {
  id: string;
  actor_id: string;
  run_request_id: string;
  unit_id: string;
  unit_revision: number;
  context_id: string;
  role: ProposalRole;
  operations: ProposalOperations;
  operations_hash: string;
  state: ProposalState;
  expires_at: Date;
}
interface UnitRow {
  current_revision: number;
  membership_version: number;
  state: string;
  capture_state: string;
  capture_id: string;
  capture_revision: number;
  capture_current_revision: number;
  capture_version: number;
}

function validRef(value: string): boolean {
  return uuid.test(value);
}
function sortedMembers(rows: Member[]): Member[] {
  return [...rows].sort((a, b) => a.contextId.localeCompare(b.contextId));
}
function changedContexts(before: Member[], after: Member[]): string[] {
  const old = new Map(before.map((item) => [item.contextId, item.role]));
  const next = new Map(after.map((item) => [item.contextId, item.role]));
  return [...new Set([...old.keys(), ...next.keys()])]
    .filter((id) => old.get(id) !== next.get(id))
    .sort();
}
function currentState(row: ProposalRow): ProposalState {
  return row.state === "PENDING" && row.expires_at.getTime() <= Date.now()
    ? "EXPIRED"
    : row.state;
}
function audit(
  action: string,
  targetId: string,
  beforeVersion: number | null,
  afterVersion: number | null,
  requestId?: string,
) {
  return {
    action,
    targetType: "thought_unit",
    targetId,
    beforeVersion,
    afterVersion,
    changedFieldNames:
      action === "judgement.proposal.accept" ? ["memberships"] : [],
    ...(requestId ? { requestId } : {}),
  };
}

async function proposalRow(
  client: PoolClient,
  workspaceId: string,
  proposalId: string,
  actorId: string,
  lock = false,
): Promise<ProposalRow> {
  const found = await client.query<ProposalRow>(
    `SELECT id,actor_id,run_request_id,unit_id,unit_revision,context_id,role,
       operations,operations_hash,state,expires_at
     FROM business.judgement_proposal WHERE workspace_id=$1 AND id=$2 AND actor_id=$3
     ${lock ? "FOR UPDATE" : ""}`,
    [workspaceId, proposalId, actorId],
  );
  if (!found.rows[0]) throw new ProposalError("PROPOSAL_NOT_FOUND");
  return found.rows[0];
}

/** Observe candidates are read-only; a user explicitly chooses one before a proposal exists. */
export class ProposalService {
  constructor(
    private readonly pool: Pool,
    private readonly commands: CommandCoordinator,
  ) {}

  async candidates(actorId: string, workspaceId: string, requestId: string) {
    if (!validRef(workspaceId) || !validRef(requestId))
      throw new ProposalError("PROPOSAL_NOT_FOUND");
    return withActivePersonalWorkspace(
      this.pool,
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new ProposalError("PROPOSAL_NOT_FOUND");
        const found = await client.query<{
          unit_id: string;
          unit_revision: number;
          result: ObserveJudgement;
        }>(
          `SELECT q.unit_id,q.unit_revision,r.result FROM business.judgement_run r
         JOIN business.judgement_request q ON q.workspace_id=r.workspace_id AND q.id=r.request_id
         WHERE r.workspace_id=$1 AND r.request_id=$2 AND q.actor_id=$3 AND q.state='SUCCEEDED'`,
          [workspaceId, requestId, actorId],
        );
        const row = found.rows[0];
        if (!row) throw new ProposalError("PROPOSAL_NOT_FOUND");
        return {
          requestId,
          unitId: row.unit_id,
          unitRevision: row.unit_revision,
          candidates: row.result.candidates.map((item) => ({
            contextId: item.candidate.contextId,
            identityRevision: item.candidate.identityRevision,
            membershipRevision: item.candidate.membershipRevision,
            rank: item.rank,
            rankScore: item.score.rankScore,
            decision: item.decision.status,
            reasons: item.decision.reasons,
          })),
          truncated: row.result.retrieval.truncated,
        };
      },
    );
  }

  async create(input: {
    actorId: string;
    workspaceId: string;
    runRequestId: string;
    unitId: string;
    unitRevision: number;
    contextId: string;
    role: ProposalRole;
    idempotencyKey: string;
    requestId?: string;
  }): Promise<CommandOutcome> {
    if (
      !validRef(input.workspaceId) ||
      !validRef(input.runRequestId) ||
      !validRef(input.unitId) ||
      !validRef(input.contextId) ||
      !Number.isSafeInteger(input.unitRevision) ||
      input.unitRevision < 1 ||
      !["PRIMARY", "SECONDARY", "BACKGROUND"].includes(input.role)
    )
      throw new ProposalError("INVALID_PROPOSAL");
    return this.commands.execute({
      actorId: input.actorId,
      kind: "judgement.proposal.create",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        runRequestId: input.runRequestId,
        unitId: input.unitId,
        unitRevision: input.unitRevision,
        contextId: input.contextId,
        role: input.role,
      },
      apply: async (client, access, commandId) => {
        if (access.workspaceId !== input.workspaceId)
          throw new ProposalError("PROPOSAL_NOT_FOUND");
        const run = await client.query<{
          unit_id: string;
          unit_revision: number;
          result: ObserveJudgement;
        }>(
          `SELECT q.unit_id,q.unit_revision,r.result
           FROM business.judgement_run r JOIN business.judgement_request q
             ON q.workspace_id=r.workspace_id AND q.id=r.request_id
           WHERE r.workspace_id=$1 AND r.request_id=$2 AND q.actor_id=$3
             AND q.state='SUCCEEDED'`,
          [input.workspaceId, input.runRequestId, input.actorId],
        );
        const observed = run.rows[0];
        if (
          !observed ||
          observed.unit_id !== input.unitId ||
          observed.unit_revision !== input.unitRevision
        )
          throw new ProposalError("CANDIDATE_UNAVAILABLE");
        const selected = observed.result.candidates.find(
          (item) =>
            item.candidate.contextId === input.contextId &&
            item.decision.status === "candidate",
        );
        if (!selected) throw new ProposalError("CANDIDATE_UNAVAILABLE");
        const unit = await client.query<UnitRow>(
          `SELECT u.current_revision,u.membership_version,u.state,c.state AS capture_state,
             u.capture_id,u.capture_revision,c.current_revision AS capture_current_revision,
             c.version AS capture_version
           FROM business.thought_unit u JOIN business.capture c
             ON c.workspace_id=u.workspace_id AND c.id=u.capture_id
           WHERE u.workspace_id=$1 AND u.id=$2 FOR SHARE OF u,c`,
          [input.workspaceId, input.unitId],
        );
        if (
          unit.rows[0]?.state !== "ACTIVE" ||
          unit.rows[0]?.capture_state !== "ACTIVE" ||
          unit.rows[0]?.current_revision !== input.unitRevision
        )
          throw new ProposalError("STALE_PROPOSAL");
        const old = await client.query<{
          context_id: string;
          role: ProposalRole;
        }>(
          `SELECT context_id,role FROM business.context_membership
           WHERE workspace_id=$1 AND unit_id=$2 AND ended_at IS NULL ORDER BY context_id`,
          [input.workspaceId, input.unitId],
        );
        const before = sortedMembers(
          old.rows.map((row) => ({
            contextId: row.context_id,
            role: row.role,
          })),
        );
        const after = sortedMembers([
          ...before
            .filter((item) => item.contextId !== input.contextId)
            .map((item) => ({
              ...item,
              role:
                input.role === "PRIMARY" && item.role === "PRIMARY"
                  ? ("SECONDARY" as const)
                  : item.role,
            })),
          { contextId: input.contextId, role: input.role },
        ]);
        const changed = changedContexts(before, after);
        if (changed.length === 0) throw new ProposalError("ALREADY_LINKED");
        const contexts = await client.query<{
          id: string;
          identity_revision: number;
          membership_revision: number;
          state: string;
        }>(
          `SELECT id,identity_revision,membership_revision,state
           FROM business.context WHERE workspace_id=$1 AND id=ANY($2::uuid[])
           ORDER BY id FOR SHARE`,
          [input.workspaceId, changed],
        );
        if (
          contexts.rows.length !== changed.length ||
          contexts.rows.some((row) => row.state !== "ACTIVE") ||
          contexts.rows.find((row) => row.id === input.contextId)
            ?.identity_revision !== selected.candidate.identityRevision ||
          contexts.rows.find((row) => row.id === input.contextId)
            ?.membership_revision !== selected.candidate.membershipRevision
        )
          throw new ProposalError("STALE_PROPOSAL");
        const operations: ProposalOperations = {
          unitId: input.unitId,
          unitRevision: input.unitRevision,
          source: {
            captureId: unit.rows[0]!.capture_id,
            captureRevision: unit.rows[0]!.capture_revision,
            currentCaptureRevision: unit.rows[0]!.capture_current_revision,
            captureVersion: unit.rows[0]!.capture_version,
          },
          baseMembershipVersion: unit.rows[0]!.membership_version,
          before,
          after,
          contexts: contexts.rows.map((row) => ({
            contextId: row.id,
            identityRevision: row.identity_revision,
            membershipRevision: row.membership_revision,
          })),
        };
        const operationsHash = hashSnapshotInput(operations);
        await client.query(
          `INSERT INTO business.judgement_proposal
           (id,workspace_id,run_request_id,actor_id,unit_id,unit_revision,context_id,
            role,operations,operations_hash,expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,now()+interval '7 days')`,
          [
            commandId,
            input.workspaceId,
            input.runRequestId,
            input.actorId,
            input.unitId,
            input.unitRevision,
            input.contextId,
            input.role,
            JSON.stringify(operations),
            operationsHash,
          ],
        );
        return {
          response: { proposalId: commandId, state: "PENDING", operationsHash },
          audit: audit(
            "judgement.proposal.create",
            input.unitId,
            unit.rows[0]!.membership_version,
            unit.rows[0]!.membership_version,
            input.requestId,
          ),
        };
      },
    });
  }

  async get(actorId: string, workspaceId: string, proposalId: string) {
    if (!validRef(workspaceId) || !validRef(proposalId))
      throw new ProposalError("PROPOSAL_NOT_FOUND");
    return withActivePersonalWorkspace(
      this.pool,
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new ProposalError("PROPOSAL_NOT_FOUND");
        const row = await proposalRow(client, workspaceId, proposalId, actorId);
        const source = await client.query<{
          current_revision: number;
          state: string;
        }>(
          `SELECT current_revision,state FROM business.capture
           WHERE workspace_id=$1 AND id=$2`,
          [workspaceId, row.operations.source.captureId],
        );
        return {
          proposalId: row.id,
          runRequestId: row.run_request_id,
          unitId: row.unit_id,
          unitRevision: row.unit_revision,
          contextId: row.context_id,
          role: row.role,
          operations: row.operations,
          operationsHash: row.operations_hash,
          sourceStale:
            source.rows[0]?.state !== "ACTIVE" ||
            row.operations.source.captureRevision !==
              source.rows[0]?.current_revision,
          state: currentState(row),
          expiresAt: row.expires_at.toISOString(),
        };
      },
    );
  }

  async expose(input: {
    actorId: string;
    workspaceId: string;
    proposalId: string;
    idempotencyKey: string;
    requestId?: string;
  }): Promise<CommandOutcome> {
    if (!validRef(input.workspaceId) || !validRef(input.proposalId))
      throw new ProposalError("INVALID_PROPOSAL");
    return this.commands.execute({
      actorId: input.actorId,
      kind: "judgement.proposal.expose",
      idempotencyKey: input.idempotencyKey,
      payload: { workspaceId: input.workspaceId, proposalId: input.proposalId },
      apply: async (client, access, commandId) => {
        if (access.workspaceId !== input.workspaceId)
          throw new ProposalError("PROPOSAL_NOT_FOUND");
        const row = await proposalRow(
          client,
          input.workspaceId,
          input.proposalId,
          input.actorId,
          true,
        );
        if (currentState(row) !== "PENDING") {
          if (row.state === "PENDING") {
            await client.query(
              `UPDATE business.judgement_proposal SET state='EXPIRED',responded_at=now()
               WHERE workspace_id=$1 AND id=$2`,
              [input.workspaceId, row.id],
            );
            return {
              response: { proposalId: row.id, state: "EXPIRED" },
              audit: audit(
                "judgement.proposal.expire",
                row.unit_id,
                null,
                null,
                input.requestId,
              ),
            };
          }
          throw new ProposalError("PROPOSAL_CLOSED");
        }
        await client.query(
          `INSERT INTO business.judgement_exposure
           (id,workspace_id,proposal_id,actor_id) VALUES ($1,$2,$3,$4)`,
          [commandId, input.workspaceId, row.id, input.actorId],
        );
        return {
          response: {
            proposalId: row.id,
            exposureId: commandId,
            state: "PENDING",
          },
          audit: audit(
            "judgement.proposal.expose",
            row.unit_id,
            null,
            null,
            input.requestId,
          ),
        };
      },
    });
  }

  async decide(input: {
    actorId: string;
    workspaceId: string;
    proposalId: string;
    exposureId: string;
    operationsHash: string;
    decision: ProposalDecision;
    idempotencyKey: string;
    requestId?: string;
  }): Promise<CommandOutcome> {
    if (
      !validRef(input.workspaceId) ||
      !validRef(input.proposalId) ||
      !validRef(input.exposureId) ||
      !/^[a-f0-9]{64}$/.test(input.operationsHash) ||
      !["ACCEPTED", "REJECTED", "DISMISSED"].includes(input.decision)
    )
      throw new ProposalError("INVALID_PROPOSAL");
    return this.commands.execute({
      actorId: input.actorId,
      kind: `judgement.proposal.${input.decision.toLowerCase()}`,
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        proposalId: input.proposalId,
        exposureId: input.exposureId,
        operationsHash: input.operationsHash,
        decision: input.decision,
      },
      apply: async (client, access, commandId) => {
        if (access.workspaceId !== input.workspaceId)
          throw new ProposalError("PROPOSAL_NOT_FOUND");
        const preview = await proposalRow(
          client,
          input.workspaceId,
          input.proposalId,
          input.actorId,
        );
        let unit: UnitRow | undefined;
        let contexts: {
          id: string;
          identity_revision: number;
          membership_revision: number;
          state: string;
        }[] = [];
        if (input.decision === "ACCEPTED") {
          const lockedUnit = await client.query<UnitRow>(
            `SELECT u.current_revision,u.membership_version,u.state,c.state AS capture_state,
               u.capture_id,u.capture_revision,c.current_revision AS capture_current_revision,
               c.version AS capture_version
             FROM business.thought_unit u JOIN business.capture c
               ON c.workspace_id=u.workspace_id AND c.id=u.capture_id
             WHERE u.workspace_id=$1 AND u.id=$2 FOR UPDATE OF u FOR SHARE OF c`,
            [input.workspaceId, preview.unit_id],
          );
          unit = lockedUnit.rows[0];
          const ids = preview.operations.contexts.map((item) => item.contextId);
          const lockedContexts = await client.query<{
            id: string;
            identity_revision: number;
            membership_revision: number;
            state: string;
          }>(
            `SELECT id,identity_revision,membership_revision,state FROM business.context
             WHERE workspace_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE`,
            [input.workspaceId, ids],
          );
          contexts = lockedContexts.rows;
        }
        const row = await proposalRow(
          client,
          input.workspaceId,
          input.proposalId,
          input.actorId,
          true,
        );
        if (row.state !== "PENDING") throw new ProposalError("PROPOSAL_CLOSED");
        if (
          row.operations_hash !== input.operationsHash ||
          hashSnapshotInput(row.operations) !== row.operations_hash
        )
          throw new ProposalError("OPERATIONS_MISMATCH");
        if (currentState(row) === "EXPIRED") {
          await client.query(
            `UPDATE business.judgement_proposal SET state='EXPIRED',responded_at=now()
             WHERE workspace_id=$1 AND id=$2`,
            [input.workspaceId, row.id],
          );
          return {
            response: {
              proposalId: row.id,
              state: "EXPIRED",
              previewRequired: true,
            },
            audit: audit(
              "judgement.proposal.expire",
              row.unit_id,
              null,
              null,
              input.requestId,
            ),
          };
        }
        const exposure = await client.query<{ id: string }>(
          `SELECT id FROM business.judgement_exposure
           WHERE workspace_id=$1 AND id=$2 AND proposal_id=$3 AND actor_id=$4`,
          [input.workspaceId, input.exposureId, row.id, input.actorId],
        );
        if (!exposure.rows[0]) throw new ProposalError("NOT_EXPOSED");
        if (input.decision === "ACCEPTED") {
          const expected = row.operations;
          const active = await client.query<{
            context_id: string;
            role: ProposalRole;
          }>(
            `SELECT context_id,role FROM business.context_membership
             WHERE workspace_id=$1 AND unit_id=$2 AND ended_at IS NULL
             ORDER BY context_id FOR UPDATE`,
            [input.workspaceId, row.unit_id],
          );
          const before = sortedMembers(
            active.rows.map((item) => ({
              contextId: item.context_id,
              role: item.role,
            })),
          );
          const byId = new Map(contexts.map((item) => [item.id, item]));
          const stable =
            unit?.state === "ACTIVE" &&
            unit.capture_state === "ACTIVE" &&
            unit.current_revision === expected.unitRevision &&
            unit.capture_id === expected.source.captureId &&
            unit.capture_revision === expected.source.captureRevision &&
            unit.capture_current_revision ===
              expected.source.currentCaptureRevision &&
            unit.capture_version === expected.source.captureVersion &&
            unit.membership_version === expected.baseMembershipVersion &&
            hashSnapshotInput(before) === hashSnapshotInput(expected.before) &&
            expected.contexts.every((item) => {
              const now = byId.get(item.contextId);
              return (
                now?.state === "ACTIVE" &&
                now.identity_revision === item.identityRevision &&
                now.membership_revision === item.membershipRevision
              );
            });
          if (!stable) {
            await client.query(
              `UPDATE business.judgement_proposal SET state='SUPERSEDED',responded_at=now()
               WHERE workspace_id=$1 AND id=$2`,
              [input.workspaceId, row.id],
            );
            return {
              response: {
                proposalId: row.id,
                state: "SUPERSEDED",
                previewRequired: true,
              },
              audit: audit(
                "judgement.proposal.supersede",
                row.unit_id,
                null,
                null,
                input.requestId,
              ),
            };
          }
          const changed = changedContexts(expected.before, expected.after);
          await client.query(
            `UPDATE business.context_membership SET ended_at=now(),ended_reason='REPLACED'
             WHERE workspace_id=$1 AND unit_id=$2 AND ended_at IS NULL
               AND context_id=ANY($3::uuid[])`,
            [input.workspaceId, row.unit_id, changed],
          );
          for (const member of expected.after.filter((item) =>
            changed.includes(item.contextId),
          )) {
            await client.query(
              `INSERT INTO business.context_membership
               (workspace_id,unit_id,unit_revision,context_id,role)
               VALUES ($1,$2,$3,$4,$5)`,
              [
                input.workspaceId,
                row.unit_id,
                row.unit_revision,
                member.contextId,
                member.role,
              ],
            );
          }
          await client.query(
            `UPDATE business.context SET membership_revision=membership_revision+1,updated_at=now()
             WHERE workspace_id=$1 AND id=ANY($2::uuid[])`,
            [input.workspaceId, changed],
          );
          await client.query(
            `UPDATE business.thought_unit SET membership_version=membership_version+1
             WHERE workspace_id=$1 AND id=$2`,
            [input.workspaceId, row.unit_id],
          );
          await this.recordDecision(client, input, row, commandId);
          return {
            response: {
              proposalId: row.id,
              state: "ACCEPTED",
              unitId: row.unit_id,
              membershipVersion: expected.baseMembershipVersion + 1,
              memberships: expected.after,
            },
            audit: audit(
              "judgement.proposal.accept",
              row.unit_id,
              expected.baseMembershipVersion,
              expected.baseMembershipVersion + 1,
              input.requestId,
            ),
            outbox: [
              {
                eventType: "context.membership.changed",
                payloadRef: { unitId: row.unit_id, contextIds: changed },
              },
            ],
          };
        }
        await this.recordDecision(client, input, row, commandId);
        return {
          response: { proposalId: row.id, state: input.decision },
          audit: audit(
            `judgement.proposal.${input.decision.toLowerCase()}`,
            row.unit_id,
            null,
            null,
            input.requestId,
          ),
        };
      },
    });
  }

  private async recordDecision(
    client: PoolClient,
    input: {
      workspaceId: string;
      actorId: string;
      proposalId: string;
      exposureId: string;
      decision: ProposalDecision;
    },
    row: ProposalRow,
    commandId: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO business.judgement_feedback
       (id,workspace_id,proposal_id,exposure_id,actor_id,kind)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        commandId,
        input.workspaceId,
        row.id,
        input.exposureId,
        input.actorId,
        input.decision,
      ],
    );
    await client.query(
      `UPDATE business.judgement_proposal SET state=$3,responded_at=now()
       WHERE workspace_id=$1 AND id=$2`,
      [input.workspaceId, row.id, input.decision],
    );
  }
}
