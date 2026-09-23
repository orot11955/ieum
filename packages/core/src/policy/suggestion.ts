import type { CandidateScore } from "../scoring/index.js";

export const PILOT_TARGETS = Object.freeze({
  recallAt10: 0.9,
  reviewedPairPrecision: 0.9,
  queryCoverage: 0.3,
  noMatchFalseSuggestionRate: 0.1,
  minimumReviewedPairs: 50,
  minimumNoMatchQueries: 20,
  minimumOriginFamilies: 20,
});

export type SuggestionThresholds = Readonly<{
  contentFloor: number;
  minimumCoverage: number;
  rankScore: number;
  maxSuggestions: number;
  primaryMargin: number;
}>;
export type SuggestionConfig = Readonly<{
  version: string;
  profileId: string;
  thresholds: SuggestionThresholds;
  configHash: string;
}>;
export type ValidationRatio = Readonly<{
  numerator: number;
  denominator: number;
}>;
export type SuggestionValidationReport = Readonly<{
  split: "validation";
  dataKind: "synthetic" | "authorized_private";
  datasetHash: string;
  featureArtifactHash: string;
  profileId: string;
  configHash: string;
  reportHash: string;
  recallAt10: ValidationRatio;
  reviewedPairPrecision: ValidationRatio;
  queryCoverage: ValidationRatio;
  independentOriginFamilyCount: number;
  noMatchFalseSuggestionRate: ValidationRatio;
}>;
export type TuningRow = Readonly<{
  split: "validation" | "development" | "holdout";
  labelKind: "match" | "no_match";
  candidates: readonly Readonly<{
    contextId: string;
    score: CandidateScore;
    review: "relevant" | "irrelevant" | "unreviewed";
  }>[];
}>;

