import { describe, expect, it } from "vitest";
import { evaluateCandidate } from "../evaluation/index.js";
import type { CandidateMeasurements } from "../evaluation/index.js";
import { OBSERVE_POLICY_CONFIG, resolvePolicy } from "../policy/index.js";
import { retrieveCandidates } from "../retrieval/index.js";
import type { RetrievalSources } from "../retrieval/index.js";
import { LEXICAL_SCORE_CONFIG, scoreCandidate } from "../scoring/index.js";
import type { ScoreConfig } from "../scoring/index.js";
import type { ContextSnapshot, ThoughtUnitRevision } from "../model/types.js";
import type { ValidatedSnapshot } from "../snapshot/types.js";
import { runObserveJudgement } from "./index.js";

function unit(
  unitId: string,
  originKey = `origin:${unitId}`,
): ThoughtUnitRevision {
  return {
    workspaceId: "w1",
    unitId,
    revision: 1,
    captureId: unitId,
    captureRevision: 1,
    originKey,
    sourceSpan: { start: 0, end: 2, encoding: "utf16" },
    content: { kind: "quote", text: "기록" },
    recordedAt: 100,
  };
}

function context(
  contextId: string,
  members: ThoughtUnitRevision[] = [],
): ContextSnapshot {
  return {
    workspaceId: "w1",
    contextId,
    identityRevision: 2,
    membershipRevision: 3,
    name: contextId,
    recordedAt: 100,
    memberUnits: members.map(({ unitId, revision }) => ({ unitId, revision })),
  };
}

function snapshot(
  contexts: ContextSnapshot[],
  units: ThoughtUnitRevision[] = [],
): ValidatedSnapshot {
  return {
    query: unit("query"),
    captures: [],
    units,
    contexts,
    relations: [],
    manifest: {
      inputHash: "a".repeat(64),
      workspaceId: "w1",
      asOfRecordedAt: 100,
      query: { unitId: "query", revision: 1, originKey: "origin:query" },
      profileWatermark: null,
      sortRule: "id-then-revision-v1",
      captureRevisions: [],
      eligibleUnits: units.map(({ unitId, revision }) => ({
        unitId,
        revision,
      })),
      eligibleContexts: contexts.map(
        ({ contextId, identityRevision, membershipRevision }) => ({
          contextId,
          identityRevision,
          membershipRevision,
        }),
      ),
      eligibleRelations: [],
      exclusions: [],
    },
  };
}

function sources(contextIds: string[]): RetrievalSources {
  return {
    identity: {
      status: "ok",
      hits: contextIds.map((contextId, index) => ({
        contextId,
        rank: index + 1,
        cosine: 0.5,
      })),
      truncated: false,
    },
    member: { status: "ok", hits: [], truncated: false },
  };
}

function measured(value: number): CandidateMeasurements {
  return {
    identity: { availability: "available", value },
    member: { availability: "not_applicable", reason: "NO_MEMBERS" },
    semantic: { availability: "not_applicable", reason: "DISABLED" },
  };
}

