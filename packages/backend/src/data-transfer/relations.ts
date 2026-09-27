import type { TransferManifestV10 } from "@ieum/contracts/data-transfer";
import type { PoolClient } from "pg";
import type { TransferPreviewRow } from "./service.js";

export type PortableContextRelation =
  TransferManifestV10["currentContextRelations"][number];
export type PortableThoughtRelation =
  TransferManifestV10["currentThoughtRelations"][number];
export type PortableRelations = Pick<
  TransferManifestV10,
  "currentContextRelations" | "currentThoughtRelations"
>;
export type ContextEdges = {
  from: string;
  to: string;
  type: PortableContextRelation["type"];
}[];

export function contextEndpoints(
  from: string,
  to: string,
  type: PortableContextRelation["type"],
): [string, string] {
  const endpoints: [string, string] = [from.toLowerCase(), to.toLowerCase()];
  if (type === "RELATED_TO" && endpoints[0] > endpoints[1]) endpoints.reverse();
  return endpoints;
}

export function thoughtEndpoints(
  from: string,
  fromRevision: number,
  to: string,
  toRevision: number,
  type: PortableThoughtRelation["type"],
): [string, number, string, number] {
  const a = from.toLowerCase(),
    b = to.toLowerCase();
  return (type === "RELATED_TO" || type === "CONTRADICTS") &&
    (a > b || (a === b && fromRevision > toRevision))
    ? [b, toRevision, a, fromRevision]
    : [a, fromRevision, b, toRevision];
}

function reaches(edges: ContextEdges, from: string, target: string): boolean {
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.type !== "PARENT_OF") continue;
    const children = next.get(edge.from) ?? [];
    children.push(edge.to);
    next.set(edge.from, children);
  }
  const pending = [from],
    seen = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(...(next.get(id) ?? []));
  }
  return false;
}

export function validPortableRelations(records: PortableRelations): boolean {
  for (const relations of [
    records.currentContextRelations,
    records.currentThoughtRelations,
  ]) {
    const ids = new Set<string>(),
      origins = new Set<string>(),
      pairs = new Set<string>();
    for (const record of relations) {
      const id = record.id.toLowerCase();
      const origin = `${record.originWorkspaceId.toLowerCase()}:${record.originId.toLowerCase()}`;
      let pair: string;
      if ("fromContextId" in record) {
        const [from, to] = contextEndpoints(
          record.fromContextId,
          record.toContextId,
          record.type,
        );
        if (from === to) return false;
        pair = JSON.stringify([from, to, record.type]);
      } else {
        const [from, fr, to, tr] = thoughtEndpoints(
          record.fromUnitId,
          record.fromRevision,
          record.toUnitId,
          record.toRevision,
          record.type,
        );
        if (from === to && fr === tr) return false;
        pair = JSON.stringify([from, fr, to, tr, record.type]);
      }
      if (ids.has(id) || origins.has(origin) || pairs.has(pair)) return false;
      ids.add(id);
      origins.add(origin);
      pairs.add(pair);
    }
  }
  // Kahn's algorithm bounds validation by the number of portable edges/nodes.
  const children = new Map<string, string[]>(),
    degrees = new Map<string, number>();
  for (const record of records.currentContextRelations) {
    if (record.type !== "PARENT_OF") continue;
    const from = record.fromContextId.toLowerCase(),
      to = record.toContextId.toLowerCase();
    const next = children.get(from) ?? [];
    next.push(to);
    children.set(from, next);
    degrees.set(from, degrees.get(from) ?? 0);
    degrees.set(to, (degrees.get(to) ?? 0) + 1);
  }
  const pending = [...degrees].filter(([, n]) => n === 0).map(([id]) => id);
  let visited = 0;
  while (pending.length) {
    const id = pending.pop()!;
    visited++;
    for (const next of children.get(id) ?? []) {
      const degree = degrees.get(next)! - 1;
      degrees.set(next, degree);
      if (degree === 0) pending.push(next);
    }
  }
  return visited === degrees.size;
}