function unit(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}
function digest(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
function ratio(value: ValidationRatio): number | null {
  if (
    !Number.isFinite(value.numerator) ||
    !Number.isSafeInteger(value.denominator) ||
    value.numerator < 0 ||
    value.denominator < 0 ||
    value.numerator > value.denominator
  )
    throw new RangeError("validation ratio has invalid counts");
  return value.denominator === 0 ? null : value.numerator / value.denominator;
}
function configBody(config: Omit<SuggestionConfig, "configHash">): string {
  const {
    contentFloor,
    minimumCoverage,
    rankScore,
    maxSuggestions,
    primaryMargin,
  } = config.thresholds;
  return JSON.stringify({
    version: config.version,
    profileId: config.profileId,
    thresholds: {
      contentFloor,
      minimumCoverage,
      rankScore,
      maxSuggestions,
      primaryMargin,
    },
  });
}
export function suggestionReportBody(
  report: Omit<SuggestionValidationReport, "reportHash">,
): string {
  return JSON.stringify({
    split: report.split,
    dataKind: report.dataKind,
    datasetHash: report.datasetHash,
    featureArtifactHash: report.featureArtifactHash,
    profileId: report.profileId,
    configHash: report.configHash,
    recallAt10: report.recallAt10,
    reviewedPairPrecision: report.reviewedPairPrecision,
    queryCoverage: report.queryCoverage,
    independentOriginFamilyCount: report.independentOriginFamilyCount,
    noMatchFalseSuggestionRate: report.noMatchFalseSuggestionRate,
  });
}

export function validateSuggestionConfig(
  config: SuggestionConfig,
  hashText: (text: string) => string,
): void {
  if (
    !/^[a-z][a-z0-9-]*$/.test(config.version) ||
    !/^[a-z][a-z0-9-]*$/.test(config.profileId)
  )
    throw new RangeError("suggestion policy needs stable version and profile");
  const thresholds = config.thresholds;
  if (
    !thresholds ||
    !unit(thresholds.contentFloor) ||
    !unit(thresholds.minimumCoverage) ||
    !unit(thresholds.rankScore) ||
    !unit(thresholds.primaryMargin) ||
    !Number.isSafeInteger(thresholds.maxSuggestions) ||
    thresholds.maxSuggestions < 1 ||
    thresholds.maxSuggestions > 10
  )
    throw new RangeError("incomplete or invalid suggestion thresholds");
  if (
    !digest(config.configHash) ||
    config.configHash !== hashText(configBody(config))
  )
    throw new RangeError("suggestion config hash mismatch");
}

export function assessSuggestionActivation(
  config: SuggestionConfig,
  report: SuggestionValidationReport | null,
  hashText: (text: string) => string,
) {
  validateSuggestionConfig(config, hashText);
  if (!report)
    return {
      enabled: false as const,
      reasons: ["NO_VALIDATION_REPORT"] as const,
    };
  if (
    report.split !== "validation" ||
    report.profileId !== config.profileId ||
    report.configHash !== config.configHash ||
    !digest(report.datasetHash) ||
    !digest(report.featureArtifactHash) ||
    !digest(report.reportHash) ||
    report.reportHash !== hashText(suggestionReportBody(report))
  )
    throw new RangeError("validation report and suggestion profile disagree");
  const recall = ratio(report.recallAt10);
  const precision = ratio(report.reviewedPairPrecision);
  const coverage = ratio(report.queryCoverage);
  const noMatch = ratio(report.noMatchFalseSuggestionRate);
  if (
    !Number.isSafeInteger(report.independentOriginFamilyCount) ||
    report.independentOriginFamilyCount < 0 ||
    report.independentOriginFamilyCount > report.queryCoverage.denominator
  )
    throw new RangeError("validation origin family count is invalid");
  const reasons: string[] = [];
  if (report.dataKind !== "authorized_private") reasons.push("SYNTHETIC_ONLY");
  if (
    report.reviewedPairPrecision.denominator <
      PILOT_TARGETS.minimumReviewedPairs ||
    report.noMatchFalseSuggestionRate.denominator <
      PILOT_TARGETS.minimumNoMatchQueries
  )
    reasons.push("INSUFFICIENT_REVIEWED_SAMPLE");
  if (report.independentOriginFamilyCount < PILOT_TARGETS.minimumOriginFamilies)
    reasons.push("INSUFFICIENT_ORIGIN_FAMILIES");
  if (
    recall === null ||
    recall < PILOT_TARGETS.recallAt10 ||
    precision === null ||
    precision < PILOT_TARGETS.reviewedPairPrecision ||
    coverage === null ||
    coverage < PILOT_TARGETS.queryCoverage ||
    noMatch === null ||
    noMatch > PILOT_TARGETS.noMatchFalseSuggestionRate
  )
    reasons.push("QUALITY_TARGET_NOT_MET");
  return { enabled: reasons.length === 0, reasons };
}

export function resolveSuggestionCandidates(
  scores: readonly Readonly<{ contextId: string; score: CandidateScore }>[],
  config: SuggestionConfig,
  report: SuggestionValidationReport | null,
  hashText: (text: string) => string,
) {
  const gate = assessSuggestionActivation(config, report, hashText);
  if (scores.some((item) => item.score.config.profileId !== config.profileId))
    throw new RangeError("candidate scores belong to another profile");
  if (
    scores.some(
      ({ score }) =>
        !unit(score.coverage) ||
        (score.contentScore !== null && !unit(score.contentScore)) ||
        (score.rankScore !== null && !unit(score.rankScore)),
    )
  )
    throw new RangeError("candidate score contains invalid values");
  if (
    scores.some(
      ({ score }) =>
        (score.coverage === 0) !== (score.contentScore === null) ||
        (score.contentScore === null) !== (score.rankScore === null),
    )
  )
    throw new RangeError(
      "candidate content, coverage and rank availability disagree",
    );
  const ranked = [...scores].sort(
    (a, b) =>
      (b.score.rankScore ?? -1) - (a.score.rankScore ?? -1) ||
      (a.contextId < b.contextId ? -1 : a.contextId > b.contextId ? 1 : 0),
  );
  if (new Set(ranked.map((item) => item.contextId)).size !== ranked.length)
    throw new RangeError("duplicate suggestion context");
  const suggestions = gate.enabled
    ? ranked
        .filter(
          ({ score }) =>
            score.contentScore !== null &&
            score.rankScore !== null &&
            score.contentScore >= config.thresholds.contentFloor &&
            score.coverage >= config.thresholds.minimumCoverage &&
            score.rankScore >= config.thresholds.rankScore,
        )
        .slice(0, config.thresholds.maxSuggestions)
        .map((item) => item.contextId)
    : [];
  return {
    mode: gate.enabled ? ("suggest" as const) : ("observe" as const),
    reasons: gate.reasons,
    suggestedContextIds: suggestions,
    primaryContextId: null,
    matchProbability: null,
  };
}

/** Only validation rows may select a provisional threshold; activation has a separate gate. */
export function selectValidationThresholds(
  rows: readonly TuningRow[],
  profileId: string,
  recallAt10: ValidationRatio,
  hashText: (text: string) => string,
): {
  config: SuggestionConfig;
  metrics: Pick<
    SuggestionValidationReport,
    | "recallAt10"
    | "reviewedPairPrecision"
    | "queryCoverage"
    | "noMatchFalseSuggestionRate"
  >;
} | null {
  if (!rows.length || rows.some((row) => row.split !== "validation"))
    throw new RangeError("threshold selection requires validation rows only");
  if (!/^[a-z][a-z0-9-]*$/.test(profileId))
    throw new RangeError("threshold selection requires a stable profile ID");
  if (
    rows.some((row) =>
      row.candidates.some((item) => item.score.config.profileId !== profileId),
    )
  )
    throw new RangeError("validation candidates belong to another profile");
  if (
    rows.some(
      (row) =>
        new Set(row.candidates.map((item) => item.contextId)).size !==
        row.candidates.length,
    )
  )
    throw new RangeError("duplicate validation candidate context");
  if (
    rows.some((row) =>
      row.candidates.some(
        ({ score }) =>
          !unit(score.coverage) ||
          (score.contentScore !== null && !unit(score.contentScore)) ||
          (score.rankScore !== null && !unit(score.rankScore)),
      ),
    )
  )
    throw new RangeError("validation candidate score is invalid");
  if (ratio(recallAt10) === null)
    throw new RangeError("validation recall needs a denominator");
  let selected: ReturnType<typeof selectValidationThresholds> = null;
  for (const contentFloor of [0.5, 0.6, 0.7])
    for (const minimumCoverage of [0.5, 1])
      for (const rankScore of [0.5, 0.6, 0.7]) {
        const thresholds = {
          contentFloor,
          minimumCoverage,
          rankScore,
          maxSuggestions: 3,
          primaryMargin: 0.1,
        };
        let reviewed = 0,
          relevant = 0,
          covered = 0,
          noMatchSuggested = 0,
          noMatchQueries = 0;
        for (const row of rows) {
          const candidates = row.candidates
            .filter(
              ({ score }) =>
                score.config.profileId === profileId &&
                score.contentScore !== null &&
                score.rankScore !== null &&
                score.contentScore >= contentFloor &&
                score.coverage >= minimumCoverage &&
                score.rankScore >= rankScore,
            )
            .sort((a, b) => b.score.rankScore! - a.score.rankScore!)
            .slice(0, thresholds.maxSuggestions);
          if (candidates.length) covered++;
          if (row.labelKind === "no_match") {
            noMatchQueries++;
            if (candidates.length) noMatchSuggested++;
          }
          for (const candidate of candidates)
            if (candidate.review !== "unreviewed") {
              reviewed++;
              if (candidate.review === "relevant") relevant++;
            }
        }
        const metrics = {
          recallAt10,
          reviewedPairPrecision: { numerator: relevant, denominator: reviewed },
          queryCoverage: { numerator: covered, denominator: rows.length },
          noMatchFalseSuggestionRate: {
            numerator: noMatchSuggested,
            denominator: noMatchQueries,
          },
        };
        const precision = ratio(metrics.reviewedPairPrecision);
        const coverage = ratio(metrics.queryCoverage);
        const falseRate = ratio(metrics.noMatchFalseSuggestionRate);
        if (
          ratio(recallAt10)! < PILOT_TARGETS.recallAt10 ||
          precision === null ||
          precision < PILOT_TARGETS.reviewedPairPrecision ||
          coverage === null ||
          coverage < PILOT_TARGETS.queryCoverage ||
          falseRate === null ||
          falseRate > PILOT_TARGETS.noMatchFalseSuggestionRate
        )
          continue;
        const body = { version: "validation-grid-v1", profileId, thresholds };
        const config = { ...body, configHash: hashText(configBody(body)) };
        if (!digest(config.configHash))
          throw new RangeError("hash function must return SHA-256 hex");
        if (!selected || coverage > ratio(selected.metrics.queryCoverage)!)
          selected = { config, metrics };
      }
  return selected;
}
