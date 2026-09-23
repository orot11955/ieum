import type {
  CandidateEvaluation,
  EvaluatedFeature,
  MemberMeasurement,
} from "../evaluation/index.js";
import type { PolicyDecision } from "../policy/index.js";
import type {
  RetrievalResult,
  RetrievedCandidate,
  RetrievalSource,
  SourceRank,
} from "../retrieval/index.js";
import type { CandidateScore } from "../scoring/index.js";

export type FeatureTrace = Readonly<{
  availability: EvaluatedFeature["availability"];
  value: number | null;
  reason: string | null;
  memberEvidence: readonly MemberMeasurement[];
}>;

export type CandidateExplanation = Readonly<{
  summary: string;
  reasons: PolicyDecision["reasons"];
  profileId: string;
  policyVersion: string;
  features: Readonly<{
    identity: FeatureTrace;
    member: FeatureTrace;
    lexical: FeatureTrace;
    semantic: FeatureTrace;
  }>;
  sourceRanks: Readonly<{
    identity: SourceRank | null;
    member: SourceRank | null;
  }>;
  sourceErrors: readonly Readonly<{ source: RetrievalSource; code: string }>[];
  retrievalTruncated: boolean;
}>;

/** Fixed wording and trace fields only; no inferred meaning, truth, or probability. */
export function explainCandidate(
  candidate: RetrievedCandidate,
  evaluation: CandidateEvaluation,
  score: CandidateScore,
  decision: PolicyDecision,
  retrieval: RetrievalResult,
  policyVersion: string,
): CandidateExplanation {
  const summary =
    decision.status === "abstain"
      ? "측정 가능한 내용 근거가 없어 판단을 보류했습니다."
      : score.contentScore === 0
        ? "내용 유사도가 0으로 측정됐습니다. 수동 검토가 필요합니다."
        : "내용 유사도가 측정됐습니다. 수동 검토가 필요합니다.";
  const trace = (feature: EvaluatedFeature): FeatureTrace => ({
    availability: feature.availability,
    value: feature.value,
    reason: feature.reason,
    memberEvidence: feature.memberEvidence,
  });
  return {
    summary,
    reasons: decision.reasons,
    profileId: score.config.profileId,
    policyVersion,
    features: {
      identity: trace(evaluation.identity),
      member: trace(evaluation.member),
      lexical: trace(evaluation.lexical),
      semantic: trace(evaluation.semantic),
    },
    sourceRanks: candidate.sourceRanks,
    sourceErrors: retrieval.sources
      .filter((source) => source.status === "error")
      .map((source) => ({ source: source.source, code: source.errorCode! })),
    retrievalTruncated: retrieval.truncated,
  };
}
