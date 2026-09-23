import { describe, expect, it } from "vitest";
import { validateSnapshot } from "../snapshot/validator.js";
import {
  STRUCTURE_DIAGNOSTIC_CONFIG,
  diagnoseContextStructure,
} from "./diagnostics.js";
import { compareStructureOptions } from "./proposals.js";
import type { StructureProposalRequest } from "./proposals.js";

const hash = (text: string) => {
  let sum = 0;
  for (const character of text)
    sum = (sum * 31 + character.charCodeAt(0)) >>> 0;
  return sum.toString(16).padStart(8, "0").repeat(8);
};
const ids = ["a", "b", "c", "d", "e"];
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
        originKey: id,
        recordedAt: 80,
        occurredAt: null,
      })),
    ],
    units: [
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
        originKey: id,
        sourceSpan: { start: 0, end: 8, encoding: "utf16" as const },
        content: { kind: "quote" as const, text: `source ${id}` },
        recordedAt: 80,
      })),
    ],
    contexts: [
      {
        workspaceId: "w",
        contextId: "source",
        identityRevision: 2,
        membershipRevision: 3,
        name: "source",
        recordedAt: 80,
        memberUnits: ["a", "b", "c", "d"].map((unitId) => ({
          unitId,
          revision: 1,
        })),
      },
      {
        workspaceId: "w",
        contextId: "peer",
        identityRevision: 1,
        membershipRevision: 2,
        name: "peer",
        recordedAt: 80,
        memberUnits: ["a", "e"].map((unitId) => ({ unitId, revision: 1 })),
      },
      {
        workspaceId: "w",
        contextId: "root",
        identityRevision: 4,
        membershipRevision: 5,
        name: "root",
        recordedAt: 80,
        memberUnits: [{ unitId: "e", revision: 1 }],
      },
    ],
    relations: [],
    visibility: [],
    profileWatermarks: [],
  },
  "a".repeat(64),
);
const diagnosis = diagnoseContextStructure(
  {
    snapshot,
    contextId: "source",
    membershipRevision: 3,
    dirty: true,
    modelNamespace: "fixed-model-v1",
    members: ["a", "b", "c", "d"].map((unitId) => ({
      unitId,
      revision: 1,
      vector: [1, 0],
      purposeKey: "planning",
      stance: "neutral" as const,
    })),
    config: STRUCTURE_DIAGNOSTIC_CONFIG,
  },
  hash,
);
const request: StructureProposalRequest = {
  snapshot,
  diagnosis,
  contextId: "source",
  peerContextId: "peer",
  currentPrimary: [
    { unitId: "a", revision: 1, contextId: "source" },
    { unitId: "b", revision: 1, contextId: "source" },
    { unitId: "c", revision: 1, contextId: null },
    { unitId: "d", revision: 1, contextId: "source" },
  ],
  priorSourceUses: [
    {
      resourceId: "document-1",
      contextId: "source",
      unit: { unitId: "b", revision: 1 },
    },
    {
      resourceId: "document-2",
      contextId: "source",
      unit: { unitId: "d", revision: 1 },
    },
  ],
  parentEdges: [],
  relatedEdges: [],
  contextPurposes: [
    { contextId: "source", purposeKey: "planning" },
    { contextId: "peer", purposeKey: "planning" },
  ],
  newParent: { contextId: "parent-new", name: "work", attachUnderId: null },
  split: {
    newContexts: [
      { contextId: "new-a", name: "first" },
      { contextId: "new-b", name: "second" },
    ],
    assignments: [
      {
        unit: { unitId: "a", revision: 1 },
        targetContextIds: ["source", "new-a"],
      },
      { unit: { unitId: "b", revision: 1 }, targetContextIds: ["new-a"] },
      { unit: { unitId: "c", revision: 1 }, targetContextIds: ["new-b"] },
      { unit: { unitId: "d", revision: 1 }, targetContextIds: ["source"] },
    ],
  },
  rejectedSignatures: [],
};
const option = (
  value: StructureProposalRequest,
  kind: "KEEP" | "LINK" | "CREATE_PARENT" | "SPLIT" | "MERGE",
) => compareStructureOptions(value, hash).find((item) => item.kind === kind)!;

