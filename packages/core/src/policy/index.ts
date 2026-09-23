import type { CandidateScore } from "../scoring/index.js";

export type PolicyConfig = Readonly<{
  version: string;
  mode: "observe" | "suggest";
  suggestionThresholds: Readonly<{
    contentFloor: number;
    minimumCoverage: number;
    rankScore: number;
  }> | null;
  selectPrimary: boolean;
  automaticMutation: boolean;
}>;

export const OBSERVE_POLICY_CONFIG: PolicyConfig = Object.freeze({
  version: "observe-v1",
  mode: "observe",
  suggestionThresholds: null,
  selectPrimary: false,
  automaticMutation: false,
});

export type PolicyReason =
  "NO_CONTENT_EVIDENCE" | "OBSERVE_MODE" | "MEASURED_ZERO" | "PARTIAL_COVERAGE";

export type PolicyDecision = Readonly<{
  status: "candidate" | "abstain";
  reasons: readonly PolicyReason[];
  primaryContextId: null;
  proposal: null;
}>;

export function validatePolicyConfig(config: PolicyConfig): void {
  if (!/^[a-z][a-z0-9-]*$/.test(config.version)) {
    throw new RangeError("policy config requires a stable version");
  }
  if (
    config.mode !== "observe" ||
    config.suggestionThresholds !== null ||
    config.selectPrimary !== false ||
    config.automaticMutation !== false
  ) {
    throw new RangeError(
      "only observe mode with null thresholds and no automatic action is enabled",
    );
  }
}

/** The first policy only exposes candidate or abstain; it never suggests or mutates. */
export function resolvePolicy(
  score: CandidateScore,
  config: PolicyConfig = OBSERVE_POLICY_CONFIG,
): PolicyDecision {
  validatePolicyConfig(config);
  if (
    !Number.isFinite(score.coverage) ||
    score.coverage < 0 ||
    score.coverage > 1
  ) {
    throw new RangeError("policy received invalid coverage");
  }
  if (score.coverage === 0) {
    if (score.contentScore !== null || score.rankScore !== null) {
      throw new RangeError("zero coverage cannot carry a score");
    }
    return {
      status: "abstain",
      reasons: ["NO_CONTENT_EVIDENCE"],
      primaryContextId: null,
      proposal: null,
    };
  }
  if (
    score.contentScore === null ||
    score.rankScore === null ||
    !Number.isFinite(score.contentScore) ||
    score.contentScore < 0 ||
    score.contentScore > 1 ||
    !Number.isFinite(score.rankScore) ||
    score.rankScore < 0 ||
    score.rankScore > 1
  ) {
    throw new RangeError("policy received invalid score values");
  }
  const reasons: PolicyReason[] = ["OBSERVE_MODE"];
  if (score.contentScore === 0) reasons.push("MEASURED_ZERO");
  if (score.coverage < 1) reasons.push("PARTIAL_COVERAGE");
  return {
    status: "candidate",
    reasons,
    primaryContextId: null,
    proposal: null,
  };
}
