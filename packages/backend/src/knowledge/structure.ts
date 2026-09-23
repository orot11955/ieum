import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { CommandCoordinator, CommandError } from "../command-coordinator.js";
import type { CommandOutcome } from "../command-coordinator.js";
import { IdentityService } from "../identity-service.js";

export type StructureKind = "SPLIT" | "MERGE" | "LINK" | "CREATE_PARENT";
export type StructureRole = "PRIMARY" | "SECONDARY" | "BACKGROUND";
export type StructureLinkType = "PARENT_OF" | "RELATED_TO";
export type StructureErrorCode =
  | "STRUCTURE_NOT_FOUND"
  | "STRUCTURE_INVALID"
  | "STRUCTURE_STALE"
  | "STRUCTURE_CONFLICT"
  | "STRUCTURE_CLOSED";
export class StructureError extends Error {
  constructor(public readonly code: StructureErrorCode) {
    super(code);
  }
}
const uuidValue =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hashValue = /^[a-f0-9]{64}$/;
const roles = new Set<StructureRole>(["PRIMARY", "SECONDARY", "BACKGROUND"]);
const kinds = new Set<StructureKind>([
  "SPLIT",
  "MERGE",
  "LINK",
  "CREATE_PARENT",
]);
type Member = { contextId: string; role: StructureRole };
type NewContext = {
  id: string;
  name: string;
  purpose: string;
  scope: string;
  kind: "TOPIC" | "FLOW" | "PROJECT" | "COLLECTION";
};
type Link = {
  fromContextId: string;
  toContextId: string;
  type: StructureLinkType;
};
type UnitChange = {
  unitId: string;
  unitRevision: number;
  membershipVersion: number;
  before: Member[];
  after: Member[];
};
type ContextBase = {
  id: string;
  identityRevision: number;
  membershipRevision: number;
  name: string;
  purpose: string;
  scope: string;
  kind: NewContext["kind"];
  state: string;
};
type Relation = Link & { id: string };
export interface StructurePreview {
  kind: StructureKind;
  sourceContextId: string;
  peerContextId: string | null;
  createdContexts: NewContext[];
  units: UnitChange[];
  addedLinks: Link[];
  baseContexts: ContextBase[];
  relationHash: string;
  sourceWillBeSuperseded: boolean;
  signature: string;
}
export interface StructurePreviewInput {
  actorId: string;
  workspaceId: string;
  sourceContextId: string;
  kind: StructureKind;
  peerContextId?: string | null | undefined;
  createdContexts?: NewContext[] | undefined;
  assignments?:
    { unitId: string; unitRevision: number; after: Member[] }[] | undefined;
  addedLinks?: Link[] | undefined;
  idempotencyKey: string;
}
interface ContextRow {
  id: string;
  name: string;
  purpose: string;
  scope: string;
  kind: NewContext["kind"];
  state: string;
  identity_revision: number;
  membership_revision: number;
}
interface UnitRow {
  id: string;
  current_revision: number;
  membership_version: number;
  state: string;
}
interface MembershipRow {
  unit_id: string;
  context_id: string;
  role: StructureRole;
}
interface RelationRow {
  id: string;
  from_context_id: string;
  to_context_id: string;
  type: StructureLinkType;
}
interface ProposalRow {
  id: string;
  actor_id: string;
  state: string;
  signature: string;
  preview: StructurePreview;
  expires_at: Date;
}
interface MutationRow {
  id: string;
  proposal_id: string;
  kind: StructureKind;
  state: string;
  before: StructurePreview;
  after: AppliedStructure;
}
interface AppliedStructure {
  relationIds: string[];
  successorIds: string[];
  sourceIdentityRevision: number;
  unitVersions: { unitId: string; membershipVersion: number }[];
}

