/** Pure Core contracts and validation. */
export const CORE_PACKAGE_ID = "@ieum/core" as const;
export {
  createEvidencePack,
  PACK_SECTIONS,
} from "./derivation/evidence-pack/index.js";
export type {
  EvidencePack,
  EvidencePackRequest,
  PackSection,
  PackSelection,
  PackSource,
} from "./derivation/evidence-pack/index.js";
export {
  computeLexicalFeatures,
  LEXICAL_CONFIG,
  normalizeLexicalText,
  scoreLexicalText,
  tokenizeLexicalText,
} from "./features/lexical/index.js";
export type {
  LexicalCandidateFeature,
  LexicalConfig,
  LexicalCorpus,
  LexicalFeatures,
} from "./features/lexical/index.js";
export {
  cosineSimilarity,
  rankSemanticSnapshot,
} from "./features/semantic/index.js";
export type {
  SemanticHit,
  SemanticSpace,
  SemanticVectors,
} from "./features/semantic/index.js";
export { evaluateCandidate, NOT_MEASURED_INPUTS } from "./evaluation/index.js";
export type {
  Availability,
  CandidateEvaluation,
  CandidateMeasurements,
  EvaluatedFeature,
  MemberInput,
  MemberMeasurement,
  SignalInput,
} from "./evaluation/index.js";
export { explainCandidate } from "./explanation/index.js";
export type {
  CandidateExplanation,
  FeatureTrace,
} from "./explanation/index.js";
export { runObserveJudgement } from "./judgement/index.js";
export type {
  CandidateJudgement,
  ObserveJudgement,
} from "./judgement/index.js";
export {
  OBSERVE_POLICY_CONFIG,
  resolvePolicy,
  validatePolicyConfig,
} from "./policy/index.js";
export type {
  PolicyConfig,
  PolicyDecision,
  PolicyReason,
} from "./policy/index.js";
export {
  RETRIEVAL_CONFIG,
  resolveExplicitContext,
  retrieveCandidates,
} from "./retrieval/index.js";
export type {
  IdentityHit,
  MemberEvidence,
  MemberHit,
  RetrievalBudget,
  RetrievalResult,
  RetrievalSources,
  RetrievedCandidate,
  SourceReport,
  SourceResult,
} from "./retrieval/index.js";
export {
  LEXICAL_SCORE_CONFIG,
  NO_AUXILIARY_SIGNALS,
  scoreCandidate,
  validateScoreConfig,
} from "./scoring/index.js";
export type {
  AuxiliarySignals,
  CandidateScore,
  ScoreConfig,
} from "./scoring/index.js";
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
