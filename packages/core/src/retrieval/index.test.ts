import { describe, expect, it } from "vitest";
import type { ContextSnapshot, ThoughtUnitRevision } from "../model/types.js";
import type { ValidatedSnapshot } from "../snapshot/types.js";
import { resolveExplicitContext, retrieveCandidates } from "./index.js";
import type { IdentityHit, MemberHit, RetrievalSources } from "./index.js";

function unit(
  unitId: string,
  originKey = `origin:${unitId}`,
): ThoughtUnitRevision {
  return {
    workspaceId: "test",
    unitId,
    revision: 1,
    captureId: unitId,
    captureRevision: 1,
    originKey,
    sourceSpan: { start: 0, end: 1, encoding: "utf16" },
    content: { kind: "quote", text: "x" },
    recordedAt: 1,
  };
}

function context(
  contextId: string,
  members: ThoughtUnitRevision[] = [],
): ContextSnapshot {
  return {
    workspaceId: "test",
    contextId,
    identityRevision: 2,
    membershipRevision: 3,
    name: contextId,
    recordedAt: 1,
    memberUnits: members.map(({ unitId, revision }) => ({ unitId, revision })),
  };
}

function snapshot(
  contexts: ContextSnapshot[],
  units: ThoughtUnitRevision[],
): ValidatedSnapshot {
  return {
    query: unit("query"),
    contexts,
    units,
    captures: [],
    relations: [],
    manifest: {
      inputHash: "a".repeat(64),
      workspaceId: "test",
      asOfRecordedAt: 1,
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

function sources(
  identity: IdentityHit[] = [],
  member: MemberHit[] = [],
): RetrievalSources {
  return {
    identity: { status: "ok", hits: identity, truncated: false },
    member: { status: "ok", hits: member, truncated: false },
  };
}

describe("candidate retrieval", () => {
  it("unions identity and member sources without counting one context twice", () => {
    const evidence = unit("evidence");
    const input = snapshot(
      [context("member-only", [evidence]), context("both", [evidence])],
      [evidence],
    );
    const result = retrieveCandidates(
      input,
      sources(
        [{ contextId: "both", rank: 1, cosine: 0.4 }],
        [
          {
            contextId: "member-only",
            unitId: "evidence",
            revision: 1,
            originKey: evidence.originKey,
            rank: 1,
            cosine: 0.8,
          },
          {
            contextId: "both",
            unitId: "evidence",
            revision: 1,
            originKey: evidence.originKey,
            rank: 2,
            cosine: 0.3,
          },
        ],
      ),
    );
    expect(result.matchedContextCount).toBe(2);
    expect(result.returnedContextCount).toBe(2);
    expect(result.candidates.map((item) => item.contextId)).toEqual([
      "both",
      "member-only",
    ]);
    expect(result.candidates[1]?.sourceRanks.member).toMatchObject({
      rank: 1,
      originalRank: 1,
    });
    expect(result.candidates[1]?.sourceRanks.identity).toBeNull();
    expect(result.candidates[0]?.sourceRanks.identity).not.toBeNull();
    expect(result.candidates[0]?.sourceRanks.member).not.toBeNull();
    expect(result.candidates[1]?.membershipRevision).toBe(3);
  });

  it("does not let many hits from one origin monopolize member context ranks", () => {
    const crowded = Array.from({ length: 10 }, (_, index) =>
      unit(`crowded-${index}`, "origin:one"),
    );
    const other = unit("other", "origin:two");
    const input = snapshot(
      [context("crowded", crowded), context("other", [other])],
      [...crowded, other],
    );
    const hits: MemberHit[] = [
      ...crowded.map((item, index) => ({
        contextId: "crowded",
        unitId: item.unitId,
        revision: 1,
        originKey: item.originKey,
        rank: index + 1,
        cosine: 0.9 - index / 100,
      })),
      {
        contextId: "other",
        unitId: "other",
        revision: 1,
        originKey: other.originKey,
        rank: 11,
        cosine: 0.5,
      },
    ];
    const result = retrieveCandidates(input, sources([], hits));
    expect(result.candidates.map((item) => item.contextId)).toEqual([
      "crowded",
      "other",
    ]);
    expect(result.candidates[0]?.memberEvidence).toHaveLength(1);
    expect(result.candidates[1]?.sourceRanks.member).toMatchObject({
      rank: 2,
      originalRank: 11,
    });
    expect(result.sources[1]?.duplicatesRemoved).toBe(9);
  });

  it("compares members before selecting one representative per origin and limits each context", () => {
    const first = unit("first", "origin:shared");
    const better = unit("better", "origin:shared");
    const other = unit("other");
    const third = unit("third");
    const fourth = unit("fourth");
    const units = [first, better, other, third, fourth];
    const input = snapshot([context("c", units)], units);
    const hits: MemberHit[] = [
      {
        contextId: "c",
        unitId: "first",
        revision: 1,
        originKey: first.originKey,
        rank: 1,
        cosine: 0.2,
      },
      {
        contextId: "c",
        unitId: "other",
        revision: 1,
        originKey: other.originKey,
        rank: 2,
        cosine: 0.5,
      },
      {
        contextId: "c",
        unitId: "better",
        revision: 1,
        originKey: better.originKey,
        rank: 3,
        cosine: 0.9,
      },
      {
        contextId: "c",
        unitId: "third",
        revision: 1,
        originKey: third.originKey,
        rank: 4,
        cosine: 0.4,
      },
      {
        contextId: "c",
        unitId: "fourth",
        revision: 1,
        originKey: fourth.originKey,
        rank: 5,
        cosine: 0.3,
      },
    ];
    const result = retrieveCandidates(input, sources([], hits));
    expect(
      result.candidates[0]?.memberEvidence.map((item) => item.unitId),
    ).toEqual(["better", "other", "third"]);
    expect(result.candidates[0]?.sourceRanks.member).toMatchObject({
      rank: 1,
      originalRank: 3,
      cosine: 0.9,
    });
    expect(result.sources[1]).toMatchObject({
      duplicatesRemoved: 1,
      quotaDropped: 1,
      truncated: true,
    });
    expect(result.truncated).toBe(true);
  });

  it("enforces the global budget and preserves source truncation and original ranks", () => {
    const contexts = Array.from({ length: 65 }, (_, index) =>
      context(`c${String(index).padStart(2, "0")}`),
    );
    const hits = contexts.map(({ contextId }, index) => ({
      contextId,
      rank: index + 1,
      cosine: 0.9,
    }));
    const input = snapshot(contexts, []);
    const limited = retrieveCandidates(input, sources(hits), 16);
    expect(limited.candidates).toHaveLength(16);
    expect(limited.matchedContextCount).toBe(65);
    expect(limited.truncated).toBe(true);
    expect(limited.sources[0]).toMatchObject({
      budgetDropped: 49,
      truncated: true,
    });
    expect(limited.candidates[15]?.sourceRanks.identity).toMatchObject({
      rank: 16,
      originalRank: 16,
    });
    expect(
      retrieveCandidates(input, sources(hits), 32).candidates,
    ).toHaveLength(32);
    expect(
      retrieveCandidates(input, sources(hits), 64).candidates,
    ).toHaveLength(64);
    const exhaustive = retrieveCandidates(input, sources(hits), "all");
    expect(exhaustive.candidates).toHaveLength(65);
    expect(exhaustive.truncated).toBe(false);
    expect(() => retrieveCandidates(input, sources(hits), 17 as 16)).toThrow(
      /budget/,
    );
  });

  it("keeps tie breaks stable when inputs are shuffled", () => {
    const a = unit("a");
    const b = unit("b");
    const contexts = [context("z", [a]), context("a", [b])];
    const input = snapshot(contexts, [a, b]);
    const identity: IdentityHit[] = [
      { contextId: "z", rank: 1, cosine: 0.5 },
      { contextId: "a", rank: 1, cosine: 0.5 },
    ];
    const member: MemberHit[] = [
      {
        contextId: "z",
        unitId: "a",
        revision: 1,
        originKey: a.originKey,
        rank: 1,
        cosine: 0.5,
      },
      {
        contextId: "a",
        unitId: "b",
        revision: 1,
        originKey: b.originKey,
        rank: 1,
        cosine: 0.5,
      },
    ];
    expect(retrieveCandidates(input, sources(identity, member))).toEqual(
      retrieveCandidates(
        snapshot([...contexts].reverse(), [b, a]),
        sources([...identity].reverse(), [...member].reverse()),
      ),
    );
  });

  it("reports empty and failed sources, and exhaustive-only contexts separately", () => {
    const input = snapshot([context("c")], []);
    const failed: RetrievalSources = {
      identity: { status: "error", code: "INDEX_UNAVAILABLE" },
      member: { status: "ok", hits: [], truncated: false },
    };
    const normal = retrieveCandidates(input, failed);
    expect(normal).toMatchObject({
      status: "no_candidates",
      matchedContextCount: 0,
      truncated: false,
    });
    expect(normal.sources[0]).toMatchObject({
      status: "error",
      errorCode: "INDEX_UNAVAILABLE",
    });
    const exhaustive = retrieveCandidates(input, failed, "all");
    expect(exhaustive.candidates[0]).toMatchObject({
      contextId: "c",
      matchStatus: "exhaustive_only",
    });
    expect(exhaustive.matchedContextCount).toBe(0);
    expect(retrieveCandidates(snapshot([], []), sources()).status).toBe(
      "no_candidates",
    );
    expect(
      retrieveCandidates(input, {
        ...sources(),
        identity: { status: "ok", hits: [], truncated: true },
      }).truncated,
    ).toBe(true);
    expect(
      retrieveCandidates(input, {
        ...sources(),
        identity: { status: "ok", hits: [], truncated: true },
      }).sources[0]?.inputTruncated,
    ).toBe(true);
  });

  it("rejects unscoped hits and handles explicit context lookup outside automatic retrieval", () => {
    const eligible = unit("eligible");
    const input = snapshot([context("c", [eligible])], [eligible]);
    expect(() =>
      retrieveCandidates(
        input,
        sources([{ contextId: "hidden", rank: 1, cosine: 0.5 }]),
      ),
    ).toThrow(/ineligible context/);
    expect(() =>
      retrieveCandidates(
        input,
        sources(
          [],
          [
            {
              contextId: "c",
              unitId: "query",
              revision: 1,
              originKey: "origin:query",
              rank: 1,
              cosine: 1,
            },
          ],
        ),
      ),
    ).toThrow(/eligible context member/);
    expect(resolveExplicitContext(input, "c")).toMatchObject({
      status: "eligible",
    });
    expect(resolveExplicitContext(input, "hidden")).toEqual({
      status: "ineligible",
    });
    expect(() =>
      retrieveCandidates(input, {
        ...sources(),
        identity: { status: "error", code: "raw error text" },
      }),
    ).toThrow(/error code/);
  });
});