function sha(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function checkUuid(value: string): void {
  if (!uuidValue.test(value)) throw new CommandError("INVALID_COMMAND");
}
function text(value: string, max: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    value.includes("\u0000")
  )
    throw new CommandError("INVALID_COMMAND");
  return value.trim();
}
function sortedMembers(values: readonly Member[]): Member[] {
  if (
    !Array.isArray(values) ||
    values.length > 100 ||
    values.some((x) => !uuidValue.test(x.contextId) || !roles.has(x.role)) ||
    new Set(values.map((x) => x.contextId)).size !== values.length ||
    values.filter((x) => x.role === "PRIMARY").length > 1
  )
    throw new StructureError("STRUCTURE_INVALID");
  return [...values].sort((a, b) => a.contextId.localeCompare(b.contextId));
}
function sameMembers(
  left: readonly Member[],
  right: readonly Member[],
): boolean {
  const pairs = (values: readonly Member[]) =>
    sortedMembers(values).map((x) => [x.contextId, x.role]);
  return JSON.stringify(pairs(left)) === JSON.stringify(pairs(right));
}
function linksFrom(rows: readonly RelationRow[]): Relation[] {
  return rows.map((x) => ({
    id: x.id,
    fromContextId: x.from_context_id,
    toContextId: x.to_context_id,
    type: x.type,
  }));
}
function relationHash(rows: readonly RelationRow[]): string {
  return sha(linksFrom(rows).sort((a, b) => a.id.localeCompare(b.id)));
}
async function activeRelations(
  client: PoolClient,
  workspaceId: string,
  lock: boolean,
): Promise<RelationRow[]> {
  const found = await client.query<RelationRow>(
    `SELECT id,from_context_id,to_context_id,type FROM business.context_relation
     WHERE workspace_id=$1 AND ended_at IS NULL ORDER BY id LIMIT 2001${lock ? " FOR SHARE" : ""}`,
    [workspaceId],
  );
  if (found.rows.length > 2000) throw new StructureError("STRUCTURE_INVALID");
  return found.rows;
}
function normalizedLink(link: Link): Link {
  checkUuid(link.fromContextId);
  checkUuid(link.toContextId);
  if (
    link.fromContextId === link.toContextId ||
    !["PARENT_OF", "RELATED_TO"].includes(link.type)
  )
    throw new StructureError("STRUCTURE_INVALID");
  if (link.type === "RELATED_TO" && link.fromContextId > link.toContextId)
    return {
      ...link,
      fromContextId: link.toContextId,
      toContextId: link.fromContextId,
    };
  return link;
}
function reaches(
  edges: readonly Link[],
  from: string,
  target: string,
): boolean {
  const seen = new Set<string>();
  const pending = [from];
  while (pending.length) {
    const current = pending.pop()!;
    if (current === target) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges)
      if (edge.type === "PARENT_OF" && edge.fromContextId === current)
        pending.push(edge.toContextId);
  }
  return false;
}
function checkedLinks(
  newLinks: readonly Link[],
  existing: readonly RelationRow[],
): Link[] {
  const all = linksFrom(existing);
  const result: Link[] = [];
  for (const value of newLinks) {
    const link = normalizedLink(value);
    if (
      [...all, ...result].some(
        (x) =>
          x.type === link.type &&
          x.fromContextId === link.fromContextId &&
          x.toContextId === link.toContextId,
      ) ||
      (link.type === "PARENT_OF" &&
        reaches([...all, ...result], link.toContextId, link.fromContextId))
    )
      throw new StructureError("STRUCTURE_CONFLICT");
    result.push(link);
  }
  return result.sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
}

async function contextRows(
  client: PoolClient,
  workspaceId: string,
  ids: string[],
  lock: boolean,
): Promise<ContextRow[]> {
  if (ids.length === 0) return [];
  const result = await client.query<ContextRow>(
    `SELECT id,name,purpose,scope,kind,state,identity_revision,membership_revision
     FROM business.context WHERE workspace_id=$1 AND id=ANY($2::uuid[])
     ORDER BY id${lock ? " FOR UPDATE" : ""}`,
    [workspaceId, ids],
  );
  if (result.rows.length !== ids.length)
    throw new StructureError("STRUCTURE_NOT_FOUND");
  return result.rows;
}
function baseOf(row: ContextRow): ContextBase {
  return {
    id: row.id,
    identityRevision: row.identity_revision,
    membershipRevision: row.membership_revision,
    name: row.name,
    purpose: row.purpose,
    scope: row.scope,
    kind: row.kind,
    state: row.state,
  };
}
async function unitRows(
  client: PoolClient,
  workspaceId: string,
  ids: string[],
  lock: boolean,
): Promise<UnitRow[]> {
  if (ids.length === 0) return [];
  const result = await client.query<UnitRow>(
    `SELECT id,current_revision,membership_version,state FROM business.thought_unit
     WHERE workspace_id=$1 AND id=ANY($2::uuid[]) ORDER BY id${lock ? " FOR UPDATE" : ""}`,
    [workspaceId, ids],
  );
  if (
    result.rows.length !== ids.length ||
    result.rows.some((row) => row.state !== "ACTIVE")
  )
    throw new StructureError("STRUCTURE_STALE");
  return result.rows;
}
async function membersFor(
  client: PoolClient,
  workspaceId: string,
  unitIds: string[],
): Promise<Map<string, Member[]>> {
  const result = unitIds.length
    ? await client.query<MembershipRow>(
        `SELECT unit_id,context_id,role FROM business.context_membership
     WHERE workspace_id=$1 AND unit_id=ANY($2::uuid[]) AND ended_at IS NULL
     ORDER BY unit_id,context_id`,
        [workspaceId, unitIds],
      )
    : { rows: [] as MembershipRow[] };
  const values = new Map(unitIds.map((id) => [id, [] as Member[]]));
  for (const row of result.rows)
    values
      .get(row.unit_id)!
      .push({ contextId: row.context_id, role: row.role });
  return values;
}
async function sourceUnitIds(
  client: PoolClient,
  workspaceId: string,
  sourceId: string,
): Promise<string[]> {
  const found = await client.query<{ unit_id: string }>(
    `SELECT unit_id FROM business.context_membership WHERE workspace_id=$1
     AND context_id=$2 AND ended_at IS NULL ORDER BY unit_id LIMIT 65`,
    [workspaceId, sourceId],
  );
  if (found.rows.length > 64) throw new StructureError("STRUCTURE_INVALID");
  return found.rows.map((row) => row.unit_id);
}
function validateNewContexts(values: readonly NewContext[]): NewContext[] {
  if (
    values.length > 4 ||
    new Set(values.map((x) => x.id)).size !== values.length
  )
    throw new StructureError("STRUCTURE_INVALID");
  return values
    .map((value) => {
      checkUuid(value.id);
      if (!["TOPIC", "FLOW", "PROJECT", "COLLECTION"].includes(value.kind))
        throw new StructureError("STRUCTURE_INVALID");
      return {
        id: value.id,
        name: text(value.name, 200),
        purpose: text(value.purpose, 2000),
        scope: text(value.scope, 2000),
        kind: value.kind,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
function previewSignature(value: Omit<StructurePreview, "signature">): string {
  return sha(value);
}
async function graphLock(
  client: PoolClient,
  workspaceId: string,
): Promise<void> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1,5808))",
    [workspaceId],
  );
}

