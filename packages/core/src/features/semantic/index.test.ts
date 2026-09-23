import { describe, expect, it } from "vitest";
import { validateSnapshot } from "../../snapshot/validator.js";
import { cosineSimilarity, rankSemanticSnapshot } from "./index.js";

const snapshot = validateSnapshot(
  {
    workspaceId: "w",
    asOfRecordedAt: 100,
    query: { unitId: "q", revision: 1 },
    captures: [
      {
        workspaceId: "w",
        captureId: "cq",
        revision: 1,
        rawBody: "교차 언어 질문",
        originKey: "q",
        recordedAt: 100,
        occurredAt: null,
      },
      {
        workspaceId: "w",
        captureId: "ca",
        revision: 1,
        rawBody: "cross-language answer",
        originKey: "a",
        recordedAt: 90,
        occurredAt: null,
      },
    ],
    units: [
      {
        workspaceId: "w",
        unitId: "q",
        revision: 1,
        captureId: "cq",
        captureRevision: 1,
        originKey: "q",
        sourceSpan: { start: 0, end: 8, encoding: "utf16" },
        content: { kind: "quote", text: "교차 언어 질문" },
        recordedAt: 100,
      },
      {
        workspaceId: "w",
        unitId: "a",
        revision: 1,
        captureId: "ca",
        captureRevision: 1,
        originKey: "a",
        sourceSpan: { start: 0, end: 21, encoding: "utf16" },
        content: { kind: "quote", text: "cross-language answer" },
        recordedAt: 90,
      },
    ],
    contexts: [
      {
        workspaceId: "w",
        contextId: "c",
        identityRevision: 1,
        membershipRevision: 1,
        name: "응답",
        recordedAt: 90,
        memberUnits: [{ unitId: "a", revision: 1 }],
      },
    ],
    relations: [],
    visibility: [],
    profileWatermarks: [],
  },
  "a".repeat(64),
);

const space = {
  namespace: "fixed",
  modelId: "test",
  modelRevision: "1",
  dimensions: 2,
  tokenizer: "test",
  queryPrefix: "q",
  passagePrefix: "p",
  pooling: "mean",
  precision: "float32" as const,
};
const vectors = {
  space,
  query: [1, 0],
  identities: [{ contextId: "c", vector: [0, 1] }],
  units: [{ unitId: "a", revision: 1, vector: [1, 0] }],
};

describe("exact semantic rank", () => {
  it("uses eligible member vectors for a cross-language paraphrase and keeps cosine separate from probability", () => {
    const hits = rankSemanticSnapshot(snapshot, vectors);
    expect(hits).toEqual([
      {
        contextId: "c",
        rank: 1,
        cosine: 1,
        identityCosine: 0,
        bestMember: { unitId: "a", revision: 1, cosine: 1 },
      },
    ]);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1e308, 1e308], [1e308, 1e308])).toBe(1);
  });

  it("rejects dimensions, zero vectors, missing members, and outside sources", () => {
    expect(() =>
      rankSemanticSnapshot(snapshot, { ...vectors, query: [1] }),
    ).toThrow(/dimensions/);
    expect(() =>
      rankSemanticSnapshot(snapshot, { ...vectors, query: [0, 0] }),
    ).toThrow(/zero vector/);
    expect(() =>
      rankSemanticSnapshot(snapshot, { ...vectors, units: [] }),
    ).toThrow(/incomplete/);
    expect(() =>
      rankSemanticSnapshot(snapshot, {
        ...vectors,
        identities: [{ contextId: "outside", vector: [1, 0] }],
      }),
    ).toThrow(/outside snapshot/);
    expect(() => cosineSimilarity([1, 2], [1])).toThrow(
      /same nonzero dimensions/,
    );
  });
});