describe("CORE-05 judgement stages", () => {
  it("keeps measured zero distinct from missing and never promotes it to a suggestion", () => {
    const input = snapshot([context("c")]);
    const candidate = retrieveCandidates(input, sources(["c"])).candidates[0]!;
    const zero = evaluateCandidate(input, candidate, measured(0));
    expect(scoreCandidate(zero)).toMatchObject({
      coverage: 1,
      contentScore: 0,
      rankScore: 0,
      matchProbability: null,
    });
    expect(resolvePolicy(scoreCandidate(zero))).toMatchObject({
      status: "candidate",
      reasons: ["OBSERVE_MODE", "MEASURED_ZERO"],
      primaryContextId: null,
      proposal: null,
    });
    const missing = evaluateCandidate(input, candidate, {
      ...measured(0),
      identity: { availability: "missing", reason: "EMPTY_VECTOR" },
    });
    expect(scoreCandidate(missing)).toMatchObject({
      coverage: 0,
      contentScore: null,
      rankScore: null,
    });
    expect(resolvePolicy(scoreCandidate(missing))).toMatchObject({
      status: "abstain",
      reasons: ["NO_CONTENT_EVIDENCE"],
    });
  });

  it("uses the top three distinct member origins and rejects unsupported references", () => {
    const first = unit("first", "origin:a");
    const better = unit("better", "origin:a");
    const b = unit("b");
    const c = unit("c");
    const d = unit("d");
    const units = [first, better, b, c, d];
    const input = snapshot([context("ctx", units)], units);
    const candidate = retrieveCandidates(input, sources(["ctx"]))
      .candidates[0]!;
    const observations: CandidateMeasurements = {
      identity: { availability: "missing", reason: "EMPTY_VECTOR" },
      member: {
        availability: "available",
        members: [
          { unitId: "first", revision: 1, originKey: "origin:a", cosine: 0.1 },
          { unitId: "better", revision: 1, originKey: "origin:a", cosine: 0.9 },
          { unitId: "b", revision: 1, originKey: "origin:b", cosine: 0.8 },
          { unitId: "c", revision: 1, originKey: "origin:c", cosine: 0.7 },
          { unitId: "d", revision: 1, originKey: "origin:d", cosine: 0.6 },
        ],
      },
      semantic: { availability: "not_applicable", reason: "DISABLED" },
    };
    const evaluated = evaluateCandidate(input, candidate, observations);
    expect(evaluated.member.value).toBeCloseTo(0.8);
    expect(evaluated.member.memberEvidence.map((item) => item.unitId)).toEqual([
      "better",
      "b",
      "c",
    ]);
    expect(evaluated.lexical.value).toBeCloseTo(0.8);
    expect(() =>
      evaluateCandidate(input, candidate, {
        ...observations,
        member: {
          availability: "available",
          members: [
            {
              unitId: "query",
              revision: 1,
              originKey: "origin:query",
              cosine: 1,
            },
          ],
        },
      }),
    ).toThrow(/eligible member/);
  });

  it("does not redistribute missing weight or let recency replace content", () => {
    const input = snapshot([context("c")]);
    const candidate = retrieveCandidates(input, sources(["c"])).candidates[0]!;
    const hybrid: ScoreConfig = {
      version: "content-score-v1",
      profileId: "hybrid-test",
      weights: { lexical: 0.5, semantic: 0.5 },
      auxiliaryWeights: { graph: 0, session: 0, recency: 0 },
    };
    const evaluated = evaluateCandidate(input, candidate, measured(0.9));
    expect(scoreCandidate(evaluated, hybrid)).toMatchObject({
      coverage: 0.5,
      contentScore: 0.45,
      observedMean: 0.9,
      rankScore: 0.45,
    });
    expect(
      Object.isFrozen(scoreCandidate(evaluated, hybrid).config.weights),
    ).toBe(true);
    const missing = evaluateCandidate(input, candidate, {
      ...measured(0),
      identity: { availability: "missing", reason: "EMPTY_VECTOR" },
    });
    expect(
      scoreCandidate(missing, LEXICAL_SCORE_CONFIG, {
        graph: null,
        session: null,
        recency: 1,
      }),
    ).toMatchObject({ coverage: 0, contentScore: null, rankScore: null });
  });

  it("keeps two relevant contexts as separate observe candidates without a primary", () => {
    const input = snapshot([context("a"), context("b")]);
    const retrieval = retrieveCandidates(input, sources(["a", "b"]));
    const result = runObserveJudgement(
      input,
      retrieval,
      new Map([
        ["a", measured(0.7)],
        ["b", measured(0.8)],
      ]),
    );
    expect(result).toMatchObject({
      mode: "observe",
      status: "candidate",
      primaryContextId: null,
      proposals: [],
      matchProbability: null,
    });
    expect(result.candidates.map((item) => item.decision.status)).toEqual([
      "candidate",
      "candidate",
    ]);
    expect(result.candidates.map((item) => item.score.contentScore)).toEqual([
      0.8, 0.7,
    ]);
    expect(
      result.candidates.map((item) => [
        item.rank,
        item.candidate.contextId,
        item.candidate.rank,
      ]),
    ).toEqual([
      [1, "b", 2],
      [2, "a", 1],
    ]);
    const tied = runObserveJudgement(
      input,
      retrieveCandidates(input, sources(["b", "a"])),
      new Map([
        ["a", measured(0.5)],
        ["b", measured(0.5)],
      ]),
    );
    expect(tied.candidates.map((item) => item.candidate.contextId)).toEqual([
      "a",
      "b",
    ]);
    expect(result.candidates[0]?.explanation).toMatchObject({
      profileId: "lexical-v0",
      policyVersion: "observe-v1",
    });
    expect(
      result.candidates[0]?.explanation.features.member.memberEvidence,
    ).toEqual([]);
    expect(result.candidates[0]?.explanation.summary).not.toMatch(
      /사실|정답|승인|출처가 일치/,
    );
  });

  it("abstains on no candidates and preserves source error codes", () => {
    const input = snapshot([context("c")]);
    const failedSources: RetrievalSources = {
      identity: { status: "error", code: "INDEX_UNAVAILABLE" },
      member: { status: "ok", hits: [], truncated: false },
    };
    const empty = runObserveJudgement(
      input,
      retrieveCandidates(input, failedSources),
      new Map(),
    );
    expect(empty).toMatchObject({
      status: "abstain",
      reason: "NO_CANDIDATES",
      candidates: [],
    });
    const exhaustive = runObserveJudgement(
      input,
      retrieveCandidates(input, failedSources, "all"),
      new Map(),
    );
    expect(exhaustive.candidates[0]?.decision.status).toBe("abstain");
    expect(exhaustive.candidates[0]?.explanation.sourceErrors).toEqual([
      { source: "identity", code: "INDEX_UNAVAILABLE" },
    ]);
    expect(
      exhaustive.candidates[0]?.explanation.features.member.memberEvidence,
    ).toEqual([]);
    const candidate = exhaustive.retrieval.candidates[0]!;
    const failedMeasurement = evaluateCandidate(input, candidate, {
      identity: { availability: "error", code: "FEATURE_TIMEOUT" },
      member: { availability: "not_applicable", reason: "NO_MEMBERS" },
      semantic: { availability: "not_applicable", reason: "DISABLED" },
    });
    expect(failedMeasurement.identity).toMatchObject({
      availability: "error",
      value: null,
      reason: "FEATURE_TIMEOUT",
    });
    expect(failedMeasurement.lexical.availability).toBe("error");
    expect(resolvePolicy(scoreCandidate(failedMeasurement)).status).toBe(
      "abstain",
    );
  });

  it("rejects NaN, invalid weights, thresholds, auto actions, and unscoped measurements", () => {
    const input = snapshot([context("c")]);
    const retrieval = retrieveCandidates(input, sources(["c"]));
    const candidate = retrieval.candidates[0]!;
    expect(() =>
      evaluateCandidate(input, candidate, measured(Number.NaN)),
    ).toThrow(/finite/);
    expect(() =>
      evaluateCandidate(input, candidate, measured(Infinity)),
    ).toThrow(/finite/);
    const evaluated = evaluateCandidate(input, candidate, measured(0.6));
    expect(() =>
      scoreCandidate(evaluated, {
        ...LEXICAL_SCORE_CONFIG,
        weights: { lexical: 0.7, semantic: 0.7 },
      }),
    ).toThrow(/sum to one/);
    expect(() =>
      scoreCandidate(evaluated, {
        ...LEXICAL_SCORE_CONFIG,
        weights: { lexical: 0.5000000000001, semantic: 0.5 },
      }),
    ).toThrow(/sum to one/);
    expect(() =>
      scoreCandidate(evaluated, {
        ...LEXICAL_SCORE_CONFIG,
        auxiliaryWeights: { graph: 0, session: 0, recency: 0.1 },
      }),
    ).toThrow(/disabled/);
    expect(() =>
      resolvePolicy(scoreCandidate(evaluated), {
        ...OBSERVE_POLICY_CONFIG,
        suggestionThresholds: {
          contentFloor: 0.5,
          minimumCoverage: 1,
          rankScore: 0.5,
        },
      }),
    ).toThrow(/only observe/);
    expect(() =>
      resolvePolicy(scoreCandidate(evaluated), {
        ...OBSERVE_POLICY_CONFIG,
        mode: "suggest",
      }),
    ).toThrow(/only observe/);
    expect(() =>
      runObserveJudgement(input, retrieval, new Map([["hidden", measured(1)]])),
    ).toThrow(/outside retrieval/);
    expect(() =>
      runObserveJudgement(input, retrieval, new Map([["c", measured(0.6)]]), {
        version: "content-score-v1",
        profileId: "hybrid-test",
        weights: { lexical: 0.5, semantic: 0.5 },
        auxiliaryWeights: { graph: 0, session: 0, recency: 0 },
      }),
    ).toThrow(/lexical-v0/);
    expect(() =>
      runObserveJudgement(
        input,
        retrieval,
        new Map([
          [
            "c",
            {
              ...measured(0.6),
              semantic: { availability: "available", value: 0.9 },
            },
          ],
        ]),
      ),
    ).toThrow(/no active provider/);
  });
});
