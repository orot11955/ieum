import type {
  CaptureRevision,
  ContextSnapshot,
  ThoughtUnitRevision,
  UnitRevisionRef,
} from "../model/types.js";

export type RelationRevision = Readonly<{
  workspaceId: string;
  relationId: string;
  revision: number;
  from: UnitRevisionRef;
  to: UnitRevisionRef;
  state: "active" | "deleted";
  recordedAt: number;
}>;

export type VisibilityRevision = Readonly<{
  workspaceId: string;
  kind: "capture" | "unit" | "context";
  resourceId: string;
  revision: number;
  state: "active" | "deleted";
  recordedAt: number;
}>;

export type ProfileWatermarkRevision = Readonly<{
  workspaceId: string;
  revision: number;
  value: string;
  recordedAt: number;
}>;

export type SnapshotExclusion = Readonly<{
  kind: "capture" | "unit" | "context" | "relation";
  id: string;
  revision: number;
  membershipRevision?: number;
  reason:
    | "future_revision"
    | "deleted"
    | "query"
    | "same_origin"
    | "endpoint_ineligible";
}>;

export type SnapshotManifest = Readonly<{
  inputHash: string;
  workspaceId: string;
  asOfRecordedAt: number;
  query: Readonly<{ unitId: string; revision: number; originKey: string }>;
  profileWatermark: Readonly<{ revision: number; value: string }> | null;
  sortRule: "id-then-revision-v1";
  captureRevisions: readonly Readonly<{
    captureId: string;
    revision: number;
  }>[];
  eligibleUnits: readonly UnitRevisionRef[];
  eligibleContexts: readonly Readonly<{
    contextId: string;
    identityRevision: number;
    membershipRevision: number;
  }>[];
  eligibleRelations: readonly Readonly<{
    relationId: string;
    revision: number;
  }>[];
  exclusions: readonly SnapshotExclusion[];
}>;

export type ValidatedSnapshot = Readonly<{
  query: ThoughtUnitRevision;
  captures: readonly CaptureRevision[];
  units: readonly ThoughtUnitRevision[];
  contexts: readonly ContextSnapshot[];
  relations: readonly RelationRevision[];
  manifest: SnapshotManifest;
}>;