export async function readCurrentRelations(
  client: PoolClient,
  workspaceId: string,
): Promise<PortableRelations> {
  const contexts = await client.query<{
    id: string;
    from_context_id: string;
    to_context_id: string;
    type: PortableContextRelation["type"];
    started_at: Date;
    origin_workspace_id: string | null;
    origin_id: string | null;
  }>(
    `SELECT r.id,r.from_context_id,r.to_context_id,r.type,r.started_at,
           o.source_workspace_id AS origin_workspace_id,o.source_id AS origin_id
      FROM business.context_relation r LEFT JOIN LATERAL (
        SELECT source_workspace_id,source_id FROM business.transfer_origin
        WHERE workspace_id=r.workspace_id AND record_kind='context_relation' AND target_id=r.id
        ORDER BY source_workspace_id,source_id LIMIT 1
      ) o ON true WHERE r.workspace_id=$1 AND r.ended_at IS NULL ORDER BY r.id LIMIT 2049`,
    [workspaceId],
  );
  const thoughts = await client.query<{
    id: string;
    from_unit_id: string;
    from_revision: number;
    to_unit_id: string;
    to_revision: number;
    type: PortableThoughtRelation["type"];
    started_at: Date;
    origin_workspace_id: string | null;
    origin_id: string | null;
  }>(
    `SELECT r.id,r.from_unit_id,r.from_revision,r.to_unit_id,r.to_revision,r.type,r.started_at,
           o.source_workspace_id AS origin_workspace_id,o.source_id AS origin_id
      FROM business.thought_relation r LEFT JOIN LATERAL (
        SELECT source_workspace_id,source_id FROM business.transfer_origin
        WHERE workspace_id=r.workspace_id AND record_kind='thought_relation' AND target_id=r.id
        ORDER BY source_workspace_id,source_id LIMIT 1
      ) o ON true WHERE r.workspace_id=$1 AND r.ended_at IS NULL ORDER BY r.id LIMIT 2049`,
    [workspaceId],
  );
  return {
    currentContextRelations: contexts.rows.map((r) => ({
      id: r.id,
      originWorkspaceId: r.origin_workspace_id ?? workspaceId,
      originId: r.origin_id ?? r.id,
      fromContextId: r.from_context_id,
      toContextId: r.to_context_id,
      type: r.type,
      startedAt: r.started_at.toISOString(),
    })),
    currentThoughtRelations: thoughts.rows.map((r) => ({
      id: r.id,
      originWorkspaceId: r.origin_workspace_id ?? workspaceId,
      originId: r.origin_id ?? r.id,
      fromUnitId: r.from_unit_id,
      fromRevision: r.from_revision,
      toUnitId: r.to_unit_id,
      toRevision: r.to_revision,
      type: r.type,
      startedAt: r.started_at.toISOString(),
    })),
  };
}

export async function readContextEdges(
  client: PoolClient,
  workspaceId: string,
): Promise<ContextEdges> {
  const result = await client.query<{
    from_context_id: string;
    to_context_id: string;
    type: PortableContextRelation["type"];
  }>(
    `SELECT from_context_id,to_context_id,type FROM business.context_relation
     WHERE workspace_id=$1 AND ended_at IS NULL`,
    [workspaceId],
  );
  return result.rows.map((r) => ({
    from: r.from_context_id,
    to: r.to_context_id,
    type: r.type,
  }));
}

function parent(
  rows: TransferPreviewRow[],
  kind: "unit" | "context",
  id: string,
) {
  const row = rows.find(
    (r) =>
      r.recordKind === kind && r.sourceId.toLowerCase() === id.toLowerCase(),
  );
  return row && ["NEW", "DUPLICATE", "IMPORTED", "SKIPPED"].includes(row.state)
    ? row
    : undefined;
}

