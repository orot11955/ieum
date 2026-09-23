import { evaluateCandidate } from "../evaluation/index.js";
import type {
  CandidateEvaluation,
  CandidateMeasurements,
} from "../evaluation/index.js";
import { explainCandidate } from "../explanation/index.js";
import type { CandidateExplanation } from "../explanation/index.js";
import {
  OBSERVE_POLICY_CONFIG,
  resolvePolicy,
  validatePolicyConfig,
} from "../policy/index.js";
import type { PolicyConfig, PolicyDecision } from "../policy/index.js";
import type {
  RetrievalResult,
  RetrievedCandidate,
} from "../retrieval/index.js";
import {
  LEXICAL_SCORE_CONFIG,
  scoreCandidate,
  validateScoreConfig,
} from "../scoring/index.js";
import type { CandidateScore, ScoreConfig } from "../scoring/index.js";
import type { ValidatedSnapshot } from "../snapshot/types.js";

export type CandidateJudgement = Readonly<{
  /** Rank after content scoring; candidate.rank keeps the retrieval rank. */
  rank: number;
  candidate: RetrievedCandidate;
  evaluation: CandidateEvaluation;
  score: CandidateScore;
  decision: PolicyDecision;
  explanation: CandidateExplanation;
}>;

export type ObserveJudgement = Readonly<{
  snapshotInputHash: string;
  mode: "observe";
  profileId: string;
  policyVersion: string;
  status: "candidate" | "abstain";
  reason: "OBSERVE_MODE" | "NO_CANDIDATES" | "NO_CONTENT_EVIDENCE";
  matchProbability: null;
  primaryContextId: null;
  proposals: readonly [];
  retrieval: RetrievalResult;
  candidates: readonly CandidateJudgement[];
}>;

/** Evaluate → score → resolve observe policy → explain, without a write path. */
export function runObserveJudgement(
  snapshot: ValidatedSnapshot,
  retrieval: RetrievalResult,
  measurements: ReadonlyMap<string, CandidateMeasurements>,
  scoreConfig: ScoreConfig = LEXICAL_SCORE_CONFIG,
  policyConfig: PolicyConfig = OBSERVE_POLICY_CONFIG,
): ObserveJudgement {
  validateScoreConfig(scoreConfig);
  validatePolicyConfig(policyConfig);
  if (
    scoreConfig.version !== LEXICAL_SCORE_CONFIG.version ||
    scoreConfig.profileId !== LEXICAL_SCORE_CONFIG.profileId ||
    scoreConfig.weights.lexical !== 1 ||
    scoreConfig.weights.semantic !== 0
  ) {
    throw new RangeError(
      "only the lexical-v0 profile is active in observe runs",
    );
  }
  if (snapshot.manifest.inputHash !== retrieval.snapshotInputHash) {
    throw new RangeError("retrieval and snapshot input hashes differ");
  }
  if (
    retrieval.returnedContextCount !== retrieval.candidates.length ||
    (retrieval.status === "no_candidates") !==
      (retrieval.candidates.length === 0)
  ) {
    throw new RangeError("retrieval candidate count and status disagree");
  }
  const candidateIds = new Set(
    retrieval.candidates.map((candidate) => candidate.contextId),
  );
  if (candidateIds.size !== retrieval.candidates.length) {
    throw new RangeError("retrieval contains duplicate contexts");
  }
  for (const contextId of measurements.keys()) {
    if (!candidateIds.has(contextId)) {
      throw new RangeError(
        "measurement references a context outside retrieval",
      );
    }
    if (measurements.get(contextId)?.semantic.availability === "available") {
      throw new RangeError(
        "semantic measurements have no active provider in observe runs",
      );
    }
  }
  const scored = retrieval.candidates.map(
    (candidate, index): Omit<CandidateJudgement, "rank"> => {
      if (candidate.rank !== index + 1) {
        throw new RangeError("retrieval candidate ranks must be consecutive");
      }
      const evaluation = evaluateCandidate(
        snapshot,
        candidate,
        measurements.get(candidate.contextId),
      );
      const score = scoreCandidate(evaluation, scoreConfig);
      const decision = resolvePolicy(score, policyConfig);
      const explanation = explainCandidate(
        candidate,
        evaluation,
        score,
        decision,
        retrieval,
        policyConfig.version,
      );
      return { candidate, evaluation, score, decision, explanation };
    },
  );
  const candidates: CandidateJudgement[] = scored
    .sort((a, b) => {
      const aScore = a.score.rankScore ?? -1;
      const bScore = b.score.rankScore ?? -1;
      if (aScore !== bScore) return bScore - aScore;
      return a.candidate.contextId < b.candidate.contextId
        ? -1
        : a.candidate.contextId > b.candidate.contextId
          ? 1
          : 0;
    })
    .map((item, index) => ({ ...item, rank: index + 1 }));
  const hasCandidate = candidates.some(
    (item) => item.decision.status === "candidate",
  );
  return {
    snapshotInputHash: snapshot.manifest.inputHash,
    mode: "observe",
    profileId: scoreConfig.profileId,
    policyVersion: policyConfig.version,
    status: hasCandidate ? "candidate" : "abstain",
    reason: hasCandidate
      ? "OBSERVE_MODE"
      : candidates.length === 0
        ? "NO_CANDIDATES"
        : "NO_CONTENT_EVIDENCE",
    matchProbability: null,
    primaryContextId: null,
    proposals: [],
    retrieval,
    candidates,
  };
}