describe("structure change option previews", () => {
  it("compares five options with explicit split move, duplicate, residual, primary and inverse mappings", () => {
    const all = compareStructureOptions(request, hash);
    expect(all.map((item) => item.kind)).toEqual([
      "KEEP",
      "LINK",
      "CREATE_PARENT",
      "SPLIT",
      "MERGE",
    ]);
    const split = option(request, "SPLIT");
    expect(split.status).toBe("reviewable");
    expect(split.membershipMappings.map((item) => item.operation)).toEqual([
      "duplicate",
      "move",
      "move",
      "keep",
    ]);
    expect(split.membershipMappings[0]!.afterContextIds).toEqual([
      "new-a",
      "peer",
      "source",
    ]);
    expect(split.membershipMappings[3]!.afterContextIds).toEqual(["source"]);
    expect(
      split.primaryImpacts.find((item) => item.unit.unitId === "b")!
        .requiresChoice,
    ).toBe(true);
    expect(
      split.primaryImpacts.find((item) => item.unit.unitId === "a")!
        .requiresChoice,
    ).toBe(false);
    expect(split.priorSourceImpacts.map((item) => item.resourceId)).toEqual([
      "document-1",
    ]);
    expect(split.inversePreview.removeCreatedContextIds).toEqual([
      "new-a",
      "new-b",
    ]);
    expect(split.requiresExplicitCommand).toBe(true);
    expect("routingPrecision" in split).toBe(false);
    expect(
      option(request, "KEEP").membershipMappings.every(
        (item) => item.operation === "keep",
      ),
    ).toBe(true);
    expect(option(request, "LINK").addedLinks).toEqual([
      { kind: "related", fromContextId: "source", toContextId: "peer" },
    ]);
    expect(
      option(request, "CREATE_PARENT").createdContexts[0]!.memberUnits,
    ).toEqual([]);
    const attached = {
      ...request,
      newParent: {
        contextId: "parent-new",
        name: "work",
        attachUnderId: "root",
      },
    };
    expect(option(attached, "CREATE_PARENT").baseRevisions).toContainEqual({
      contextId: "root",
      identityRevision: 4,
      membershipRevision: 5,
    });
  });
  it("keeps old context identities in merge and blocks different-purpose or parent-child merges", () => {
    const merge = option(request, "MERGE");
    expect(merge.status).toBe("reviewable");
    expect(merge.inversePreview.preservedContextIds).toEqual([
      "source",
      "peer",
    ]);
    expect(
      merge.membershipMappings.every(
        (item) => !item.afterContextIds.includes("source"),
      ),
    ).toBe(true);
    expect(
      merge.primaryImpacts.filter((item) => item.requiresChoice),
    ).toHaveLength(3);
    const different = {
      ...request,
      contextPurposes: [
        { contextId: "source", purposeKey: "planning" },
        { contextId: "peer", purposeKey: "archive" },
      ],
    };
    expect(option(different, "MERGE").reasons).toContain("PURPOSE_CONFLICT");
    const parentChild = {
      ...request,
      parentEdges: [{ parentId: "source", childId: "peer" }],
    };
    expect(option(parentChild, "MERGE").reasons).toContain(
      "PARENT_CHILD_NOT_PEERS",
    );
    expect(option(parentChild, "CREATE_PARENT").reasons).toContain(
      "PARENT_CHILD_NOT_PEERS",
    );
    const cycle = {
      ...parentChild,
      newParent: {
        contextId: "parent-new",
        name: "work",
        attachUnderId: "peer",
      },
    };
    expect(option(cycle, "CREATE_PARENT").reasons).toContain("PARENT_CYCLE");
    const insufficient = {
      ...request,
      diagnosis: { ...diagnosis, readiness: "insufficient" as const },
    };
    expect(option(insufficient, "SPLIT").reasons).toContain(
      "INSUFFICIENT_DIAGNOSTIC",
    );
    expect(option(insufficient, "KEEP").status).toBe("reviewable");
  });
  it("suppresses an exact rejected proposal and rejects stale preview or cyclic input graph", () => {
    const signature = option(request, "SPLIT").signature;
    expect(
      option({ ...request, rejectedSignatures: [signature] }, "SPLIT").status,
    ).toBe("suppressed");
    const stale = {
      ...request,
      diagnosis: { ...diagnosis, membershipRevision: 99 },
    };
    expect(() => compareStructureOptions(stale, hash)).toThrow(/revision/);
    const cyclic = {
      ...request,
      parentEdges: [
        { parentId: "source", childId: "peer" },
        { parentId: "peer", childId: "source" },
      ],
    };
    expect(() => compareStructureOptions(cyclic, hash)).toThrow(/cyclic/);
    const invalidSplit = {
      ...request,
      split: {
        ...request.split!,
        assignments: request.split!.assignments.slice(1),
      },
    };
    expect(() => compareStructureOptions(invalidSplit, hash)).toThrow(/cover/);
    expect(() =>
      compareStructureOptions(
        {
          ...request,
          priorSourceUses: [
            {
              resourceId: "document-fake",
              contextId: "peer",
              unit: { unitId: "b", revision: 1 },
            },
          ],
        },
        hash,
      ),
    ).toThrow(/prior source/);
  });
});
