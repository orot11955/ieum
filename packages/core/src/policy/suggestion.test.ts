import { describe, expect, it } from "vitest";
import type { CandidateScore } from "../scoring/index.js";
import {
  assessSuggestionActivation,
  resolveSuggestionCandidates,
  selectValidationThresholds,
  suggestionReportBody,
} from "./suggestion.js";

const hash = (text: string) => {
  let sum = 0;
  for (const character of text)
    sum = (sum * 31 + character.charCodeAt(0)) >>> 0;
  return sum.toString(16).padStart(8, "0").repeat(8);
};
const thresholds = {
  contentFloor: 0.6,
  minimumCoverage: 1,
  rankScore: 0.6,
  maxSuggestions: 3,
  primaryMargin: 0.1,
};
const body = {
  version: "validation-grid-v1",
  profileId: "hybrid-v0",
  thresholds,
};
const config = { ...body, configHash: hash(JSON.stringify(body)) };
const reportBody = {
  split: "validation" as const,
  dataKind: "authorized_private" as const,
  datasetHash: "d".repeat(64),
  featureArtifactHash: "e".repeat(64),
  profileId: "hybrid-v0",
  configHash: config.configHash,
  recallAt10: { numerator: 9, denominator: 10 },
  reviewedPairPrecision: { numerator: 46, denominator: 50 },
  queryCoverage: { numerator: 18, denominator: 30 },
  independentOriginFamilyCount: 30,
  noMatchFalseSuggestionRate: { numerator: 1, denominator: 20 },
};
const report = {
  ...reportBody,
  reportHash: hash(suggestionReportBody(reportBody)),
};
const score = (
  contentScore: number | null,
  coverage: number,
  rankScore: number | null,
): CandidateScore => ({
  config: {
    version: "test",
    profileId: "hybrid-v0",
    weights: { lexical: 0.5, semantic: 0.5 },
    auxiliaryWeights: { graph: 0, session: 0, recency: 0 },
  },
  contentScore,
  coverage,
  observedMean: contentScore,
  rankScore,
  matchProbability: null,
});

describe("suggestion gate", () => {
  it("requires a matching hashed validation report and adequate authorized samples", () => {
    expect(assessSuggestionActivation(config, report, hash).enabled).toBe(true);
    const fractionalRecall = {
      ...reportBody,
      recallAt10: { numerator: 9.5, denominator: 10 },
    };
    expect(
      assessSuggestionActivation(
        config,
        {
          ...fractionalRecall,
          reportHash: hash(suggestionReportBody(fractionalRecall)),
        },
        hash,
      ).enabled,
    ).toBe(true);
    expect(assessSuggestionActivation(config, null, hash)).toEqual({
      enabled: false,
      reasons: ["NO_VALIDATION_REPORT"],
    });
    const synthetic = { ...reportBody, dataKind: "synthetic" as const };
    expect(
      assessSuggestionActivation(
        config,
        { ...synthetic, reportHash: hash(suggestionReportBody(synthetic)) },
        hash,
      ).reasons,
    ).toContain("SYNTHETIC_ONLY");
    const small = {
      ...reportBody,
      reviewedPairPrecision: { numerator: 9, denominator: 10 },
    };
    expect(
      assessSuggestionActivation(
        config,
        { ...small, reportHash: hash(suggestionReportBody(small)) },
        hash,
      ).reasons,
    ).toContain("INSUFFICIENT_REVIEWED_SAMPLE");
    const repeatedFamily = { ...reportBody, independentOriginFamilyCount: 1 };
    expect(
      assessSuggestionActivation(
        config,
        {
          ...repeatedFamily,
          reportHash: hash(suggestionReportBody(repeatedFamily)),
        },
        hash,
      ).reasons,
    ).toContain("INSUFFICIENT_ORIGIN_FAMILIES");
    expect(() =>
      assessSuggestionActivation(
        config,
        { ...report, reportHash: "0".repeat(64) },
        hash,
      ),
    ).toThrow(/disagree/);
    expect(() =>
      assessSuggestionActivation(
        { ...config, configHash: "0".repeat(64) },
        report,
        hash,
      ),
    ).toThrow(/hash mismatch/);
  });

  it("does not let rank or auxiliary boost bypass content and coverage gates", () => {
    const candidates = [
      { contextId: "strong", score: score(0.8, 1, 0.8) },
      { contextId: "boost-only", score: score(0.1, 1, 0.95) },
      { contextId: "partial", score: score(0.8, 0.5, 0.9) },
      { contextId: "missing", score: score(null, 0, null) },
    ];
    expect(
      resolveSuggestionCandidates(candidates, config, report, hash)
        .suggestedContextIds,
    ).toEqual(["strong"]);
    expect(
      resolveSuggestionCandidates(candidates, config, null, hash).mode,
    ).toBe("observe");
    expect(
      resolveSuggestionCandidates(candidates, config, null, hash)
        .suggestedContextIds,
    ).toEqual([]);
  });

  it("selects thresholds only from validation and keeps zero-suggestion precision undefined", () => {
    const row = {
      split: "validation" as const,
      labelKind: "match" as const,
      candidates: [
        {
          contextId: "c",
          score: score(0.8, 1, 0.8),
          review: "relevant" as const,
        },
      ],
    };
    const noMatch = {
      split: "validation" as const,
      labelKind: "no_match" as const,
      candidates: [
        {
          contextId: "c",
          score: score(0.1, 1, 0.1),
          review: "irrelevant" as const,
        },
      ],
    };
    const selected = selectValidationThresholds(
      [row, noMatch],
      "hybrid-v0",
      { numerator: 1, denominator: 1 },
      hash,
    );
    expect(selected?.metrics.reviewedPairPrecision).toEqual({
      numerator: 1,
      denominator: 1,
    });
    expect(selected?.metrics.noMatchFalseSuggestionRate).toEqual({
      numerator: 0,
      denominator: 1,
    });
    expect(() =>
      selectValidationThresholds(
        [{ ...row, split: "holdout" }],
        "hybrid-v0",
        { numerator: 1, denominator: 1 },
        hash,
      ),
    ).toThrow(/validation rows only/);
    expect(
      selectValidationThresholds(
        [
          {
            ...row,
            candidates: [{ ...row.candidates[0]!, score: score(0.1, 1, 0.1) }],
          },
          noMatch,
        ],
        "hybrid-v0",
        { numerator: 1, denominator: 1 },
        hash,
      ),
    ).toBeNull();
  });
});
