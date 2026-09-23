import { describe, expect, it } from "vitest";
import { validateSnapshot } from "../../snapshot/validator.js";
import { createEvidencePack } from "./index.js";

const raw = "관찰이다. 반론이다.";
const captures = [
  {
    workspaceId: "w",
    captureId: "q",
    revision: 1,
    rawBody: "질문",
    originKey: "q",
    recordedAt: 100,
    occurredAt: null,
  },
  {
    workspaceId: "w",
    captureId: "a",
    revision: 1,
    rawBody: raw,
    originKey: "a",
    recordedAt: 90,
    occurredAt: null,
  },
];
const units = [
  {
    workspaceId: "w",
    unitId: "uq",
    revision: 1,
    captureId: "q",
    captureRevision: 1,
    originKey: "q",
    sourceSpan: { start: 0, end: 2, encoding: "utf16" },
    content: { kind: "quote", text: "질문" },
    recordedAt: 100,
  },
  {
    workspaceId: "w",
    unitId: "u1",
    revision: 1,
    captureId: "a",
    captureRevision: 1,
    originKey: "a",
    sourceSpan: { start: 0, end: 5, encoding: "utf16" },
    content: { kind: "quote", text: "관찰이다." },
    recordedAt: 90,
  },
  {
    workspaceId: "w",
    unitId: "u2",
    revision: 1,
    captureId: "a",
    captureRevision: 1,
    originKey: "a",
    sourceSpan: { start: 6, end: raw.length, encoding: "utf16" },
    content: { kind: "quote", text: "반론이다." },
    recordedAt: 90,
  },
];
const snapshot = validateSnapshot(
  {
    workspaceId: "w",
    asOfRecordedAt: 100,
    query: { unitId: "uq", revision: 1 },
    captures,
    units,
    contexts: [
      {
        workspaceId: "w",
        contextId: "c",
        identityRevision: 1,
        membershipRevision: 1,
        name: "맥락",
        recordedAt: 90,
        memberUnits: [
          { unitId: "u1", revision: 1 },
          { unitId: "u2", revision: 1 },
        ],
      },
    ],
    relations: [],
    visibility: [],
    profileWatermarks: [],
  },
  "c".repeat(64),
);
const hash = (text: string) => (text === raw ? "a".repeat(64) : "b".repeat(64));

function request() {
  return {
    selectedContextId: "c",
    title: "제목",
    purpose: "검토",
    sections: {
      question: [{ unitId: "uq", revision: 1, quote: "질문" }],
      observation: [{ unitId: "u1", revision: 1, quote: "관찰이다." }],
      counterargument: [{ unitId: "u2", revision: 1, quote: "반론이다." }],
      decision: [],
      unknown: [],
    },
  };
}

describe("evidence pack", () => {
  it("keeps exact source revisions and counts one origin family for repeated excerpts", () => {
    const pack = createEvidencePack(snapshot, request(), hash);
    expect(pack.sections.observation[0]?.ref.sourceSpan).toEqual({
      start: 0,
      end: 5,
      encoding: "utf16",
    });
    expect(pack.manifest.sourceRefs).toHaveLength(3);
    expect(pack.manifest.sourceHashes).toHaveLength(2);
    expect(pack.manifest.originFamilies).toEqual(["a", "q"]);
    expect(pack.missingSections).toEqual(["decision", "unknown"]);
    expect(pack.sections.counterargument[0]?.ref.text).toBe("반론이다.");
  });

  it("rejects missing, stale, and mismatched excerpts; does not infer missing counterarguments", () => {
    expect(() =>
      createEvidencePack(
        snapshot,
        {
          ...request(),
          sections: {
            ...request().sections,
            observation: [
              { unitId: "missing", revision: 1, quote: "관찰이다." },
            ],
          },
        },
        hash,
      ),
    ).toThrow(/outside selected context/);
    expect(() =>
      createEvidencePack(
        snapshot,
        {
          ...request(),
          sections: {
            ...request().sections,
            observation: [{ unitId: "u1", revision: 2, quote: "관찰이다." }],
          },
        },
        hash,
      ),
    ).toThrow(/outside selected context/);
    expect(() =>
      createEvidencePack(
        snapshot,
        {
          ...request(),
          sections: {
            ...request().sections,
            observation: [{ unitId: "u1", revision: 1, quote: "다른 말" }],
          },
        },
        hash,
      ),
    ).toThrow(/original source span/);
    const pack = createEvidencePack(
      snapshot,
      {
        ...request(),
        sections: { ...request().sections, counterargument: [] },
      },
      hash,
    );
    expect(pack.missingSections).toContain("counterargument");
  });
});
