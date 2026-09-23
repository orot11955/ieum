import {
  parseCaptureRevision,
  parseContextSnapshot,
  parseThoughtUnitRevision,
} from "../model/validation.js";
import type {
  ContextSnapshot,
  ThoughtUnitRevision,
  UnitRevisionRef,
} from "../model/types.js";
import type {
  ProfileWatermarkRevision,
  RelationRevision,
  SnapshotExclusion,
  ValidatedSnapshot,
  VisibilityRevision,
} from "./types.js";

type Versioned = Readonly<{ revision: number; recordedAt: number }>;

function object(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return value;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function revision(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function recordedAt(value: unknown, name: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Math.abs(value) > 8_640_000_000_000_000
  ) {
    throw new RangeError(`${name} must be a representable epoch millisecond`);
  }
  return value;
}

function unitRef(value: unknown, name: string): UnitRevisionRef {
  const input = object(value, name);
  return Object.freeze({
    unitId: string(input.unitId, `${name}.unitId`),
    revision: revision(input.revision, `${name}.revision`),
  });
}

function parseRelation(value: unknown): RelationRevision {
  const input = object(value, "RelationRevision");
  if (input.state !== "active" && input.state !== "deleted") {
    throw new TypeError("Relation state must be active or deleted");
  }
  return Object.freeze({
    workspaceId: string(input.workspaceId, "workspaceId"),
    relationId: string(input.relationId, "relationId"),
    revision: revision(input.revision, "relation revision"),
    from: unitRef(input.from, "relation.from"),
    to: unitRef(input.to, "relation.to"),
    state: input.state,
    recordedAt: recordedAt(input.recordedAt, "relation recordedAt"),
  });
}

function parseVisibility(value: unknown): VisibilityRevision {
  const input = object(value, "VisibilityRevision");
  if (
    input.kind !== "capture" &&
    input.kind !== "unit" &&
    input.kind !== "context"
  ) {
    throw new TypeError("Visibility kind must be capture, unit, or context");
  }
  if (input.state !== "active" && input.state !== "deleted") {
    throw new TypeError("Visibility state must be active or deleted");
  }
  return Object.freeze({
    workspaceId: string(input.workspaceId, "workspaceId"),
    kind: input.kind,
    resourceId: string(input.resourceId, "resourceId"),
    revision: revision(input.revision, "visibility revision"),
    state: input.state,
    recordedAt: recordedAt(input.recordedAt, "visibility recordedAt"),
  });
}

function parseWatermark(value: unknown): ProfileWatermarkRevision {
  const input = object(value, "ProfileWatermarkRevision");
  return Object.freeze({
    workspaceId: string(input.workspaceId, "workspaceId"),
    revision: revision(input.revision, "profile revision"),
    value: string(input.value, "profile watermark"),
    recordedAt: recordedAt(input.recordedAt, "profile recordedAt"),
  });
}

function sameWorkspace<T extends { workspaceId: string }>(
  records: readonly T[],
  workspaceId: string,
): readonly T[] {
  if (records.some((record) => record.workspaceId !== workspaceId)) {
    throw new RangeError("Snapshot input contains another workspace");
  }
  return records;
}

function checkHistory<T extends Versioned>(
  records: readonly T[],
  key: (record: T) => string,
  name: string,
): void {
  const byId = new Map<string, T[]>();
  for (const record of records) {
    const id = key(record);
    const entries = byId.get(id) ?? [];
    entries.push(record);
    byId.set(id, entries);
  }
  for (const entries of byId.values()) {
    entries.sort((a, b) => a.revision - b.revision);
    for (let index = 1; index < entries.length; index += 1) {
      const previous = entries[index - 1];
      const current = entries[index];
      if (
        previous === undefined ||
        current === undefined ||
        previous.revision === current.revision ||
        previous.recordedAt > current.recordedAt
      ) {
        throw new RangeError(`${name} has a duplicate or reordered revision`);
      }
    }
  }
}

function latestAt<T extends Versioned>(
  records: readonly T[],
  key: (record: T) => string,
  asOf: number,
): Map<string, T> {
  const selected = new Map<string, T>();
  for (const record of records) {
    if (record.recordedAt > asOf) continue;
    const id = key(record);
    const previous = selected.get(id);
    if (previous === undefined || previous.revision < record.revision) {
      selected.set(id, record);
    }
  }
  return selected;
}

function checkContextHistory(contexts: readonly ContextSnapshot[]): void {
  const byId = new Map<string, ContextSnapshot[]>();
  for (const context of contexts) {
    const entries = byId.get(context.contextId) ?? [];
    entries.push(context);
    byId.set(context.contextId, entries);
  }
  for (const entries of byId.values()) {
    entries.sort(
      (a, b) =>
        a.recordedAt - b.recordedAt ||
        a.identityRevision - b.identityRevision ||
        a.membershipRevision - b.membershipRevision,
    );
    for (let index = 1; index < entries.length; index += 1) {
      const previous = entries[index - 1];
      const current = entries[index];
      if (
        previous === undefined ||
        current === undefined ||
        (previous.identityRevision === current.identityRevision &&
          previous.membershipRevision === current.membershipRevision) ||
        previous.identityRevision > current.identityRevision ||
        previous.membershipRevision > current.membershipRevision
      ) {
        throw new RangeError("Context has a duplicate or reordered revision");
      }
    }
  }
}

function latestContextAt(
  contexts: readonly ContextSnapshot[],
  asOf: number,
): Map<string, ContextSnapshot> {
  const selected = new Map<string, ContextSnapshot>();
  for (const context of contexts) {
    if (context.recordedAt > asOf) continue;
    const previous = selected.get(context.contextId);
    if (
      previous === undefined ||
      previous.recordedAt < context.recordedAt ||
      (previous.recordedAt === context.recordedAt &&
        (previous.identityRevision < context.identityRevision ||
          previous.membershipRevision < context.membershipRevision))
    ) {
      selected.set(context.contextId, context);
    }
  }
  return selected;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function refKey(ref: UnitRevisionRef): string {
  return `${ref.unitId}\u0000${ref.revision}`;
}

/** Validates a single-workspace, complete revision history without doing I/O. */
export function validateSnapshot(
  value: unknown,
  inputHash: string,
): ValidatedSnapshot {
  if (!/^[0-9a-f]{64}$/.test(inputHash)) {
    throw new TypeError("inputHash must be a lowercase SHA-256 digest");
  }
  const input = object(value, "SnapshotInput");
  const workspaceId = string(input.workspaceId, "workspaceId");
  const asOf = recordedAt(input.asOfRecordedAt, "asOfRecordedAt");
  const queryRef = unitRef(input.query, "query");

  const captures = sameWorkspace(
    array(input.captures, "captures").map(parseCaptureRevision),
    workspaceId,
  );
  checkHistory(captures, (capture) => capture.captureId, "Capture");
  const captureOrigins = new Map<string, string>();
  for (const capture of captures) {
    const origin = captureOrigins.get(capture.captureId);
    if (origin !== undefined && origin !== capture.originKey) {
      throw new RangeError("Capture origin changed across revisions");
    }
    captureOrigins.set(capture.captureId, capture.originKey);
  }
  const captureByRevision = new Map(
    captures.map((capture) => [
      `${capture.captureId}\u0000${capture.revision}`,
      capture,
    ]),
  );

  const units = sameWorkspace(
    array(input.units, "units").map((value) => {
      const raw = object(value, "ThoughtUnitRevision");
      const capture = captureByRevision.get(
        `${string(raw.captureId, "captureId")}\u0000${revision(raw.captureRevision, "captureRevision")}`,
      );
      if (capture === undefined) {
        throw new RangeError("Unit has no matching Capture revision");
      }
      return parseThoughtUnitRevision(value, capture);
    }),
    workspaceId,
  );
  checkHistory(units, (unit) => unit.unitId, "Unit");
  const unitSources = new Map<string, string>();
  for (const unit of units) {
    const source = `${unit.captureId}\u0000${unit.originKey}`;
    const previous = unitSources.get(unit.unitId);
    if (previous !== undefined && previous !== source) {
      throw new RangeError("Unit source changed across revisions");
    }
    unitSources.set(unit.unitId, source);
  }
  const unitByRevision = new Map(units.map((unit) => [refKey(unit), unit]));

  const contexts = sameWorkspace(
    array(input.contexts, "contexts").map((value) =>
      parseContextSnapshot(value, units),
    ),
    workspaceId,
  );
  checkContextHistory(contexts);

  const relations = sameWorkspace(
    array(input.relations, "relations").map(parseRelation),
    workspaceId,
  );
  checkHistory(relations, (relation) => relation.relationId, "Relation");
  const relationEndpoints = new Map<string, string>();
  for (const relation of relations) {
    const endpoints = `${relation.from.unitId}\u0000${relation.to.unitId}`;
    const previous = relationEndpoints.get(relation.relationId);
    if (previous !== undefined && previous !== endpoints) {
      throw new RangeError("Relation endpoints changed across revisions");
    }
    relationEndpoints.set(relation.relationId, endpoints);
    for (const ref of [relation.from, relation.to]) {
      const unit = unitByRevision.get(refKey(ref));
      if (unit === undefined || unit.recordedAt > relation.recordedAt) {
        throw new RangeError("Relation has no recorded Unit revision endpoint");
      }
    }
  }

  const visibility = sameWorkspace(
    array(input.visibility, "visibility").map(parseVisibility),
    workspaceId,
  );
  checkHistory(
    visibility,
    (entry) => `${entry.kind}\u0000${entry.resourceId}`,
    "Visibility",
  );
  const watermarks = sameWorkspace(
    array(input.profileWatermarks, "profileWatermarks").map(parseWatermark),
    workspaceId,
  );
  checkHistory(watermarks, () => "profile", "Profile watermark");

  const latestVisibility = latestAt(
    visibility,
    (entry) => `${entry.kind}\u0000${entry.resourceId}`,
    asOf,
  );
  const deleted = (kind: VisibilityRevision["kind"], id: string) =>
    latestVisibility.get(`${kind}\u0000${id}`)?.state === "deleted";

  const query = unitByRevision.get(refKey(queryRef));
  if (
    query === undefined ||
    query.recordedAt > asOf ||
    deleted("unit", query.unitId) ||
    deleted("capture", query.captureId)
  ) {
    throw new RangeError(
      "Query Unit revision is unavailable at asOfRecordedAt",
    );
  }

  const exclusions: SnapshotExclusion[] = [];
  const future = <T extends { recordedAt: number }>(
    kind: SnapshotExclusion["kind"],
    entries: readonly T[],
    id: (entry: T) => string,
    version: (entry: T) => number,
  ) => {
    for (const entry of entries) {
      if (entry.recordedAt > asOf) {
        exclusions.push({
          kind,
          id: id(entry),
          revision: version(entry),
          reason: "future_revision",
        });
      }
    }
  };
  future(
    "capture",
    captures,
    (entry) => entry.captureId,
    (entry) => entry.revision,
  );
  future(
    "unit",
    units,
    (entry) => entry.unitId,
    (entry) => entry.revision,
  );
  for (const context of contexts) {
    if (context.recordedAt > asOf) {
      exclusions.push({
        kind: "context",
        id: context.contextId,
        revision: context.identityRevision,
        membershipRevision: context.membershipRevision,
        reason: "future_revision",
      });
    }
  }
  future(
    "relation",
    relations,
    (entry) => entry.relationId,
    (entry) => entry.revision,
  );

  const eligibleUnits: ThoughtUnitRevision[] = [];
  for (const unit of latestAt(units, (item) => item.unitId, asOf).values()) {
    const reason =
      unit.unitId === query.unitId
        ? "query"
        : unit.originKey === query.originKey
          ? "same_origin"
          : deleted("unit", unit.unitId) || deleted("capture", unit.captureId)
            ? "deleted"
            : null;
    if (reason !== null) {
      exclusions.push({
        kind: "unit",
        id: unit.unitId,
        revision: unit.revision,
        reason,
      });
    } else {
      eligibleUnits.push(unit);
    }
  }
  eligibleUnits.sort((a, b) => compare(a.unitId, b.unitId));
  const eligibleUnitKeys = new Set(eligibleUnits.map(refKey));
  const eligibleUnitById = new Map(
    eligibleUnits.map((unit) => [unit.unitId, unit]),
  );

  const eligibleContexts: ContextSnapshot[] = [];
  for (const context of latestContextAt(contexts, asOf).values()) {
    if (deleted("context", context.contextId)) {
      exclusions.push({
        kind: "context",
        id: context.contextId,
        revision: context.identityRevision,
        membershipRevision: context.membershipRevision,
        reason: "deleted",
      });
      continue;
    }
    const memberUnits = context.memberUnits
      .flatMap((ref) => {
        const selected = eligibleUnitById.get(ref.unitId);
        return selected === undefined
          ? []
          : [
              Object.freeze({
                unitId: selected.unitId,
                revision: selected.revision,
              }),
            ];
      })
      .sort((a, b) => compare(a.unitId, b.unitId));
    eligibleContexts.push(
      Object.freeze({
        ...context,
        recordedAt: asOf,
        memberUnits: Object.freeze(memberUnits),
      }),
    );
  }
  eligibleContexts.sort((a, b) => compare(a.contextId, b.contextId));

  const eligibleRelations: RelationRevision[] = [];
  for (const relation of latestAt(
    relations,
    (item) => item.relationId,
    asOf,
  ).values()) {
    const reason =
      relation.state === "deleted"
        ? "deleted"
        : !eligibleUnitKeys.has(refKey(relation.from)) ||
            !eligibleUnitKeys.has(refKey(relation.to))
          ? "endpoint_ineligible"
          : null;
    if (reason !== null) {
      exclusions.push({
        kind: "relation",
        id: relation.relationId,
        revision: relation.revision,
        reason,
      });
    } else {
      eligibleRelations.push(relation);
    }
  }
  eligibleRelations.sort((a, b) => compare(a.relationId, b.relationId));

  const captureKeys = new Set(
    [query, ...eligibleUnits].map(
      (unit) => `${unit.captureId}\u0000${unit.captureRevision}`,
    ),
  );
  const selectedCaptures = captures
    .filter((capture) =>
      captureKeys.has(`${capture.captureId}\u0000${capture.revision}`),
    )
    .sort(
      (a, b) => compare(a.captureId, b.captureId) || a.revision - b.revision,
    );
  exclusions.sort(
    (a, b) =>
      compare(a.kind, b.kind) ||
      compare(a.id, b.id) ||
      a.revision - b.revision ||
      (a.membershipRevision ?? 0) - (b.membershipRevision ?? 0) ||
      compare(a.reason, b.reason),
  );
  const watermark = latestAt(watermarks, () => "profile", asOf).get("profile");

  return Object.freeze({
    query,
    captures: Object.freeze(selectedCaptures),
    units: Object.freeze(eligibleUnits),
    contexts: Object.freeze(eligibleContexts),
    relations: Object.freeze(eligibleRelations),
    manifest: Object.freeze({
      inputHash,
      workspaceId,
      asOfRecordedAt: asOf,
      query: Object.freeze({
        unitId: query.unitId,
        revision: query.revision,
        originKey: query.originKey,
      }),
      profileWatermark:
        watermark === undefined
          ? null
          : Object.freeze({
              revision: watermark.revision,
              value: watermark.value,
            }),
      sortRule: "id-then-revision-v1" as const,
      captureRevisions: Object.freeze(
        selectedCaptures.map((capture) =>
          Object.freeze({
            captureId: capture.captureId,
            revision: capture.revision,
          }),
        ),
      ),
      eligibleUnits: Object.freeze(
        eligibleUnits.map((unit) =>
          Object.freeze({ unitId: unit.unitId, revision: unit.revision }),
        ),
      ),
      eligibleContexts: Object.freeze(
        eligibleContexts.map((context) =>
          Object.freeze({
            contextId: context.contextId,
            identityRevision: context.identityRevision,
            membershipRevision: context.membershipRevision,
          }),
        ),
      ),
      eligibleRelations: Object.freeze(
        eligibleRelations.map((relation) =>
          Object.freeze({
            relationId: relation.relationId,
            revision: relation.revision,
          }),
        ),
      ),
      exclusions: Object.freeze(
        exclusions.map((entry) => Object.freeze(entry)),
      ),
    }),
  });
}
