import type { Utf16Span } from "../snapshot.js";

/** Milliseconds since the Unix epoch, supplied by the caller. */
export type EpochMillis = number;

export type CaptureRevision = Readonly<{
  workspaceId: string;
  captureId: string;
  revision: number;
  rawBody: string;
  originKey: string;
  recordedAt: EpochMillis;
  occurredAt: EpochMillis | null;
}>;

export type UnitContent = Readonly<{
  kind: "quote" | "paraphrase";
  text: string;
}>;

export type ThoughtUnitRevision = Readonly<{
  workspaceId: string;
  unitId: string;
  revision: number;
  captureId: string;
  captureRevision: number;
  originKey: string;
  sourceSpan: Utf16Span;
  content: UnitContent;
  recordedAt: EpochMillis;
}>;

export type UnitRevisionRef = Readonly<{
  unitId: string;
  revision: number;
}>;

export type ContextSnapshot = Readonly<{
  workspaceId: string;
  contextId: string;
  identityRevision: number;
  membershipRevision: number;
  name: string;
  recordedAt: EpochMillis;
  memberUnits: readonly UnitRevisionRef[];
}>;

export type EvidenceRef = Readonly<{
  workspaceId: string;
  sourceKind: "unit";
  unitId: string;
  unitRevision: number;
  captureId: string;
  captureRevision: number;
  originKey: string;
  sourceSpan: Utf16Span;
  transform: "quote" | "paraphrase";
  text: string;
}>;
