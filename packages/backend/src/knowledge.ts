import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { CommandCoordinator, CommandError } from "./command-coordinator.js";
import type { CommandOutcome } from "./command-coordinator.js";
import { IdentityService } from "./identity-service.js";

export type ContextKind = "TOPIC" | "FLOW" | "PROJECT" | "COLLECTION";
export type ContextState = "ACTIVE" | "ARCHIVED" | "SUPERSEDED";
export type MembershipRole = "PRIMARY" | "SECONDARY" | "BACKGROUND";
export type ContextRelationType = "PARENT_OF" | "RELATED_TO";
export type ThoughtRelationType =
  "SUPPORTS" | "CONTRADICTS" | "REFINES" | "RESULT_OF" | "RELATED_TO";
export type KnowledgeErrorCode =
  | "CONTEXT_NOT_FOUND"
  | "UNIT_NOT_FOUND"
  | "CONTEXT_INACTIVE"
  | "RELATION_DUPLICATE"
  | "RELATION_NOT_FOUND"
  | "PARENT_CYCLE"
  | "MEMBERSHIP_DUPLICATE";
export class KnowledgeError extends Error {
  constructor(public readonly code: KnowledgeErrorCode) {
    super(code);
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uuid(value: string): void {
  if (!uuidPattern.test(value)) throw new CommandError("INVALID_COMMAND");
}
function positive(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new CommandError("INVALID_COMMAND");
}
function prose(value: string, max: number): string {
  if (value.trim().length < 1 || value.length > max || value.includes("\u0000"))
    throw new CommandError("INVALID_COMMAND");
  return value.trim();
}
function audit(
  action: string,
  targetType: string,
  targetId: string,
  beforeVersion: number | null,
  afterVersion: number | null,
  fields: string[],
  requestId?: string,
) {
  return {
    action,
    targetType,
    targetId,
    beforeVersion,
    afterVersion,
    changedFieldNames: fields,
    ...(requestId ? { requestId } : {}),
  };
}
function sameWorkspace(actual: string, expected: string): void {
  if (actual !== expected) throw new KnowledgeError("CONTEXT_NOT_FOUND");
}
function pgConstraint(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "constraint" in error &&
    typeof error.constraint === "string"
    ? error.constraint
    : undefined;
}

interface ContextRow {
  id: string;
  name: string;
  purpose: string;
  scope: string;
  kind: ContextKind;
  state: ContextState;
  superseded_by_id: string | null;
  identity_revision: number;
  membership_revision: number;
  created_at: Date;
  updated_at: Date;
}
interface UnitRow {
  current_revision: number;
  membership_version: number;
  state: string;
}
export interface MembershipInput {
  contextId: string;
  role: MembershipRole;
}

export class KnowledgeService {
  constructor(
    private readonly identity: IdentityService,
    private readonly commands: CommandCoordinator,
  ) {}

  async create(input: {
    actorId: string;
    workspaceId: string;
    idempotencyKey: string;
    name: string;
    purpose: string;
    scope: string;
    kind: ContextKind;
    requestId?: string;
  }): Promise<CommandOutcome> {
    const name = prose(input.name, 200),
      purpose = prose(input.purpose, 2000),
      scope = prose(input.scope, 2000);
    if (!["TOPIC", "FLOW", "PROJECT", "COLLECTION"].includes(input.kind))
      throw new CommandError("INVALID_COMMAND");
    return this.commands.execute({
      actorId: input.actorId,
      kind: "context.create",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        name,
        purpose,
        scope,
        kind: input.kind,
      },
      apply: async (client, access) => {
        sameWorkspace(access.workspaceId, input.workspaceId);
        const id = randomUUID();
        await client.query(
          "INSERT INTO business.context (id, workspace_id, name, purpose, scope, kind) VALUES ($1,$2,$3,$4,$5,$6)",
          [id, access.workspaceId, name, purpose, scope, input.kind],
        );
        await client.query(
          "INSERT INTO business.context_identity_revision (workspace_id, context_id, revision, name, purpose, scope, kind, state) VALUES ($1,$2,1,$3,$4,$5,$6,'ACTIVE')",
          [access.workspaceId, id, name, purpose, scope, input.kind],
        );
        return {
          response: {
            id,
            identityRevision: 1,
            membershipRevision: 1,
            state: "ACTIVE",
          },
          audit: audit(
            "context.create",
            "context",
            id,
            null,
            1,
            ["name", "purpose", "scope", "kind"],
            input.requestId,
          ),
        };
      },
    });
  }

  async changeIdentity(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    baseRevision: number;
    name?: string | undefined;
    purpose?: string | undefined;
    scope?: string | undefined;
    kind?: ContextKind | undefined;
    state?: "ARCHIVED" | "SUPERSEDED" | undefined;
    supersededById?: string | undefined;
    requestId?: string;
  }): Promise<CommandOutcome> {
    uuid(input.id);
    positive(input.baseRevision);
    if (input.supersededById) uuid(input.supersededById);
    if (
      input.state === "SUPERSEDED"
        ? !input.supersededById
        : input.supersededById !== undefined
    )
      throw new CommandError("INVALID_COMMAND");
    if (
      input.state === undefined &&
      input.name === undefined &&
      input.purpose === undefined &&
      input.scope === undefined &&
      input.kind === undefined
    )
      throw new CommandError("INVALID_COMMAND");
    const name = input.name === undefined ? undefined : prose(input.name, 200);
    const purpose =
      input.purpose === undefined ? undefined : prose(input.purpose, 2000);
    const scope =
      input.scope === undefined ? undefined : prose(input.scope, 2000);
    if (
      input.kind !== undefined &&
      !["TOPIC", "FLOW", "PROJECT", "COLLECTION"].includes(input.kind)
    )
      throw new CommandError("INVALID_COMMAND");
    return this.commands.execute({
      actorId: input.actorId,
      kind: "context.change_identity",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        id: input.id,
        baseRevision: input.baseRevision,
        name: name ?? null,
        purpose: purpose ?? null,
        scope: scope ?? null,
        kind: input.kind ?? null,
        state: input.state ?? null,
        supersededById: input.supersededById ?? null,
      },
      apply: async (client, access) => {
        sameWorkspace(access.workspaceId, input.workspaceId);
        const current = await this.lockContext(
          client,
          access.workspaceId,
          input.id,
        );
        if (current.identity_revision !== input.baseRevision)
          throw new CommandError("VERSION_CONFLICT", current.identity_revision);
        if (current.state !== "ACTIVE")
          throw new KnowledgeError("CONTEXT_INACTIVE");
        if (input.supersededById) {
          const target = await client.query<{ state: string }>(
            "SELECT state FROM business.context WHERE workspace_id=$1 AND id=$2 FOR SHARE",
            [access.workspaceId, input.supersededById],
          );
          if (
            input.supersededById === input.id ||
            target.rows[0]?.state !== "ACTIVE"
          )
            throw new KnowledgeError("CONTEXT_NOT_FOUND");
        }
        const next = {
          name: name ?? current.name,
          purpose: purpose ?? current.purpose,
          scope: scope ?? current.scope,
          kind: input.kind ?? current.kind,
          state: input.state ?? current.state,
          supersededById: input.supersededById ?? null,
        };
        const revision = current.identity_revision + 1;
        await client.query(
          "UPDATE business.context SET name=$3,purpose=$4,scope=$5,kind=$6,state=$7,superseded_by_id=$8,identity_revision=$9,updated_at=now() WHERE workspace_id=$1 AND id=$2",
          [
            access.workspaceId,
            input.id,
            next.name,
            next.purpose,
            next.scope,
            next.kind,
            next.state,
            next.supersededById,
            revision,
          ],
        );
        await client.query(
          "INSERT INTO business.context_identity_revision (workspace_id,context_id,revision,name,purpose,scope,kind,state,superseded_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            access.workspaceId,
            input.id,
            revision,
            next.name,
            next.purpose,
            next.scope,
            next.kind,
            next.state,
            next.supersededById,
          ],
        );
        const fields = [
          input.name !== undefined ? "name" : null,
          input.purpose !== undefined ? "purpose" : null,
          input.scope !== undefined ? "scope" : null,
          input.kind !== undefined ? "kind" : null,
          input.state !== undefined ? "state" : null,
          input.supersededById !== undefined ? "superseded_by_id" : null,
        ].filter((field): field is string => field !== null);
        return {
          response: {
            id: input.id,
            identityRevision: revision,
            membershipRevision: current.membership_revision,
            state: next.state,
          },
          audit: audit(
            "context.change_identity",
            "context",
            input.id,
            current.identity_revision,
            revision,
            fields,
            input.requestId,
          ),
        };
      },
    });
  }

  async setMemberships(input: {
    actorId: string;
    workspaceId: string;
    unitId: string;
    idempotencyKey: string;
    baseVersion: number;
    memberships: MembershipInput[];
    requestId?: string;
  }): Promise<CommandOutcome> {
    uuid(input.unitId);
    positive(input.baseVersion);
    if (
      input.memberships.length > 100 ||
      input.memberships.some(
        ({ contextId, role }) =>
          !uuidPattern.test(contextId) ||
          !["PRIMARY", "SECONDARY", "BACKGROUND"].includes(role),
      )
    )
      throw new CommandError("INVALID_COMMAND");
    if (
      new Set(input.memberships.map((m) => m.contextId)).size !==
        input.memberships.length ||
      input.memberships.filter((m) => m.role === "PRIMARY").length > 1
    )
      throw new KnowledgeError("MEMBERSHIP_DUPLICATE");
    const sorted = [...input.memberships].sort((a, b) =>
      a.contextId.localeCompare(b.contextId),
    );
    return this.commands.execute({
      actorId: input.actorId,
      kind: "context.set_memberships",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        unitId: input.unitId,
        baseVersion: input.baseVersion,
        memberships: sorted,
      },
      apply: async (client, access) => {
        sameWorkspace(access.workspaceId, input.workspaceId);
        const unitResult = await client.query<UnitRow>(
          "SELECT current_revision,membership_version,state FROM business.thought_unit WHERE workspace_id=$1 AND id=$2 FOR UPDATE",
          [access.workspaceId, input.unitId],
        );
        const unit = unitResult.rows[0];
        if (!unit || unit.state !== "ACTIVE")
          throw new KnowledgeError("UNIT_NOT_FOUND");
        if (unit.membership_version !== input.baseVersion)
          throw new CommandError("VERSION_CONFLICT", unit.membership_version);
        const old = await client.query<{
          context_id: string;
          role: MembershipRole;
        }>(
          "SELECT context_id,role FROM business.context_membership WHERE workspace_id=$1 AND unit_id=$2 AND ended_at IS NULL ORDER BY context_id",
          [access.workspaceId, input.unitId],
        );
        const oldMap = new Map(
          old.rows.map((row) => [row.context_id, row.role]),
        );
        const newMap = new Map(sorted.map((row) => [row.contextId, row.role]));
        const changed = [...new Set([...oldMap.keys(), ...newMap.keys()])]
          .filter((id) => oldMap.get(id) !== newMap.get(id))
          .sort();
        if (changed.length === 0)
          return {
            response: {
              unitId: input.unitId,
              membershipVersion: unit.membership_version,
              memberships: sorted,
            },
            audit: audit(
              "context.set_memberships",
              "thought_unit",
              input.unitId,
              unit.membership_version,
              unit.membership_version,
              [],
              input.requestId,
            ),
          };
        const contexts = await client.query<{ id: string; state: string }>(
          "SELECT id,state FROM business.context WHERE workspace_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE",
          [access.workspaceId, changed],
        );
        if (contexts.rows.length !== changed.length)
          throw new KnowledgeError("CONTEXT_NOT_FOUND");
        if (
          contexts.rows.some(
            (row) => newMap.has(row.id) && row.state !== "ACTIVE",
          )
        )
          throw new KnowledgeError("CONTEXT_INACTIVE");
        await client.query(
          "UPDATE business.context_membership SET ended_at=now(),ended_reason='REPLACED' WHERE workspace_id=$1 AND unit_id=$2 AND ended_at IS NULL AND context_id=ANY($3::uuid[])",
          [access.workspaceId, input.unitId, changed],
        );
        for (const membership of sorted.filter((row) =>
          changed.includes(row.contextId),
        )) {
          await client.query(
            "INSERT INTO business.context_membership (workspace_id,unit_id,unit_revision,context_id,role) VALUES ($1,$2,$3,$4,$5)",
            [
              access.workspaceId,
              input.unitId,
              unit.current_revision,
              membership.contextId,
              membership.role,
            ],
          );
        }
        await client.query(
          "UPDATE business.context SET membership_revision=membership_revision+1,updated_at=now() WHERE workspace_id=$1 AND id=ANY($2::uuid[])",
          [access.workspaceId, changed],
        );
        const version = unit.membership_version + 1;
        await client.query(
          "UPDATE business.thought_unit SET membership_version=$3 WHERE workspace_id=$1 AND id=$2",
          [access.workspaceId, input.unitId, version],
        );
        return {
          response: {
            unitId: input.unitId,
            membershipVersion: version,
            memberships: sorted,
          },
          audit: audit(
            "context.set_memberships",
            "thought_unit",
            input.unitId,
            unit.membership_version,
            version,
            ["memberships"],
            input.requestId,
          ),
          outbox: [
            {
              eventType: "context.membership.changed",
              payloadRef: { unitId: input.unitId, contextIds: changed },
            },
          ],
        };
      },
    });
  }

  async addContextRelation(input: {
    actorId: string;
    workspaceId: string;
    idempotencyKey: string;
    fromContextId: string;
    toContextId: string;
    type: ContextRelationType;
    requestId?: string;
  }): Promise<CommandOutcome> {
    uuid(input.fromContextId);
    uuid(input.toContextId);
    if (
      input.fromContextId === input.toContextId ||
      !["PARENT_OF", "RELATED_TO"].includes(input.type)
    )
      throw new CommandError("INVALID_COMMAND");
    const [from, to] =
      input.type === "RELATED_TO" && input.fromContextId > input.toContextId
        ? [input.toContextId, input.fromContextId]
        : [input.fromContextId, input.toContextId];
    try {
      return await this.commands.execute({
        actorId: input.actorId,
        kind: "context.add_relation",
        idempotencyKey: input.idempotencyKey,
        payload: { workspaceId: input.workspaceId, from, to, type: input.type },
        apply: async (client, access) => {
          sameWorkspace(access.workspaceId, input.workspaceId);
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 5808))",
            [access.workspaceId],
          );
          const result = await client.query<{ id: string; state: string }>(
            "SELECT id,state FROM business.context WHERE workspace_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE",
            [access.workspaceId, [from, to]],
          );
          if (result.rows.length !== 2)
            throw new KnowledgeError("CONTEXT_NOT_FOUND");
          if (result.rows.some((row) => row.state !== "ACTIVE"))
            throw new KnowledgeError("CONTEXT_INACTIVE");
          if (input.type === "PARENT_OF") {
            const cycle = await client.query(
              `WITH RECURSIVE descendants(id) AS (
            SELECT to_context_id FROM business.context_relation WHERE workspace_id=$1 AND from_context_id=$2 AND type='PARENT_OF' AND ended_at IS NULL
            UNION SELECT r.to_context_id FROM business.context_relation r JOIN descendants d ON r.from_context_id=d.id WHERE r.workspace_id=$1 AND r.type='PARENT_OF' AND r.ended_at IS NULL
          ) SELECT 1 FROM descendants WHERE id=$3 LIMIT 1`,
              [access.workspaceId, to, from],
            );
            if (cycle.rowCount) throw new KnowledgeError("PARENT_CYCLE");
          }
          const id = randomUUID();
          await client.query(
            "INSERT INTO business.context_relation (id,workspace_id,from_context_id,to_context_id,type,approved_by_id) VALUES ($1,$2,$3,$4,$5,$6)",
            [id, access.workspaceId, from, to, input.type, input.actorId],
          );
          return {
            response: {
              id,
              fromContextId: from,
              toContextId: to,
              type: input.type,
            },
            audit: audit(
              "context.add_relation",
              "context_relation",
              id,
              null,
              1,
              ["type", "direction"],
              input.requestId,
            ),
          };
        },
      });
    } catch (error) {
      if (pgConstraint(error) === "context_relation_active_unique")
        throw new KnowledgeError("RELATION_DUPLICATE");
      throw error;
    }
  }

  async addThoughtRelation(input: {
    actorId: string;
    workspaceId: string;
    idempotencyKey: string;
    fromUnitId: string;
    fromRevision: number;
    toUnitId: string;
    toRevision: number;
    type: ThoughtRelationType;
    requestId?: string;
  }): Promise<CommandOutcome> {
    uuid(input.fromUnitId);
    uuid(input.toUnitId);
    positive(input.fromRevision);
    positive(input.toRevision);
    if (
      (input.fromUnitId === input.toUnitId &&
        input.fromRevision === input.toRevision) ||
      ![
        "SUPPORTS",
        "CONTRADICTS",
        "REFINES",
        "RESULT_OF",
        "RELATED_TO",
      ].includes(input.type)
    )
      throw new CommandError("INVALID_COMMAND");
    const symmetric =
      input.type === "CONTRADICTS" || input.type === "RELATED_TO";
    const swap =
      symmetric &&
      (input.fromUnitId > input.toUnitId ||
        (input.fromUnitId === input.toUnitId &&
          input.fromRevision > input.toRevision));
    const [fromUnitId, fromRevision, toUnitId, toRevision] = swap
      ? ([
          input.toUnitId,
          input.toRevision,
          input.fromUnitId,
          input.fromRevision,
        ] as const)
      : ([
          input.fromUnitId,
          input.fromRevision,
          input.toUnitId,
          input.toRevision,
        ] as const);
    try {
      return await this.commands.execute({
        actorId: input.actorId,
        kind: "thought.add_relation",
        idempotencyKey: input.idempotencyKey,
        payload: {
          workspaceId: input.workspaceId,
          fromUnitId,
          fromRevision,
          toUnitId,
          toRevision,
          type: input.type,
        },
        apply: async (client, access) => {
          sameWorkspace(access.workspaceId, input.workspaceId);
          const units = await client.query<{
            unit_id: string;
            revision: number;
          }>(
            "SELECT r.unit_id,r.revision FROM business.thought_unit_revision r JOIN business.thought_unit u ON u.workspace_id=r.workspace_id AND u.id=r.unit_id WHERE r.workspace_id=$1 AND (r.unit_id,r.revision) IN (($2::uuid,$3::integer),($4::uuid,$5::integer)) AND u.state='ACTIVE' AND u.current_revision=r.revision",
            [
              access.workspaceId,
              fromUnitId,
              fromRevision,
              toUnitId,
              toRevision,
            ],
          );
          if (units.rows.length !== 2)
            throw new KnowledgeError("UNIT_NOT_FOUND");
          const id = randomUUID();
          await client.query(
            "INSERT INTO business.thought_relation (id,workspace_id,from_unit_id,from_revision,to_unit_id,to_revision,type,approved_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
            [
              id,
              access.workspaceId,
              fromUnitId,
              fromRevision,
              toUnitId,
              toRevision,
              input.type,
              input.actorId,
            ],
          );
          return {
            response: {
              id,
              fromUnitId,
              fromRevision,
              toUnitId,
              toRevision,
              type: input.type,
            },
            audit: audit(
              "thought.add_relation",
              "thought_relation",
              id,
              null,
              1,
              ["type", "direction"],
              input.requestId,
            ),
          };
        },
      });
    } catch (error) {
      if (pgConstraint(error) === "thought_relation_active_unique")
        throw new KnowledgeError("RELATION_DUPLICATE");
      throw error;
    }
  }

  async endContextRelation(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    requestId?: string;
  }): Promise<CommandOutcome> {
    return this.endRelation("context", input);
  }

  async endThoughtRelation(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    requestId?: string;
  }): Promise<CommandOutcome> {
    return this.endRelation("thought", input);
  }

  private async endRelation(
    kind: "context" | "thought",
    input: {
      actorId: string;
      workspaceId: string;
      id: string;
      idempotencyKey: string;
      requestId?: string;
    },
  ): Promise<CommandOutcome> {
    uuid(input.id);
    const table =
      kind === "context"
        ? "business.context_relation"
        : "business.thought_relation";
    return this.commands.execute({
      actorId: input.actorId,
      kind: `${kind}.end_relation`,
      idempotencyKey: input.idempotencyKey,
      payload: { workspaceId: input.workspaceId, id: input.id },
      apply: async (client, access) => {
        sameWorkspace(access.workspaceId, input.workspaceId);
        const row = await client.query<{ ended_at: Date | null }>(
          `SELECT ended_at FROM ${table} WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
          [access.workspaceId, input.id],
        );
        if (!row.rows[0]) throw new KnowledgeError("RELATION_NOT_FOUND");
        if (row.rows[0].ended_at)
          throw new KnowledgeError("RELATION_DUPLICATE");
        await client.query(
          `UPDATE ${table} SET ended_at=now() WHERE workspace_id=$1 AND id=$2`,
          [access.workspaceId, input.id],
        );
        return {
          response: { id: input.id, ended: true },
          audit: audit(
            `${kind}.end_relation`,
            `${kind}_relation`,
            input.id,
            1,
            2,
            ["ended_at"],
            input.requestId,
          ),
        };
      },
    });
  }

  async get(
    actorId: string,
    workspaceId: string,
    id: string,
    revision?: number,
  ) {
    uuid(id);
    if (revision !== undefined) positive(revision);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        sameWorkspace(access.workspaceId, workspaceId);
        const result = await client.query<ContextRow>(
          "SELECT id,name,purpose,scope,kind,state,superseded_by_id,identity_revision,membership_revision,created_at,updated_at FROM business.context WHERE workspace_id=$1 AND id=$2",
          [access.workspaceId, id],
        );
        const row = result.rows[0];
        if (!row) throw new KnowledgeError("CONTEXT_NOT_FOUND");
        const historical =
          revision === undefined
            ? null
            : (
                await client.query<{
                  name: string;
                  purpose: string;
                  scope: string;
                  kind: ContextKind;
                  state: ContextState;
                  superseded_by_id: string | null;
                  recorded_at: string;
                }>(
                  "SELECT name,purpose,scope,kind,state,superseded_by_id,recorded_at::text AS recorded_at FROM business.context_identity_revision WHERE workspace_id=$1 AND context_id=$2 AND revision=$3",
                  [access.workspaceId, id, revision],
                )
              ).rows[0];
        if (revision !== undefined && !historical)
          throw new KnowledgeError("CONTEXT_NOT_FOUND");
        const identity = historical ?? row;
        const asOf = historical?.recorded_at ?? null;
        const memberships = await client.query<{
          unit_id: string;
          unit_revision: number;
          role: MembershipRole;
        }>(
          `SELECT m.unit_id,m.unit_revision,m.role FROM business.context_membership m
           JOIN business.thought_unit u ON u.workspace_id=m.workspace_id AND u.id=m.unit_id
           WHERE m.workspace_id=$1 AND m.context_id=$2
             AND (($3::timestamptz IS NULL AND m.ended_at IS NULL AND u.state='ACTIVE')
               OR ($3::timestamptz IS NOT NULL AND m.started_at <= $3 AND (m.ended_at IS NULL OR m.ended_at > $3)))
           ORDER BY m.started_at DESC,m.id DESC`,
          [access.workspaceId, id, asOf],
        );
        const relations = await client.query<{
          id: string;
          from_context_id: string;
          to_context_id: string;
          type: ContextRelationType;
        }>(
          `SELECT id,from_context_id,to_context_id,type FROM business.context_relation
           WHERE workspace_id=$1 AND (from_context_id=$2 OR to_context_id=$2)
             AND (($3::timestamptz IS NULL AND ended_at IS NULL)
               OR ($3::timestamptz IS NOT NULL AND started_at <= $3 AND (ended_at IS NULL OR ended_at > $3)))
           ORDER BY started_at DESC,id DESC`,
          [access.workspaceId, id, asOf],
        );
        const successors = await client.query<{
          target_context_id: string;
          mutation_id: string;
        }>(
          `SELECT target_context_id,mutation_id FROM business.context_successor
           WHERE workspace_id=$1 AND source_context_id=$2
             AND (($3::timestamptz IS NULL AND ended_at IS NULL)
               OR ($3::timestamptz IS NOT NULL AND started_at <= $3 AND (ended_at IS NULL OR ended_at > $3)))
           ORDER BY started_at,id`,
          [access.workspaceId, id, asOf],
        );
        return {
          id,
          workspaceId,
          name: identity.name,
          purpose: identity.purpose,
          scope: identity.scope,
          kind: identity.kind,
          state: identity.state,
          supersededById: identity.superseded_by_id,
          identityRevision: revision ?? row.identity_revision,
          currentIdentityRevision: row.identity_revision,
          membershipRevision: row.membership_revision,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
          memberships: memberships.rows.map((m) => ({
            unitId: m.unit_id,
            unitRevision: m.unit_revision,
            role: m.role,
          })),
          relations: relations.rows.map((r) => ({
            id: r.id,
            fromContextId: r.from_context_id,
            toContextId: r.to_context_id,
            type: r.type,
          })),
          successors: successors.rows.map((r) => ({
            contextId: r.target_context_id,
            mutationId: r.mutation_id,
          })),
        };
      },
    );
  }

  async list(
    actorId: string,
    workspaceId: string,
    includeArchived = false,
    query?: string,
    cursor?: string,
    pageSize = 50,
  ) {
    if (query !== undefined && (query.length > 200 || query.includes("\u0000")))
      throw new CommandError("INVALID_COMMAND");
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100)
      throw new CommandError("INVALID_COMMAND");
    let cursorTime: string | null = null,
      cursorId: string | null = null;
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
        const time = new Date(parsed[0]);
        if (
          !Number.isFinite(time.getTime()) ||
          time.toISOString().slice(0, 19) !== parsed[0].slice(0, 19)
        )
          throw new Error("invalid cursor time");
        uuid(parsed[1]);
        cursorTime = parsed[0];
        cursorId = parsed[1];
      } catch {
        throw new CommandError("INVALID_COMMAND");
      }
    }
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        sameWorkspace(access.workspaceId, workspaceId);
        const result = await client.query<ContextRow & { cursor_time: string }>(
          `SELECT id,name,purpose,scope,kind,state,superseded_by_id,identity_revision,membership_revision,created_at,updated_at,
             to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
           FROM business.context WHERE workspace_id=$1 AND ($2::boolean OR state='ACTIVE')
             AND ($3::text IS NULL OR strpos(lower(name),lower($3)) > 0)
             AND ($4::timestamptz IS NULL OR (updated_at,id) < ($4::timestamptz,$5::uuid))
           ORDER BY updated_at DESC,id DESC LIMIT $6`,
          [
            access.workspaceId,
            includeArchived,
            query ?? null,
            cursorTime,
            cursorId,
            pageSize + 1,
          ],
        );
        const page = result.rows.slice(0, pageSize),
          last = page.at(-1);
        return {
          contexts: page.map((r) => ({
            id: r.id,
            name: r.name,
            purpose: r.purpose,
            scope: r.scope,
            kind: r.kind,
            state: r.state,
            supersededById: r.superseded_by_id,
            identityRevision: r.identity_revision,
            membershipRevision: r.membership_revision,
            updatedAt: r.updated_at.toISOString(),
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

  async unitMemberships(actorId: string, workspaceId: string, unitId: string) {
    uuid(unitId);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        sameWorkspace(access.workspaceId, workspaceId);
        const unit = await client.query<UnitRow>(
          "SELECT current_revision,membership_version,state FROM business.thought_unit WHERE workspace_id=$1 AND id=$2",
          [access.workspaceId, unitId],
        );
        if (!unit.rows[0]) throw new KnowledgeError("UNIT_NOT_FOUND");
        const result = await client.query<{
          context_id: string;
          role: MembershipRole;
          unit_revision: number;
        }>(
          "SELECT context_id,role,unit_revision FROM business.context_membership WHERE workspace_id=$1 AND unit_id=$2 AND ended_at IS NULL ORDER BY context_id",
          [access.workspaceId, unitId],
        );
        return {
          unitId,
          membershipVersion: unit.rows[0].membership_version,
          memberships: result.rows.map((r) => ({
            contextId: r.context_id,
            role: r.role,
            unitRevision: r.unit_revision,
          })),
        };
      },
    );
  }

  async unitRelations(actorId: string, workspaceId: string, unitId: string) {
    uuid(unitId);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        sameWorkspace(access.workspaceId, workspaceId);
        const unit = await client.query(
          "SELECT id FROM business.thought_unit WHERE workspace_id=$1 AND id=$2",
          [access.workspaceId, unitId],
        );
        if (!unit.rows[0]) throw new KnowledgeError("UNIT_NOT_FOUND");
        const result = await client.query<{
          id: string;
          from_unit_id: string;
          from_revision: number;
          to_unit_id: string;
          to_revision: number;
          type: ThoughtRelationType;
        }>(
          "SELECT id,from_unit_id,from_revision,to_unit_id,to_revision,type FROM business.thought_relation WHERE workspace_id=$1 AND (from_unit_id=$2 OR to_unit_id=$2) AND ended_at IS NULL ORDER BY started_at DESC,id DESC",
          [access.workspaceId, unitId],
        );
        return {
          unitId,
          relations: result.rows.map((row) => ({
            id: row.id,
            fromUnitId: row.from_unit_id,
            fromRevision: row.from_revision,
            toUnitId: row.to_unit_id,
            toRevision: row.to_revision,
            type: row.type,
          })),
        };
      },
    );
  }

  private async lockContext(
    client: PoolClient,
    workspaceId: string,
    id: string,
  ): Promise<ContextRow> {
    const result = await client.query<ContextRow>(
      "SELECT id,name,purpose,scope,kind,state,superseded_by_id,identity_revision,membership_revision,created_at,updated_at FROM business.context WHERE workspace_id=$1 AND id=$2 FOR UPDATE",
      [workspaceId, id],
    );
    if (!result.rows[0]) throw new KnowledgeError("CONTEXT_NOT_FOUND");
    return result.rows[0];
  }
}
