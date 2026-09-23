import { describe, expect, it } from "vitest";
import { validateSnapshot } from "../snapshot/validator.js";
import {
  STRUCTURE_DIAGNOSTIC_CONFIG,
  diagnoseContextStructure,
} from "./diagnostics.js";
import type {
  StructureDiagnosticInput,
  StructureMemberSignal,
} from "./diagnostics.js";

function fixture(repeatedOrigin = false) {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const origin = (id: string) =>
    repeatedOrigin ? "shared" : id === "f" ? "a" : id;
  const captures = [
    {
      workspaceId: "w",
      captureId: "cq",
      revision: 1,
      rawBody: "query",
      originKey: "query",
      recordedAt: 90,
      occurredAt: null,
    },
    ...ids.map((id) => ({
      workspaceId: "w",
      captureId: `c${id}`,
      revision: 1,
      rawBody: `source ${id}`,
      originKey: origin(id),
      recordedAt: 80,
      occurredAt: null,
    })),
  ];
  const units = [
    {
      workspaceId: "w",
      unitId: "q",
      revision: 1,
      captureId: "cq",
      captureRevision: 1,
      originKey: "query",
      sourceSpan: { start: 0, end: 5, encoding: "utf16" as const },
      content: { kind: "quote" as const, text: "query" },
      recordedAt: 90,
    },
    ...ids.map((id) => ({
      workspaceId: "w",
      unitId: id,
      revision: 1,
      captureId: `c${id}`,
      captureRevision: 1,
      originKey: origin(id),
      sourceSpan: { start: 0, end: 8, encoding: "utf16" as const },
      content: { kind: "quote" as const, text: `source ${id}` },
      recordedAt: 80,
    })),
  ];
  return validateSnapshot(
    {
      workspaceId: "w",
      asOfRecordedAt: 100,
      query: { unitId: "q", revision: 1 },
      captures,
      units,
      contexts: [
        {
          workspaceId: "w",
          contextId: "dirty",
          identityRevision: 1,
          membershipRevision: 2,
          name: "topic",
          recordedAt: 85,
          memberUnits: ids.map((unitId) => ({ unitId, revision: 1 })),
        },
        {
          workspaceId: "w",
          contextId: "other",
          identityRevision: 1,
          membershipRevision: 1,
          name: "other",
          recordedAt: 85,
          memberUnits: [{ unitId: "a", revision: 1 }],
        },
      ],
      relations: [],
      visibility: [],
      profileWatermarks: [],
    },
    "a".repeat(64),
  );
}
const signals: StructureMemberSignal[] = [
  {
    unitId: "a",
    revision: 1,
    vector: [1, 0],
    purposeKey: "argument",
    stance: "support",
  },
  {
    unitId: "b",
    revision: 1,
    vector: [0.8, 0.6],
    purposeKey: "argument",
    stance: "support",
  },
  {
    unitId: "c",
    revision: 1,
    vector: [0.8, -0.6],
    purposeKey: "argument",
    stance: "counter",
  },
  {
    unitId: "d",
    revision: 1,
    vector: [1, 0],
    purposeKey: "checklist",
    stance: "neutral",
  },
  {
    unitId: "e",
    revision: 1,
    vector: [1, 0],
    purposeKey: "checklist",
    stance: "neutral",
  },
  {
    unitId: "f",
    revision: 1,
    vector: [0, -1],
    purposeKey: "unrelated",
    stance: "neutral",
  },
];
const input = {
  snapshot: fixture(),
  contextId: "dirty",
  membershipRevision: 2,
  dirty: true as const,
  modelNamespace: "fixed-model-v1",
  members: signals,
  config: STRUCTURE_DIAGNOSTIC_CONFIG,
};

const hash = (text: string) => {
  let sum = 0;
  for (const character of text)
    sum = (sum * 31 + character.charCodeAt(0)) >>> 0;
  return sum.toString(16).padStart(8, "0").repeat(8);
};
const diagnose = (value: StructureDiagnosticInput) =>
  diagnoseContextStructure(value, hash);

describe("bounded context structure diagnosis", () => {
  it("reports purpose conflicts, counterargument, bridge, outlier and representative raw sources without an action", () => {
    const result = diagnose(input);
    expect(result.readiness).toBe("diagnostic");
    expect(result.memberCount).toBe(6);
    expect(result.independentOriginCount).toBe(5);
    expect(result.highSimilarityPurposeConflicts).toBeGreaterThan(0);
    expect(result.opposedPairs).toBeGreaterThan(0);
    expect(result.bridgeMembers).toContainEqual({ unitId: "a", revision: 1 });
    expect(result.outlierMembers).toContainEqual({ unitId: "f", revision: 1 });
    expect(result.representativeSources[0]!.sourceText).toBe("source a");
    expect(result.limitations).toContain("MULTI_CONTEXT_MEMBERSHIP_PRESENT");
    expect(result.action).toBe("none");
    expect(
      result.pairwise.find(
        (pair) => pair.left.unitId === "a" && pair.right.unitId === "d",
      )!,
    ).toMatchObject({ cosine: 1, samePurpose: false, edge: false });
    expect(
      result.pairwise.find(
        (pair) => pair.left.unitId === "a" && pair.right.unitId === "c",
      )!,
    ).toMatchObject({ opposedStance: true, edge: true });
  });
  it("returns the same run key and independent counts on three identical runs", () => {
    const results = [1, 2, 3].map(() => diagnose(input));
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(results[0]!.independentOriginCount).toBe(5);
  });
  it("keeps small or one-origin samples diagnostic-only and enforces the pairwise budget", () => {
    const small = diagnose({
      ...input,
      config: { ...STRUCTURE_DIAGNOSTIC_CONFIG, minimumMembers: 7 },
    });
    expect(small.readiness).toBe("insufficient");
    const shared = diagnose({
      ...input,
      snapshot: fixture(true),
    });
    expect(shared.readiness).toBe("insufficient");
    expect(shared.independentOriginCount).toBe(1);
    expect(() =>
      diagnose({
        ...input,
        config: {
          ...STRUCTURE_DIAGNOSTIC_CONFIG,
          maximumMembers: 5,
          minimumMembers: 4,
        },
      }),
    ).toThrow(/budget/);
  });
  it("rejects stale membership, incomplete or out-of-scope vectors, missing dirty flag and unknown model artifact", () => {
    expect(() => diagnose({ ...input, membershipRevision: 1 })).toThrow(
      /revision/,
    );
    expect(() => diagnose({ ...input, members: signals.slice(1) })).toThrow(
      /exactly/,
    );
    expect(() =>
      diagnose({
        ...input,
        members: [
          ...signals.slice(0, -1),
          { ...signals[5]!, unitId: "outside" },
        ],
      }),
    ).toThrow(/exactly/);
    expect(() =>
      diagnose({
        ...input,
        members: [...signals.slice(0, -1), { ...signals[5]!, vector: [0, 0] }],
      }),
    ).toThrow(/zero vector/);
    expect(() => diagnose({ ...input, dirty: false as true })).toThrow(
      /config/,
    );
    expect(() => diagnoseContextStructure(input, () => "bad")).toThrow(/hash/);
    const changed = diagnose({
      ...input,
      members: [{ ...signals[0]!, vector: [0.9, 0.1] }, ...signals.slice(1)],
    });
    expect(changed.signalHash).not.toBe(
      diagnose(input).signalHash,
    );
    expect(changed.runKey).not.toBe(diagnose(input).runKey);
  });
});