async function storedRow(
  client: PoolClient,
  workspaceId: string,
  runId: string,
  kind: "context_relation" | "thought_relation",
  id: string,
): Promise<TransferPreviewRow | null> {
  const result = await client.query<{
    state: "PENDING" | "IMPORTED" | "SKIPPED" | "FAILED";
    target_id: string | null;
  }>(
    `SELECT state,target_id FROM business.transfer_row WHERE workspace_id=$1 AND run_id=$2 AND record_kind=$3 AND source_id=$4`,
    [workspaceId, runId, kind, id],
  );
  const row = result.rows[0];
  return row && row.state !== "PENDING"
    ? {
        recordKind: kind,
        sourceId: id,
        sourceRevision: 1,
        state: row.state,
        targetId: row.target_id,
      }
    : null;
}

export async function previewContextRelation(
  client: PoolClient,
  workspaceId: string,
  runId: string,
  record: PortableContextRelation,
  rows: TransferPreviewRow[],
  edges: ContextEdges,
): Promise<TransferPreviewRow> {
  const base = {
    recordKind: "context_relation" as const,
    sourceId: record.id,
    sourceRevision: 1,
    targetId: null,
  };
  const stored = await storedRow(
    client,
    workspaceId,
    runId,
    base.recordKind,
    record.id,
  );
  if (stored) return stored;
  const a = parent(rows, "context", record.fromContextId),
    b = parent(rows, "context", record.toContextId);
  if (!a || !b) return { ...base, state: "MISSING_REFERENCE" };
  const [from, to] = contextEndpoints(
    a.targetId ?? `source:${a.sourceId}`,
    b.targetId ?? `source:${b.sourceId}`,
    record.type,
  );
  if (from === to) return { ...base, state: "CONFLICT" };
  const ids = [a.targetId, b.targetId].filter(
    (id): id is string => id !== null,
  );
  const found = await client.query(
    `SELECT id FROM business.context WHERE workspace_id=$1 AND id=ANY($2::uuid[])`,
    [workspaceId, ids],
  );
  if (found.rows.length !== ids.length)
    return { ...base, state: "MISSING_REFERENCE" };
  const prior = await client.query<{ target_id: string; same: boolean | null }>(
    `WITH candidate AS (
      SELECT target_id,0 AS priority FROM business.transfer_origin WHERE workspace_id=$1 AND record_kind='context_relation' AND source_workspace_id=$2 AND source_id=$3
      UNION ALL SELECT id,1 FROM business.context_relation WHERE workspace_id=$1 AND id=$3 AND $1::uuid=$2::uuid
    ) SELECT o.target_id,r.from_context_id=$4::uuid AND r.to_context_id=$5::uuid AND r.type=$6 AND r.ended_at IS NULL AND date_trunc('milliseconds',r.started_at)=$7::timestamptz AS same
      FROM candidate o LEFT JOIN business.context_relation r ON r.workspace_id=$1 AND r.id=o.target_id ORDER BY o.priority LIMIT 1`,
    [
      workspaceId,
      record.originWorkspaceId,
      record.originId,
      a.targetId && b.targetId ? from : null,
      a.targetId && b.targetId ? to : null,
      record.type,
      record.startedAt,
    ],
  );
  if (prior.rows[0])
    return {
      ...base,
      state: prior.rows[0].same ? "DUPLICATE" : "CONFLICT",
      targetId: prior.rows[0].target_id,
    };
  if (
    edges.some(
      (e) => e.from === from && e.to === to && e.type === record.type,
    ) ||
    (record.type === "PARENT_OF" && reaches(edges, to, from))
  )
    return { ...base, state: "CONFLICT" };
  edges.push({ from, to, type: record.type });
  return { ...base, state: "NEW" };
}

