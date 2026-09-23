/** Pure Core contracts and validation. */
export const CORE_PACKAGE_ID = "@ieum/core" as const;
export { sliceRawSpan } from "./snapshot.js";
export type { CoreCaptureSnapshot, Utf16Span } from "./snapshot.js";
export {
  createDefaultUnitRevision,
  parseCaptureRevision,
  parseContextSnapshot,
  parseEvidenceRef,
  parseThoughtUnitRevision,
  parseUnitRevisionSet,
} from "./model/validation.js";
export type {
  CaptureRevision,
  ContextSnapshot,
  EpochMillis,
  EvidenceRef,
  ThoughtUnitRevision,
  UnitContent,
  UnitRevisionRef,
} from "./model/types.js";
