/** Pure Core contracts and validation. */
export const CORE_PACKAGE_ID = "@ieum/core" as const;
export {
  computeLexicalFeatures,
  LEXICAL_CONFIG,
  normalizeLexicalText,
  tokenizeLexicalText,
} from "./features/lexical/index.js";
export type {
  LexicalCandidateFeature,
  LexicalConfig,
  LexicalFeatures,
} from "./features/lexical/index.js";
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
export { validateSnapshot } from "./snapshot/validator.js";
export type {
  ProfileWatermarkRevision,
  RelationRevision,
  SnapshotExclusion,
  SnapshotManifest,
  ValidatedSnapshot,
  VisibilityRevision,
} from "./snapshot/types.js";
