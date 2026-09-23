import { describe, expect, it } from "vitest";
import type { EvidencePack, PackSource } from "../evidence-pack/index.js";
import { planDocument } from "./index.js";

function source(unitId: string, originKey: string): PackSource {
  return {
    ref: {
      workspaceId: "w",
      sourceKind: "unit",
      unitId,
      unitRevision: 1,
      captureId: originKey,
      captureRevision: 1,
      originKey,
      sourceSpan: { start: 0, end: 2, encoding: "utf16" },
      transform: "quote",
      text: "원문",
    },
    captureHash: originKey === "a" ? "a".repeat(64) : "b".repeat(64),
  };
}
const first = source("u1", "a");
const repeat = source("u2", "a");
const opposing = source("u3", "b");
const pack: EvidencePack = {
  schemaVersion: 1,
  title: "실패 기록",
  manifest: {
    workspaceId: "w",
    snapshotInputHash: "c".repeat(64),
    selectedContextId: "c",
    purpose: "실패 실험 정리",
    sourceRefs: [first.ref, repeat.ref, opposing.ref],
    sourceHashes: [
      { captureId: "a", revision: 1, sha256: "a".repeat(64) },
      { captureId: "b", revision: 1, sha256: "b".repeat(64) },
    ],
    originFamilies: ["a", "b"],
  },
  sections: {
    question: [],
    observation: [first, repeat],
    counterargument: [opposing],
    decision: [],
    unknown: [],
  },
  missingSections: ["question", "decision", "unknown"],
};

describe("document planning", () => {
  it("keeps a failed experiment and conflicting viewpoints without inventing a success claim or maturity score", () => {
    const restored = JSON.parse(JSON.stringify(pack)) as EvidencePack;
    const plan = planDocument(restored, {
      purpose: "experiment_note",
      audience: "개인 검토",
      entries: [
        {
          itemId: "conditions",
          citations: [{ sourceIndex: 0, role: "personal_observation" }],
          authorInterpretation: null,
        },
        {
          itemId: "attempt",
          citations: [{ sourceIndex: 1, role: "personal_observation" }],
          authorInterpretation: null,
        },
        {
          itemId: "result",
          citations: [],
          authorInterpretation: "실패했다고 판단함",
        },
        {
          itemId: "limitations",
          citations: [{ sourceIndex: 2, role: "counterargument" }],
          authorInterpretation: null,
        },
      ],
      conflicts: [
        { leftSourceIndex: 0, rightSourceIndex: 2, note: "관점이 충돌함" },
      ],
    });
    expect(plan.outline.map((item) => item.status)).toEqual([
      "sourced",
      "sourced",
      "author_draft",
      "sourced",
    ]);
    expect(plan.outline[2]?.citations).toEqual([]);
    expect(plan.readiness.independentOriginFamilies).toEqual(["a", "b"]);
    expect(plan.readiness.authorDraftItems).toEqual(["result"]);
    expect(plan.readiness.unresolvedConflicts).toHaveLength(1);
    expect(plan.readiness.missingCounterargument).toBe(false);
    expect(plan.readiness.status).toBe("needs_author_review");
    expect("score" in plan.readiness).toBe(false);
  });

  it("lists missing sections and rejects fabricated references or counterargument roles", () => {
    const request = {
      purpose: "guide" as const,
      audience: "독자",
      entries: [
        {
          itemId: "steps",
          citations: [
            { sourceIndex: 0, role: "personal_observation" as const },
          ],
          authorInterpretation: null,
        },
      ],
      conflicts: [],
    };
    const plan = planDocument(pack, request);
    expect(plan.readiness.missingItems).toEqual([
      "preconditions",
      "verification_scope",
    ]);
    expect(plan.readiness.missingCounterargument).toBe(true);
    expect(() =>
      planDocument(pack, {
        ...request,
        entries: [
          {
            ...request.entries[0]!,
            citations: [{ sourceIndex: 99, role: "personal_observation" }],
          },
        ],
      }),
    ).toThrow(/outside evidence pack/);
    expect(() =>
      planDocument(pack, {
        ...request,
        entries: [
          {
            ...request.entries[0]!,
            citations: [{ sourceIndex: 0, role: "counterargument" }],
          },
        ],
      }),
    ).toThrow(/not in pack counterarguments/);
    expect(() =>
      planDocument(pack, {
        ...request,
        entries: [{ ...request.entries[0]!, itemId: "invented_summary" }],
      }),
    ).toThrow(/unknown or duplicate/);
    const forged = {
      ...pack,
      manifest: {
        ...pack.manifest,
        sourceRefs: [{ ...first.ref, unitId: "forged" }],
      },
    };
    expect(() => planDocument(forged, request)).toThrow(/unsupported source/);
  });

  it("separates external claims, personal observations, counterarguments and author interpretation", () => {
    const plan = planDocument(pack, {
      purpose: "comparison",
      audience: "검토자",
      entries: [
        {
          itemId: "viewpoints",
          citations: [
            { sourceIndex: 0, role: "personal_observation" },
            { sourceIndex: 1, role: "external_claim" },
          ],
          authorInterpretation: null,
        },
        {
          itemId: "opposition",
          citations: [{ sourceIndex: 2, role: "counterargument" }],
          authorInterpretation: null,
        },
        {
          itemId: "unknowns",
          citations: [],
          authorInterpretation: "추가 확인 필요",
        },
      ],
      conflicts: [],
    });
    expect(plan.outline[0]?.citations.map((item) => item.role)).toEqual([
      "personal_observation",
      "external_claim",
    ]);
    expect(plan.outline[0]?.independentOriginFamilies).toEqual(["a"]);
    expect(plan.outline[4]?.authorInterpretation).toBe("추가 확인 필요");
    expect(plan.outline[4]?.citations).toEqual([]);
    expect(plan.readiness.missingItems).toEqual(["criteria", "support"]);
  });
});
