import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { validateSnapshot } from "@ieum/core";
import type { ValidatedSnapshot } from "@ieum/core";
import { withActivePersonalWorkspace } from "../identity-service.js";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class JudgementSnapshotError extends Error {
  constructor(
    public readonly code:
      "INVALID_REF" | "QUERY_UNAVAILABLE" | "SNAPSHOT_TOO_LARGE",
  ) {
    super(code);
  }
}

export interface BuiltSnapshot {
  raw: unknown;
  snapshot: ValidatedSnapshot;
  inputHash: string;
  asOfRecordedAt: number;
  profileState: "FRESH" | "LAGGING";
  loadedCounts: {
    captures: number;
    units: number;
    contexts: number;
    relations: number;
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("Invalid snapshot input");
}

export function hashSnapshotInput(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/** Build one current, scoped database view. The caller does feature work after this transaction commits. */
export async function buildJudgementSnapshot(
  pool: Pool,
  actorId: string,
  workspaceId: string,
  unitId: string,
  unitRevision: number,
): Promise<BuiltSnapshot> {
  if (
    !uuid.test(workspaceId) ||
    !uuid.test(unitId) ||
    !Number.isSafeInteger(unitRevision) ||
    unitRevision < 1
  )
    throw new JudgementSnapshotError("INVALID_REF");
  const raw = await withActivePersonalWorkspace(
    pool,
    actorId,
    async (client, access) => {
      if (access.workspaceId !== workspaceId)
        throw new JudgementSnapshotError("QUERY_UNAVAILABLE");
      const clock = await client.query<{ as_of: Date }>(
        "SELECT transaction_timestamp() AS as_of",
      );
      const asOf = clock.rows[0]!.as_of;
      const query = await client.query<{ id: string }>(
        `SELECT u.id FROM business.thought_unit u
         JOIN business.capture c ON c.workspace_id=u.workspace_id AND c.id=u.capture_id
         WHERE u.workspace_id=$1 AND u.id=$2 AND u.current_revision=$3
           AND u.state='ACTIVE' AND c.state='ACTIVE'`,
        [workspaceId, unitId, unitRevision],
      );
      if (!query.rows[0]) throw new JudgementSnapshotError("QUERY_UNAVAILABLE");

      const size = await client.query<{
        unit_count: string;
        unit_bytes: string;
        capture_bytes: string;
      }>(
        `WITH active_units AS (
           SELECT u.id,u.capture_id,u.capture_revision,u.current_revision
           FROM business.thought_unit u JOIN business.capture c
             ON c.workspace_id=u.workspace_id AND c.id=u.capture_id
           WHERE u.workspace_id=$1 AND u.state='ACTIVE' AND c.state='ACTIVE'
         )
         SELECT
           (SELECT count(*) FROM active_units u JOIN business.thought_unit_revision ur
              ON ur.workspace_id=$1 AND ur.unit_id=u.id AND ur.revision=u.current_revision
             WHERE ur.recorded_at<=$2)::bigint AS unit_count,
           (SELECT coalesce(sum(octet_length(ur.content_text)),0)
              FROM active_units u JOIN business.thought_unit_revision ur
                ON ur.workspace_id=$1 AND ur.unit_id=u.id AND ur.revision=u.current_revision
             WHERE ur.recorded_at<=$2)::bigint AS unit_bytes,
           (SELECT coalesce(sum(octet_length(cr.raw_body)),0)
              FROM business.capture_revision cr WHERE cr.workspace_id=$1
                AND cr.recorded_at<=$2 AND EXISTS (
                  SELECT 1 FROM active_units u
                  WHERE u.capture_id=cr.capture_id AND u.capture_revision=cr.revision
                ))::bigint AS capture_bytes`,
        [workspaceId, asOf],
      );
      const sizeRow = size.rows[0]!;
      if (
        Number(sizeRow.unit_count) > 5_000 ||
        Number(sizeRow.unit_bytes) > 32_000_000 ||
        Number(sizeRow.capture_bytes) > 32_000_000
      )
        throw new JudgementSnapshotError("SNAPSHOT_TOO_LARGE");

      const captures = await client.query<{
        capture_id: string;
        revision: number;
        raw_body: string;
        origin_key: string;
        state: string;
        version: number;
        recorded_at: Date;
      }>(
        `SELECT cr.capture_id,cr.revision,cr.raw_body,c.origin_key,c.state,c.version,cr.recorded_at
         FROM business.capture_revision cr JOIN business.capture c
           ON c.workspace_id=cr.workspace_id AND c.id=cr.capture_id
         WHERE EXISTS (
           SELECT 1 FROM business.thought_unit u
           WHERE u.workspace_id=cr.workspace_id AND u.capture_id=cr.capture_id
             AND u.capture_revision=cr.revision AND u.state='ACTIVE'
         )
           AND cr.workspace_id=$1 AND cr.recorded_at<=$2
           AND c.state='ACTIVE'
         ORDER BY cr.capture_id,cr.revision LIMIT 5001`,
        [workspaceId, asOf],
      );
      const units = await client.query<{
        unit_id: string;
        revision: number;
        capture_id: string;
        capture_revision: number;
        origin_key: string;
        source_start: number;
        source_end: number;
        content_kind: "quote" | "paraphrase";
        content_text: string;
        recorded_at: Date;
        state: string;
      }>(
        `SELECT ur.unit_id,ur.revision,ur.capture_id,ur.capture_revision,u.origin_key,
           ur.source_start,ur.source_end,ur.content_kind,ur.content_text,ur.recorded_at,u.state
         FROM business.thought_unit_revision ur JOIN business.thought_unit u
           ON u.workspace_id=ur.workspace_id AND u.id=ur.unit_id
         JOIN business.capture c ON c.workspace_id=u.workspace_id AND c.id=u.capture_id
         WHERE ur.workspace_id=$1 AND ur.recorded_at<=$2
           AND u.state='ACTIVE' AND c.state='ACTIVE' AND ur.revision=u.current_revision
         ORDER BY ur.unit_id,ur.revision LIMIT 5001`,
        [workspaceId, asOf],
      );
      const contexts = await client.query<{
        id: string;
        identity_revision: number;
        membership_revision: number;
        name: string;
        state: string;
      }>(
        `SELECT id,identity_revision,membership_revision,name,state
         FROM business.context WHERE workspace_id=$1 AND state='ACTIVE' ORDER BY id LIMIT 2001`,
        [workspaceId],
      );
      const memberships = await client.query<{
        context_id: string;
        unit_id: string;
        unit_revision: number;
      }>(
        `SELECT context_id,unit_id,unit_revision FROM business.context_membership
         WHERE workspace_id=$1 AND started_at<=$2 AND (ended_at IS NULL OR ended_at>$2)
         ORDER BY context_id,unit_id LIMIT 20001`,
        [workspaceId, asOf],
      );
      const invalidations = await client.query<{
        context_id: string;
        membership_revision: number;
      }>(
        `SELECT context_id,membership_revision FROM business.context_profile_invalidation
         WHERE workspace_id=$1`,
        [workspaceId],
      );
      const relations = await client.query<{
        id: string;
        from_unit_id: string;
        from_revision: number;
        to_unit_id: string;
        to_revision: number;
        started_at: Date;
        ended_at: Date | null;
      }>(
        `SELECT id,from_unit_id,from_revision,to_unit_id,to_revision,started_at,ended_at
         FROM business.thought_relation WHERE workspace_id=$1 AND started_at<=$2
           AND ended_at IS NULL
         ORDER BY id LIMIT 20001`,
        [workspaceId, asOf],
      );
      if (
        captures.rows.length > 5_000 ||
        units.rows.length > 5_000 ||
        contexts.rows.length > 2_000 ||
        memberships.rows.length > 20_000 ||
        relations.rows.length > 20_000
      )
        throw new JudgementSnapshotError("SNAPSHOT_TOO_LARGE");
      const includedUnitKeys = new Set(
        units.rows.map((row) => `${row.unit_id}:${row.revision}`),
      );
      const neededCaptureKeys = new Set(
        units.rows.map((row) => `${row.capture_id}:${row.capture_revision}`),
      );
      const includedCaptures = captures.rows.filter((row) =>
        neededCaptureKeys.has(`${row.capture_id}:${row.revision}`),
      );
      const includedContextIds = new Set(contexts.rows.map((row) => row.id));
      const memberByContext = new Map<
        string,
        { unitId: string; revision: number }[]
      >();
      for (const row of memberships.rows) {
        if (
          !includedContextIds.has(row.context_id) ||
          !includedUnitKeys.has(`${row.unit_id}:${row.unit_revision}`)
        )
          continue;
        const members = memberByContext.get(row.context_id) ?? [];
        members.push({ unitId: row.unit_id, revision: row.unit_revision });
        memberByContext.set(row.context_id, members);
      }
      const asOfRecordedAt = asOf.getTime();
      const includedRelations = relations.rows.filter(
        (row) =>
          includedUnitKeys.has(`${row.from_unit_id}:${row.from_revision}`) &&
          includedUnitKeys.has(`${row.to_unit_id}:${row.to_revision}`),
      );
      const invalidationByContext = new Map(
        invalidations.rows.map((row) => [
          row.context_id,
          row.membership_revision,
        ]),
      );
      const profileState: "FRESH" | "LAGGING" = contexts.rows.some(
        (row) =>
          row.membership_revision > 1 &&
          (invalidationByContext.get(row.id) ?? 0) < row.membership_revision,
      )
        ? "LAGGING"
        : "FRESH";
      const profileValue = createHash("sha256")
        .update(
          JSON.stringify({
            model: "lexical-v0",
            contexts: contexts.rows.map((row) => [
              row.id,
              row.identity_revision,
              row.membership_revision,
              row.name,
              row.state,
            ]),
            memberships: memberships.rows,
            units: units.rows.map((row) => [
              row.unit_id,
              row.revision,
              row.content_text,
              row.state,
            ]),
          }),
        )
        .digest("hex");
      return {
        workspaceId,
        asOfRecordedAt,
        query: { unitId, revision: unitRevision },
        captures: includedCaptures.map((row) => ({
          workspaceId,
          captureId: row.capture_id,
          revision: row.revision,
          rawBody: row.raw_body,
          originKey: row.origin_key,
          recordedAt: row.recorded_at.getTime(),
          occurredAt: null,
        })),
        units: units.rows.map((row) => ({
          workspaceId,
          unitId: row.unit_id,
          revision: row.revision,
          captureId: row.capture_id,
          captureRevision: row.capture_revision,
          originKey: row.origin_key,
          sourceSpan: {
            start: row.source_start,
            end: row.source_end,
            encoding: "utf16",
          },
          content: { kind: row.content_kind, text: row.content_text },
          recordedAt: row.recorded_at.getTime(),
        })),
        contexts: contexts.rows.map((row) => ({
          workspaceId,
          contextId: row.id,
          identityRevision: row.identity_revision,
          membershipRevision: row.membership_revision,
          name: row.name,
          recordedAt: asOfRecordedAt,
          memberUnits: memberByContext.get(row.id) ?? [],
        })),
        relations: includedRelations.map((row) => ({
          workspaceId,
          relationId: row.id,
          revision: 1,
          from: { unitId: row.from_unit_id, revision: row.from_revision },
          to: { unitId: row.to_unit_id, revision: row.to_revision },
          state: row.ended_at ? "deleted" : "active",
          recordedAt: row.started_at.getTime(),
        })),
        visibility: [],
        profileWatermarks: [
          {
            workspaceId,
            revision: 1,
            value: profileValue,
            recordedAt: asOfRecordedAt,
          },
        ],
        profileState,
      };
    },
    "REPEATABLE READ",
  );
  const inputHash = hashSnapshotInput(raw);
  const snapshot = validateSnapshot(raw, inputHash);
  return {
    raw,
    snapshot,
    inputHash,
    asOfRecordedAt: raw.asOfRecordedAt,
    profileState: raw.profileState,
    loadedCounts: {
      captures: raw.captures.length,
      units: raw.units.length,
      contexts: raw.contexts.length,
      relations: raw.relations.length,
    },
  };
}