/** User supplied mapping is only a request. All before values are fetched from the owner scoped database. */
export class StructureService {
  constructor(
    private readonly identity: IdentityService,
    private readonly commands: CommandCoordinator,
  ) {}

  async preview(input: StructurePreviewInput): Promise<CommandOutcome> {
    checkUuid(input.sourceContextId);
    if (!kinds.has(input.kind)) throw new StructureError("STRUCTURE_INVALID");
    const peerId = input.peerContextId ?? null;
    if (peerId) checkUuid(peerId);
    const created = validateNewContexts(input.createdContexts ?? []);
    const requested = input.assignments ?? [];
    const links = input.addedLinks ?? [];
    if (
      requested.length > 64 ||
      links.length > 20 ||
      new Set(requested.map((x) => x.unitId)).size !== requested.length
    )
      throw new StructureError("STRUCTURE_INVALID");
    if (
      input.kind === "SPLIT" &&
      (created.length < 1 || peerId || links.length)
    )
      throw new StructureError("STRUCTURE_INVALID");
    if (
      input.kind === "MERGE" &&
      (!peerId ||
        peerId === input.sourceContextId ||
        created.length ||
        links.length)
    )
      throw new StructureError("STRUCTURE_INVALID");
    if (
      input.kind === "LINK" &&
      (peerId ||
        created.length ||
        requested.length ||
        links.length < 1 ||
        links.every(
          (x) =>
            x.fromContextId !== input.sourceContextId &&
            x.toContextId !== input.sourceContextId,
        ))
    )
      throw new StructureError("STRUCTURE_INVALID");
    if (
      input.kind === "CREATE_PARENT" &&
      (created.length !== 1 ||
        peerId ||
        requested.length ||
        links.length !== 1 ||
        links[0]?.type !== "PARENT_OF" ||
        links[0].fromContextId !== created[0]?.id ||
        links[0].toContextId !== input.sourceContextId)
    )
      throw new StructureError("STRUCTURE_INVALID");
    for (const row of requested) {
      checkUuid(row.unitId);
      if (!Number.isSafeInteger(row.unitRevision) || row.unitRevision < 1)
        throw new StructureError("STRUCTURE_INVALID");
      sortedMembers(row.after);
    }
    return this.commands.execute({
      actorId: input.actorId,
      kind: "structure.preview",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        sourceContextId: input.sourceContextId,
        kind: input.kind,
        peerId,
        created,
        requested,
        links,
      },
      apply: async (client, access) => {
        if (access.workspaceId !== input.workspaceId)
          throw new StructureError("STRUCTURE_NOT_FOUND");
        await graphLock(client, access.workspaceId);
        const existing = await activeRelations(
          client,
          access.workspaceId,
          true,
        );
        const unitIds = requested.map((x) => x.unitId).sort();
        const units = await unitRows(client, access.workspaceId, unitIds, true);
        const unitById = new Map(units.map((x) => [x.id, x]));
        const memberMap = await membersFor(client, access.workspaceId, unitIds);
        const sources =
          input.kind === "SPLIT" || input.kind === "MERGE"
            ? await sourceUnitIds(
                client,
                access.workspaceId,
                input.sourceContextId,
              )
            : [];
        if (
          sources.length !== unitIds.length ||
          sources.some((id, index) => id !== unitIds[index])
        )
          throw new StructureError("STRUCTURE_STALE");
        const allowed = new Set([
          input.sourceContextId,
          ...(peerId ? [peerId] : []),
          ...created.map((x) => x.id),
        ]);
        const changes: UnitChange[] = requested.map((row) => {
          const unit = unitById.get(row.unitId)!;
          if (unit.current_revision !== row.unitRevision)
            throw new StructureError("STRUCTURE_STALE");
          const before = sortedMembers(memberMap.get(row.unitId)!);
          const after = sortedMembers(row.after);
          const old = new Map(before.map((x) => [x.contextId, x.role]));
          const next = new Map(after.map((x) => [x.contextId, x.role]));
          for (const id of new Set([...old.keys(), ...next.keys()]))
            if (old.get(id) !== next.get(id) && !allowed.has(id))
              throw new StructureError("STRUCTURE_INVALID");
          if (!old.has(input.sourceContextId) || sameMembers(before, after))
            throw new StructureError("STRUCTURE_INVALID");
          if (input.kind === "SPLIT" && !created.some((x) => next.has(x.id)))
            throw new StructureError("STRUCTURE_INVALID");
          if (
            input.kind === "MERGE" &&
            (next.has(input.sourceContextId) || !next.has(peerId!))
          )
            throw new StructureError("STRUCTURE_INVALID");
          return {
            unitId: row.unitId,
            unitRevision: row.unitRevision,
            membershipVersion: unit.membership_version,
            before,
            after,
          };
        });
        const touched = new Set([
          input.sourceContextId,
          ...(peerId ? [peerId] : []),
          ...changes.flatMap((x) =>
            [...x.before, ...x.after].map((m) => m.contextId),
          ),
          ...links.flatMap((x) => [x.fromContextId, x.toContextId]),
        ]);
        for (const x of created) touched.delete(x.id);
        const bases = (
          await contextRows(
            client,
            access.workspaceId,
            [...touched].sort(),
            true,
          )
        ).map(baseOf);
        if (bases.some((x) => x.state !== "ACTIVE"))
          throw new StructureError("STRUCTURE_STALE");
        if (
          created.some(
            (x) => touched.has(x.id) || bases.some((b) => b.id === x.id),
          )
        )
          throw new StructureError("STRUCTURE_INVALID");
        const inDb = await client.query<{ id: string }>(
          "SELECT id FROM business.context WHERE workspace_id=$1 AND id=ANY($2::uuid[])",
          [access.workspaceId, created.map((x) => x.id)],
        );
        if (inDb.rows.length) throw new StructureError("STRUCTURE_CONFLICT");
        const addedLinks = checkedLinks(links, existing);
        if (input.kind === "MERGE") {
          const existingSuccessor = await client.query(
            `SELECT 1 FROM business.context_successor WHERE workspace_id=$1
             AND source_context_id=$2 AND target_context_id=$3 AND ended_at IS NULL`,
            [access.workspaceId, input.sourceContextId, peerId],
          );
          if (existingSuccessor.rowCount)
            throw new StructureError("STRUCTURE_CONFLICT");
        }
        const sourceWillBeSuperseded =
          input.kind === "MERGE" ||
          (input.kind === "SPLIT" &&
            changes.length > 0 &&
            changes.every(
              (x) =>
                !x.after.some((m) => m.contextId === input.sourceContextId),
            ));
        if (input.kind === "SPLIT" && changes.length === 0)
          throw new StructureError("STRUCTURE_INVALID");
        if (
          input.kind === "SPLIT" &&
          created.some(
            (x) =>
              !changes.some((change) =>
                change.after.some((member) => member.contextId === x.id),
              ),
          )
        )
          throw new StructureError("STRUCTURE_INVALID");
        const unsigned = {
          kind: input.kind,
          sourceContextId: input.sourceContextId,
          peerContextId: peerId,
          createdContexts: created,
          units: changes,
          addedLinks,
          baseContexts: bases,
          relationHash: relationHash(existing),
          sourceWillBeSuperseded,
        };
        const signature = previewSignature(unsigned);
        const proposalId = randomUUID();
        await client.query(
          `INSERT INTO business.structure_proposal
           (id,workspace_id,actor_id,kind,source_context_id,preview,signature,expires_at)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,now()+interval '1 hour')`,
          [
            proposalId,
            access.workspaceId,
            input.actorId,
            input.kind,
            input.sourceContextId,
            JSON.stringify({ ...unsigned, signature }),
            signature,
          ],
        );
        return {
          response: { proposalId, preview: { ...unsigned, signature } },
          audit: {
            action: "structure.preview",
            targetType: "structure_proposal",
            targetId: proposalId,
            beforeVersion: null,
            afterVersion: null,
            changedFieldNames: [],
          },
        };
      },
    });
  }

  async accept(input: {
    actorId: string;
    workspaceId: string;
    proposalId: string;
    signature: string;
    idempotencyKey: string;
  }): Promise<CommandOutcome> {
    checkUuid(input.proposalId);
    if (!hashValue.test(input.signature))
      throw new StructureError("STRUCTURE_INVALID");
    return this.commands.execute({
      actorId: input.actorId,
      kind: "structure.accept",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        proposalId: input.proposalId,
        signature: input.signature,
      },
      apply: async (client, access) => {
        if (access.workspaceId !== input.workspaceId)
          throw new StructureError("STRUCTURE_NOT_FOUND");
        await graphLock(client, access.workspaceId);
        const found = await client.query<ProposalRow>(
          `SELECT id,actor_id,state,signature,preview,expires_at FROM business.structure_proposal
           WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
          [access.workspaceId, input.proposalId],
        );
        const proposal = found.rows[0];
        if (!proposal || proposal.actor_id !== input.actorId)
          throw new StructureError("STRUCTURE_NOT_FOUND");
        if (
          proposal.state !== "PENDING" ||
          proposal.expires_at.getTime() <= Date.now()
        )
          throw new StructureError("STRUCTURE_CLOSED");
        if (
          proposal.signature !== input.signature ||
          proposal.preview.signature !== input.signature
        )
          throw new StructureError("STRUCTURE_INVALID");
        const plan = proposal.preview;
        const unitIds = plan.units.map((x) => x.unitId).sort();
        const units = await unitRows(client, access.workspaceId, unitIds, true);
        const unitMap = new Map(units.map((x) => [x.id, x]));
        const contexts = await contextRows(
          client,
          access.workspaceId,
          plan.baseContexts.map((x) => x.id),
          true,
        );
        if (
          contexts.some((x) => {
            const base = plan.baseContexts.find((b) => b.id === x.id)!;
            return (
              x.identity_revision !== base.identityRevision ||
              x.membership_revision !== base.membershipRevision ||
              x.name !== base.name ||
              x.purpose !== base.purpose ||
              x.scope !== base.scope ||
              x.kind !== base.kind ||
              x.state !== base.state
            );
          })
        )
          throw new StructureError("STRUCTURE_STALE");
        const relations = await activeRelations(
          client,
          access.workspaceId,
          true,
        );
        if (relationHash(relations) !== plan.relationHash)
          throw new StructureError("STRUCTURE_STALE");
        const current = await membersFor(client, access.workspaceId, unitIds);
        for (const change of plan.units) {
          const row = unitMap.get(change.unitId)!;
          if (
            row.current_revision !== change.unitRevision ||
            row.membership_version !== change.membershipVersion ||
            !sameMembers(current.get(change.unitId)!, change.before)
          )
            throw new StructureError("STRUCTURE_STALE");
        }
        if (plan.kind === "SPLIT" || plan.kind === "MERGE") {
          const sourceIds = await sourceUnitIds(
            client,
            access.workspaceId,
            plan.sourceContextId,
          );
          if (
            sourceIds.length !== unitIds.length ||
            sourceIds.some((id, index) => id !== unitIds[index])
          )
            throw new StructureError("STRUCTURE_STALE");
        }
        if (plan.kind === "MERGE") {
          const existingSuccessor = await client.query(
            `SELECT 1 FROM business.context_successor WHERE workspace_id=$1
             AND source_context_id=$2 AND target_context_id=$3 AND ended_at IS NULL`,
            [access.workspaceId, plan.sourceContextId, plan.peerContextId],
          );
          if (existingSuccessor.rowCount)
            throw new StructureError("STRUCTURE_STALE");
        }
        if (plan.createdContexts.length) {
          const collision = await client.query<{ id: string }>(
            "SELECT id FROM business.context WHERE workspace_id=$1 AND id=ANY($2::uuid[])",
            [access.workspaceId, plan.createdContexts.map((x) => x.id)],
          );
          if (collision.rows.length)
            throw new StructureError("STRUCTURE_STALE");
        }
        for (const item of plan.createdContexts) {
          await client.query(
            `INSERT INTO business.context (id,workspace_id,name,purpose,scope,kind)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              item.id,
              access.workspaceId,
              item.name,
              item.purpose,
              item.scope,
              item.kind,
            ],
          );
          await client.query(
            `INSERT INTO business.context_identity_revision
             (workspace_id,context_id,revision,name,purpose,scope,kind,state)
             VALUES ($1,$2,1,$3,$4,$5,$6,'ACTIVE')`,
            [
              access.workspaceId,
              item.id,
              item.name,
              item.purpose,
              item.scope,
              item.kind,
            ],
          );
        }
        const changedContextIds = new Set<string>();
        const versions: AppliedStructure["unitVersions"] = [];
        for (const change of plan.units) {
          const old = new Map(change.before.map((x) => [x.contextId, x.role]));
          const next = new Map(change.after.map((x) => [x.contextId, x.role]));
          const changed = [...new Set([...old.keys(), ...next.keys()])]
            .filter((id) => old.get(id) !== next.get(id))
            .sort();
          for (const id of changed) changedContextIds.add(id);
          await client.query(
            `UPDATE business.context_membership SET ended_at=now(),ended_reason='STRUCTURE'
             WHERE workspace_id=$1 AND unit_id=$2 AND context_id=ANY($3::uuid[]) AND ended_at IS NULL`,
            [access.workspaceId, change.unitId, changed],
          );
          for (const member of change.after.filter((x) =>
            changed.includes(x.contextId),
          )) {
            await client.query(
              `INSERT INTO business.context_membership
               (workspace_id,unit_id,unit_revision,context_id,role) VALUES ($1,$2,$3,$4,$5)`,
              [
                access.workspaceId,
                change.unitId,
                change.unitRevision,
                member.contextId,
                member.role,
              ],
            );
          }
          await client.query(
            `UPDATE business.thought_unit SET membership_version=membership_version+1
             WHERE workspace_id=$1 AND id=$2`,
            [access.workspaceId, change.unitId],
          );
          versions.push({
            unitId: change.unitId,
            membershipVersion: change.membershipVersion + 1,
          });
        }
        if (changedContextIds.size)
          await client.query(
            `UPDATE business.context SET membership_revision=membership_revision+1,updated_at=now()
             WHERE workspace_id=$1 AND id=ANY($2::uuid[])`,
            [access.workspaceId, [...changedContextIds].sort()],
          );
        const relationIds: string[] = [];
        for (const link of plan.addedLinks) {
          const id = randomUUID();
          await client.query(
            `INSERT INTO business.context_relation
             (id,workspace_id,from_context_id,to_context_id,type,approved_by_id)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              id,
              access.workspaceId,
              link.fromContextId,
              link.toContextId,
              link.type,
              input.actorId,
            ],
          );
          relationIds.push(id);
        }
        const mutationId = randomUUID();
        let sourceIdentityRevision = plan.baseContexts.find(
          (x) => x.id === plan.sourceContextId,
        )!.identityRevision;
        const successorIds: string[] = [];
        const targets =
          plan.kind === "SPLIT"
            ? plan.createdContexts.map((x) => x.id)
            : plan.kind === "MERGE"
              ? [plan.peerContextId!]
              : [];
        const after: AppliedStructure = {
          relationIds,
          successorIds,
          sourceIdentityRevision,
          unitVersions: versions,
        };
        await client.query(
          `INSERT INTO business.structure_mutation
           (id,workspace_id,proposal_id,actor_id,kind,before,after)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
          [
            mutationId,
            access.workspaceId,
            proposal.id,
            input.actorId,
            plan.kind,
            JSON.stringify(plan),
            JSON.stringify(after),
          ],
        );
        for (const target of targets) {
          const id = randomUUID();
          await client.query(
            `INSERT INTO business.context_successor
             (id,workspace_id,source_context_id,target_context_id,mutation_id)
             VALUES ($1,$2,$3,$4,$5)`,
            [id, access.workspaceId, plan.sourceContextId, target, mutationId],
          );
          successorIds.push(id);
        }
        if (plan.sourceWillBeSuperseded) {
          const source = plan.baseContexts.find(
            (x) => x.id === plan.sourceContextId,
          )!;
          const singleTarget = targets.length === 1 ? targets[0] : null;
          sourceIdentityRevision++;
          await client.query(
            `UPDATE business.context SET state='SUPERSEDED',superseded_by_id=$3,
             identity_revision=$4,updated_at=now() WHERE workspace_id=$1 AND id=$2`,
            [
              access.workspaceId,
              source.id,
              singleTarget,
              sourceIdentityRevision,
            ],
          );
          await client.query(
            `INSERT INTO business.context_identity_revision
             (workspace_id,context_id,revision,name,purpose,scope,kind,state,superseded_by_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'SUPERSEDED',$8)`,
            [
              access.workspaceId,
              source.id,
              sourceIdentityRevision,
              source.name,
              source.purpose,
              source.scope,
              source.kind,
              singleTarget,
            ],
          );
        }
        after.sourceIdentityRevision = sourceIdentityRevision;
        await client.query(
          `UPDATE business.structure_mutation SET after=$3::jsonb WHERE workspace_id=$1 AND id=$2`,
          [access.workspaceId, mutationId, JSON.stringify(after)],
        );
        await client.query(
          `UPDATE business.structure_proposal SET state='APPLIED',applied_at=now()
           WHERE workspace_id=$1 AND id=$2`,
          [access.workspaceId, proposal.id],
        );
        return {
          response: {
            mutationId,
            proposalId: proposal.id,
            sourceContextId: plan.sourceContextId,
            sourceState: plan.sourceWillBeSuperseded ? "SUPERSEDED" : "ACTIVE",
            successorContextIds: targets,
          },
          audit: {
            action: "structure.accept",
            targetType: "structure_mutation",
            targetId: mutationId,
            beforeVersion: null,
            afterVersion: 1,
            changedFieldNames: ["memberships", "relations", "successors"],
          },
          outbox: [
            ...(changedContextIds.size
              ? [
                  {
                    eventType: "context.membership.changed",
                    payloadRef: { contextIds: [...changedContextIds], unitIds },
                  },
                ]
              : []),
            {
              eventType: "structure.applied",
              payloadRef: { mutationId, sourceContextId: plan.sourceContextId },
            },
          ],
        };
      },
    });
  }

  private async inverse(
    client: PoolClient,
    workspaceId: string,
    mutation: MutationRow,
    lock: boolean,
  ) {
    const plan = mutation.before;
    const applied = mutation.after;
    if (mutation.state !== "APPLIED")
      throw new StructureError("STRUCTURE_CLOSED");
    const unitIds = plan.units.map((x) => x.unitId).sort();
    const currentUnits = await unitRows(client, workspaceId, unitIds, lock);
    const members = await membersFor(client, workspaceId, unitIds);
    const versions = new Map(
      applied.unitVersions.map((x) => [x.unitId, x.membershipVersion]),
    );
    for (const change of plan.units) {
      const row = currentUnits.find((x) => x.id === change.unitId)!;
      if (
        row.current_revision !== change.unitRevision ||
        row.membership_version !== versions.get(change.unitId) ||
        !sameMembers(members.get(change.unitId)!, change.after)
      )
        throw new StructureError("STRUCTURE_CONFLICT");
    }
    const source = (
      await contextRows(client, workspaceId, [plan.sourceContextId], lock)
    )[0]!;
    if (
      source.identity_revision !== applied.sourceIdentityRevision ||
      source.state !== (plan.sourceWillBeSuperseded ? "SUPERSEDED" : "ACTIVE")
    )
      throw new StructureError("STRUCTURE_CONFLICT");
    const relations = applied.relationIds.length
      ? await client.query<{ id: string; ended_at: Date | null }>(
          `SELECT id,ended_at FROM business.context_relation WHERE workspace_id=$1 AND id=ANY($2::uuid[])
       ORDER BY id${lock ? " FOR UPDATE" : ""}`,
          [workspaceId, applied.relationIds],
        )
      : { rows: [] as { id: string; ended_at: Date | null }[] };
    if (
      relations.rows.length !== applied.relationIds.length ||
      relations.rows.some((x) => x.ended_at)
    )
      throw new StructureError("STRUCTURE_CONFLICT");
    const successors = applied.successorIds.length
      ? await client.query<{ id: string; ended_at: Date | null }>(
          `SELECT id,ended_at FROM business.context_successor WHERE workspace_id=$1 AND id=ANY($2::uuid[])
       ORDER BY id${lock ? " FOR UPDATE" : ""}`,
          [workspaceId, applied.successorIds],
        )
      : { rows: [] as { id: string; ended_at: Date | null }[] };
    if (
      successors.rows.length !== applied.successorIds.length ||
      successors.rows.some((x) => x.ended_at)
    )
      throw new StructureError("STRUCTURE_CONFLICT");
    return {
      plan,
      applied,
      source,
      signature: sha({
        mutationId: mutation.id,
        unitVersions: applied.unitVersions,
        sourceIdentityRevision: source.identity_revision,
        relationIds: relations.rows.map((x) => x.id),
        successorIds: successors.rows.map((x) => x.id),
      }),
    };
  }

  async previewUndo(actorId: string, workspaceId: string, mutationId: string) {
    checkUuid(mutationId);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new StructureError("STRUCTURE_NOT_FOUND");
        const found = await client.query<MutationRow>(
          `SELECT id,proposal_id,kind,state,"before","after" FROM business.structure_mutation
         WHERE workspace_id=$1 AND id=$2`,
          [workspaceId, mutationId],
        );
        const mutation = found.rows[0];
        if (!mutation) throw new StructureError("STRUCTURE_NOT_FOUND");
        const inverse = await this.inverse(
          client,
          workspaceId,
          mutation,
          false,
        );
        return {
          mutationId,
          signature: inverse.signature,
          restores: inverse.plan.units.map((x) => ({
            unitId: x.unitId,
            before: x.after,
            after: x.before,
          })),
          endsRelationIds: inverse.applied.relationIds,
          reactivatesSource: inverse.plan.sourceWillBeSuperseded,
          retainedContextIds: inverse.plan.createdContexts.map((x) => x.id),
          note: "Created Contexts and records added after application are retained.",
        };
      },
    );
  }

  async undo(input: {
    actorId: string;
    workspaceId: string;
    mutationId: string;
    signature: string;
    idempotencyKey: string;
  }): Promise<CommandOutcome> {
    checkUuid(input.mutationId);
    if (!hashValue.test(input.signature))
      throw new StructureError("STRUCTURE_INVALID");
    return this.commands.execute({
      actorId: input.actorId,
      kind: "structure.undo",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        mutationId: input.mutationId,
        signature: input.signature,
      },
      apply: async (client, access) => {
        if (access.workspaceId !== input.workspaceId)
          throw new StructureError("STRUCTURE_NOT_FOUND");
        await graphLock(client, access.workspaceId);
        const found = await client.query<MutationRow>(
          `SELECT id,proposal_id,kind,state,"before","after" FROM business.structure_mutation
           WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
          [access.workspaceId, input.mutationId],
        );
        const mutation = found.rows[0];
        if (!mutation) throw new StructureError("STRUCTURE_NOT_FOUND");
        const inverse = await this.inverse(
          client,
          access.workspaceId,
          mutation,
          true,
        );
        if (inverse.signature !== input.signature)
          throw new StructureError("STRUCTURE_STALE");
        const changedContextIds = new Set<string>();
        for (const change of inverse.plan.units) {
          const old = new Map(change.after.map((x) => [x.contextId, x.role]));
          const next = new Map(change.before.map((x) => [x.contextId, x.role]));
          const changed = [...new Set([...old.keys(), ...next.keys()])]
            .filter((id) => old.get(id) !== next.get(id))
            .sort();
          for (const id of changed) changedContextIds.add(id);
          await client.query(
            `UPDATE business.context_membership SET ended_at=now(),ended_reason='STRUCTURE_UNDO'
             WHERE workspace_id=$1 AND unit_id=$2 AND context_id=ANY($3::uuid[]) AND ended_at IS NULL`,
            [access.workspaceId, change.unitId, changed],
          );
          for (const member of change.before.filter((x) =>
            changed.includes(x.contextId),
          )) {
            await client.query(
              `INSERT INTO business.context_membership
               (workspace_id,unit_id,unit_revision,context_id,role) VALUES ($1,$2,$3,$4,$5)`,
              [
                access.workspaceId,
                change.unitId,
                change.unitRevision,
                member.contextId,
                member.role,
              ],
            );
          }
          await client.query(
            `UPDATE business.thought_unit SET membership_version=membership_version+1
             WHERE workspace_id=$1 AND id=$2`,
            [access.workspaceId, change.unitId],
          );
        }
        if (changedContextIds.size)
          await client.query(
            `UPDATE business.context SET membership_revision=membership_revision+1,updated_at=now()
             WHERE workspace_id=$1 AND id=ANY($2::uuid[])`,
            [access.workspaceId, [...changedContextIds].sort()],
          );
        if (inverse.applied.relationIds.length)
          await client.query(
            `UPDATE business.context_relation SET ended_at=now()
             WHERE workspace_id=$1 AND id=ANY($2::uuid[])`,
            [access.workspaceId, inverse.applied.relationIds],
          );
        if (inverse.plan.sourceWillBeSuperseded) {
          const source = inverse.plan.baseContexts.find(
            (x) => x.id === inverse.plan.sourceContextId,
          )!;
          const revision = inverse.source.identity_revision + 1;
          await client.query(
            `UPDATE business.context SET state='ACTIVE',superseded_by_id=NULL,
             identity_revision=$3,updated_at=now() WHERE workspace_id=$1 AND id=$2`,
            [access.workspaceId, source.id, revision],
          );
          await client.query(
            `INSERT INTO business.context_identity_revision
             (workspace_id,context_id,revision,name,purpose,scope,kind,state)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE')`,
            [
              access.workspaceId,
              source.id,
              revision,
              source.name,
              source.purpose,
              source.scope,
              source.kind,
            ],
          );
        }
        if (inverse.applied.successorIds.length)
          await client.query(
            `UPDATE business.context_successor SET ended_at=now()
             WHERE workspace_id=$1 AND id=ANY($2::uuid[])`,
            [access.workspaceId, inverse.applied.successorIds],
          );
        await client.query(
          `UPDATE business.structure_mutation SET state='UNDONE',undone_at=now()
           WHERE workspace_id=$1 AND id=$2`,
          [access.workspaceId, mutation.id],
        );
        return {
          response: {
            mutationId: mutation.id,
            undone: true,
            retainedContextIds: inverse.plan.createdContexts.map((x) => x.id),
          },
          audit: {
            action: "structure.undo",
            targetType: "structure_mutation",
            targetId: mutation.id,
            beforeVersion: 1,
            afterVersion: 2,
            changedFieldNames: ["memberships", "relations", "successors"],
          },
          outbox: [
            ...(changedContextIds.size
              ? [
                  {
                    eventType: "context.membership.changed",
                    payloadRef: { contextIds: [...changedContextIds] },
                  },
                ]
              : []),
            {
              eventType: "structure.undone",
              payloadRef: { mutationId: mutation.id },
            },
          ],
        };
      },
    });
  }
}
