import { describe, expect, it } from "vitest";
import type { ThoughtUnitRevision } from "../../model/types.js";
import type { ValidatedSnapshot } from "../../snapshot/types.js";
import {
  computeLexicalFeatures,
  LEXICAL_CONFIG,
  normalizeLexicalText,
  tokenizeLexicalText,
} from "./index.js";

function unit(
  unitId: string,
  originKey: string,
  text: string,
): ThoughtUnitRevision {
  return {
    workspaceId: "test",
    unitId,
    revision: 1,
    captureId: unitId,
    captureRevision: 1,
    originKey,
    sourceSpan: { start: 0, end: text.length, encoding: "utf16" },
    content: { kind: "quote", text },
    recordedAt: 1,
  };
}

function snapshot(
  query: string,
  candidates: ThoughtUnitRevision[],
): ValidatedSnapshot {
  return {
    query: unit("query", "origin:query", query),
    units: candidates,
    captures: [],
    contexts: [],
    relations: [],
    manifest: {
      inputHash: "a".repeat(64),
      workspaceId: "test",
      asOfRecordedAt: 1,
      query: { unitId: "query", revision: 1, originKey: "origin:query" },
      profileWatermark: null,
      sortRule: "id-then-revision-v1",
      captureRevisions: [],
      eligibleUnits: candidates.map(({ unitId, revision }) => ({
        unitId,
        revision,
      })),
      eligibleContexts: [],
      eligibleRelations: [],
      exclusions: [],
    },
  };
}

describe("lexical normalization and tokenization", () => {
  it("normalizes fullwidth English only for search, retaining separate identifiers", () => {
    const source = "Ｃ＋＋ C# v1.2.3 /docs/a.ts --dry-run";
    expect(normalizeLexicalText(source)).toBe(
      "c++ c# v1.2.3 /docs/a.ts --dry-run",
    );
    const tokens = tokenizeLexicalText(source);
    expect(tokens).toContain("id:c++");
    expect(tokens).toContain("id:c#");
    expect(tokens).toContain("id:v1.2.3");
    expect(tokens).toContain("id:/docs/a.ts");
    expect(tokens).toContain("id:--dry-run");
    expect(tokens).not.toContain("en:c");
    expect(source).toBe("Ｃ＋＋ C# v1.2.3 /docs/a.ts --dry-run");
  });

  it("shares Korean 2/3-grams across particles and spacing, and English words", () => {
    const query = tokenizeLexicalText("기록을 정리하고 API를 검토");
    const candidate = tokenizeLexicalText("기록 정리 API review");
    expect(query).toContain("ko2:기록");
    expect(query).toContain("ko2:정리");
    expect(query).toContain("en:api");
    expect(candidate).toContain("ko2:기록");
    expect(candidate).toContain("ko2:정리");
    expect(candidate).toContain("en:api");
  });
});

describe("fixed snapshot TF-IDF cosine", () => {
  it("does not include the query in document frequency and is order deterministic", () => {
    const a = unit("a", "origin:a", "기록 API");
    const b = unit("b", "origin:b", "일정 C++");
    const forward = computeLexicalFeatures(snapshot("기록 API", [a, b]));
    const backward = computeLexicalFeatures(snapshot("기록 API", [b, a]));
    expect(forward).toEqual(backward);
    expect(forward.config).toEqual(LEXICAL_CONFIG);
    expect(forward.corpusOriginCount).toBe(2);
    expect(forward.documentFrequency).toContainEqual({
      token: "en:api",
      origins: 1,
    });
    expect(forward.candidates[0]?.cosine).toBeCloseTo(1);
    expect(forward.candidates[1]).toMatchObject({
      cosine: 0,
      status: "available",
      slices: ["no_shared_terms"],
    });
    expect(
      computeLexicalFeatures(snapshot("검색어", [a])).documentFrequency,
    ).not.toContainEqual({
      token: "ko3:검색어",
      origins: 1,
    });
  });

  it("counts duplicate units from one origin once in IDF", () => {
    const a = unit("a", "origin:a", "alpha beta");
    const duplicate = unit("a2", "origin:a", "alpha gamma");
    const b = unit("b", "origin:b", "alpha delta");
    const result = computeLexicalFeatures(snapshot("alpha", [a, duplicate, b]));
    expect(result.corpusOriginCount).toBe(2);
    expect(result.documentFrequency).toContainEqual({
      token: "en:alpha",
      origins: 2,
    });
    expect(result.documentFrequency).toContainEqual({
      token: "en:beta",
      origins: 1,
    });
    expect(result.documentFrequency).toContainEqual({
      token: "en:gamma",
      origins: 1,
    });
  });

  it("distinguishes empty vectors, zero overlap, and a negation limitation", () => {
    const empty = unit("empty", "origin:empty", "😀");
    const different = unit("different", "origin:other", "정리 완료");
    expect(
      computeLexicalFeatures(snapshot("😀", [different])).candidates[0],
    ).toMatchObject({
      cosine: null,
      status: "empty_query",
    });
    expect(
      computeLexicalFeatures(snapshot("기록", [empty])).candidates[0],
    ).toMatchObject({
      cosine: null,
      status: "empty_candidate",
    });
    const negated = computeLexicalFeatures(snapshot("정리 안 함", [different]));
    expect(negated.candidates[0]?.slices).toContain("negation_unmodeled");
    expect(negated.candidates[0]?.cosine).not.toBeNull();
  });

  it("rejects query-origin leakage even when supplied a forged validated snapshot", () => {
    expect(() =>
      computeLexicalFeatures(
        snapshot("secret", [unit("derived", "origin:query", "secret")]),
      ),
    ).toThrow(/query origin/);
  });

  it("does not replace a source span with normalized search-text offsets", () => {
    const source = unit("fullwidth", "origin:fullwidth", "Ｃ＋＋");
    const originalSpan = source.sourceSpan;
    computeLexicalFeatures(snapshot("C++", [source]));
    expect(source.content.text).toBe("Ｃ＋＋");
    expect(source.sourceSpan).toBe(originalSpan);
    expect(source.sourceSpan.end).toBe(3);
  });
});
