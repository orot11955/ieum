import type {
  CandidateEvaluation,
  EvaluatedFeature,
} from "../evaluation/index.js";

export type ScoreConfig = Readonly<{
  version: string;
  profileId: string;
  weights: Readonly<{ lexical: number; semantic: number }>;
  auxiliaryWeights: Readonly<{
    graph: number;
    session: number;
    recency: number;
  }>;
}>;

export const LEXICAL_SCORE_CONFIG: ScoreConfig = Object.freeze({
  version: "content-score-v1",
  profileId: "lexical-v0",
  weights: Object.freeze({ lexical: 1, semantic: 0 }),
  auxiliaryWeights: Object.freeze({ graph: 0, session: 0, recency: 0 }),
});
export const HYBRID_SCORE_CONFIG: ScoreConfig = Object.freeze({
  version: "content-score-v1",
  profileId: "hybrid-v0",
  weights: Object.freeze({ lexical: 0.5, semantic: 0.5 }),
  auxiliaryWeights: Object.freeze({ graph: 0, session: 0, recency: 0 }),
});

export type AuxiliarySignals = Readonly<{
  graph: number | null;
  session: number | null;
  recency: number | null;
}>;

export const NO_AUXILIARY_SIGNALS: AuxiliarySignals = Object.freeze({
  graph: null,
  session: null,
  recency: null,
});

export type CandidateScore = Readonly<{
  config: ScoreConfig;
  contentScore: number | null;
  coverage: number;
  /** Diagnostic only; never substituted for contentScore. */
  observedMean: number | null;
  rankScore: number | null;
  matchProbability: null;
}>;

function unitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validateScoreConfig(config: ScoreConfig): void {
  if (
    !/^[a-z][a-z0-9-]*$/.test(config.version) ||
    !/^[a-z][a-z0-9-]*$/.test(config.profileId)
  ) {
    throw new RangeError(
      "score config requires stable version and profile IDs",
    );
  }
  const { lexical, semantic } = config.weights;
  if (
    !unitInterval(lexical) ||
    !unitInterval(semantic) ||
    lexical + semantic !== 1
  ) {
    throw new RangeError(
      "content weights must be finite, nonnegative, and sum to one",
    );
  }
  if (Object.values(config.auxiliaryWeights).some((weight) => weight !== 0)) {
    throw new RangeError(
      "graph, session, and recency boosts are disabled in observe baseline",
    );
  }
}

function validateFeature(feature: EvaluatedFeature): void {
  if (feature.availability === "available") {
    if (feature.value === null || !unitInterval(feature.value)) {
      throw new RangeError("available feature must have a finite [0,1] value");
    }
  } else if (feature.value !== null) {
    throw new RangeError("unavailable feature cannot carry a measured value");
  }
}

function validateAuxiliary(signals: AuxiliarySignals): void {
  for (const value of Object.values(signals)) {
    if (value !== null && !unitInterval(value)) {
      throw new RangeError(
        "auxiliary signal must be null or finite within [0,1]",
      );
    }
  }
}

/** Fixed-weight content score. Missing feature weights are never redistributed. */
export function scoreCandidate(
  evaluation: CandidateEvaluation,
  config: ScoreConfig = LEXICAL_SCORE_CONFIG,
  auxiliary: AuxiliarySignals = NO_AUXILIARY_SIGNALS,
): CandidateScore {
  validateScoreConfig(config);
  validateAuxiliary(auxiliary);
  validateFeature(evaluation.lexical);
  validateFeature(evaluation.semantic);
  const fixedConfig: ScoreConfig = Object.freeze({
    version: config.version,
    profileId: config.profileId,
    weights: Object.freeze({ ...config.weights }),
    auxiliaryWeights: Object.freeze({ ...config.auxiliaryWeights }),
  });
  const lexicalAvailable = evaluation.lexical.availability === "available";
  const semanticAvailable = evaluation.semantic.availability === "available";
  const coverage =
    (lexicalAvailable ? fixedConfig.weights.lexical : 0) +
    (semanticAvailable ? fixedConfig.weights.semantic : 0);
  if (coverage === 0) {
    return {
      config: fixedConfig,
      contentScore: null,
      coverage: 0,
      observedMean: null,
      rankScore: null,
      matchProbability: null,
    };
  }
  const contentScore =
    (lexicalAvailable
      ? fixedConfig.weights.lexical * evaluation.lexical.value!
      : 0) +
    (semanticAvailable
      ? fixedConfig.weights.semantic * evaluation.semantic.value!
      : 0);
  return {
    config: fixedConfig,
    contentScore,
    coverage,
    observedMean: contentScore / coverage,
    rankScore: contentScore,
    matchProbability: null,
  };
}