export async function previewThoughtRelation(
  client: PoolClient,
  workspaceId: string,
  runId: string,
  record: PortableThoughtRelation,
  units: TransferManifestV10["units"],
  rows: TransferPreviewRow[],
  plannedPairs: Set<string>,
): Promise<TransferPreviewRow> {
  const base = {
    recordKind: "thought_relation" as const,
    sourceId: record.id,
    sourceRevision: 1,
    targetId: null,
  };
  const stored = await storedRow(
    client,
    workspaceId,
    runId,
    base.recordKind,
    record.id,
  );
  if (stored) return stored;
  const a = parent(rows, "unit", record.fromUnitId),
    b = parent(rows, "unit", record.toUnitId);
  for (const [id, revision] of [
    [record.fromUnitId, record.fromRevision],
    [record.toUnitId, record.toRevision],
  ] as const)
    if (
      !units.some(
        (u) =>
          u.id.toLowerCase() === id.toLowerCase() &&
          u.revisions.some((r) => r.revision === revision),
      )
    )
      return { ...base, state: "MISSING_REFERENCE" };
  if (!a || !b) return { ...base, state: "MISSING_REFERENCE" };
  const [from, fr, to, tr] = thoughtEndpoints(
    a.targetId ?? `source:${a.sourceId}`,
    record.fromRevision,
    b.targetId ?? `source:${b.sourceId}`,
    record.toRevision,
    record.type,
  );
  if (from === to && fr === tr) return { ...base, state: "CONFLICT" };
  for (const [id, revision] of [
    [a.targetId, record.fromRevision],
    [b.targetId, record.toRevision],
  ] as const) {
    if (!id) continue;
    const exists = await client.query(
      `SELECT 1 FROM business.thought_unit_revision WHERE workspace_id=$1 AND unit_id=$2 AND revision=$3`,
      [workspaceId, id, revision],
    );
    if (!exists.rows[0]) return { ...base, state: "MISSING_REFERENCE" };
  }
  const prior = await client.query<{ target_id: string; same: boolean | null }>(
    `WITH candidate AS (
      SELECT target_id,0 AS priority FROM business.transfer_origin WHERE workspace_id=$1 AND record_kind='thought_relation' AND source_workspace_id=$2 AND source_id=$3
      UNION ALL SELECT id,1 FROM business.thought_relation WHERE workspace_id=$1 AND id=$3 AND $1::uuid=$2::uuid
    ) SELECT o.target_id,r.from_unit_id=$4::uuid AND r.from_revision=$5 AND r.to_unit_id=$6::uuid AND r.to_revision=$7 AND r.type=$8 AND r.ended_at IS NULL AND date_trunc('milliseconds',r.started_at)=$9::timestamptz AS same
      FROM candidate o LEFT JOIN business.thought_relation r ON r.workspace_id=$1 AND r.id=o.target_id ORDER BY o.priority LIMIT 1`,
    [
      workspaceId,
      record.originWorkspaceId,
      record.originId,
      a.targetId && b.targetId ? from : null,
      fr,
      a.targetId && b.targetId ? to : null,
      tr,
      record.type,
      record.startedAt,
    ],
  );
  if (prior.rows[0])
    return {
      ...base,
      state: prior.rows[0].same ? "DUPLICATE" : "CONFLICT",
      targetId: prior.rows[0].target_id,
    };
  const key = JSON.stringify([from, fr, to, tr, record.type]);
  if (plannedPairs.has(key)) return { ...base, state: "CONFLICT" };
  if (a.targetId && b.targetId) {
    const active = await client.query(
      `SELECT id FROM business.thought_relation
      WHERE workspace_id=$1 AND from_unit_id=$2 AND from_revision=$3 AND to_unit_id=$4 AND to_revision=$5 AND type=$6 AND ended_at IS NULL`,
      [workspaceId, from, fr, to, tr, record.type],
    );
    if (active.rows[0]) return { ...base, state: "CONFLICT" };
  }
  plannedPairs.add(key);
  return { ...base, state: "NEW" };
}
