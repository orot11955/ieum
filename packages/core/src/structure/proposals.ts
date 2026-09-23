import type { UnitRevisionRef } from "../model/types.js";
import type { ValidatedSnapshot } from "../snapshot/types.js";
import type { StructureDiagnostic } from "./diagnostics.js";

export type StructureOptionKind =
  "KEEP" | "LINK" | "CREATE_PARENT" | "SPLIT" | "MERGE";
export type ContextRevisionBase = Readonly<{
  contextId: string;
  identityRevision: number;
  membershipRevision: number;
}>;
export type MembershipMapping = Readonly<{
  unit: UnitRevisionRef;
  beforeContextIds: readonly string[];
  afterContextIds: readonly string[];
  operation: "keep" | "move" | "duplicate";
}>;
export type StructureOption = Readonly<{
  kind: StructureOptionKind;
  signature: string;
  status: "reviewable" | "blocked" | "suppressed";
  reasons: readonly string[];
  baseRevisions: readonly ContextRevisionBase[];
  createdContexts: readonly Readonly<{
    contextId: string;
    name: string;
    memberUnits: readonly UnitRevisionRef[];
  }>[];
  membershipMappings: readonly MembershipMapping[];
  addedLinks: readonly Readonly<{
    kind: "related" | "parent";
    fromContextId: string;
    toContextId: string;
  }>[];
  primaryImpacts: readonly Readonly<{
    unit: UnitRevisionRef;
    previousContextId: string | null;
    requiresChoice: boolean;
    availableContextIds: readonly string[];
  }>[];
  priorSourceImpacts: readonly Readonly<{
    resourceId: string;
    contextId: string;
    unit: UnitRevisionRef;
    requiresReview: boolean;
  }>[];
  inversePreview: Readonly<{
    restoreMemberships: readonly MembershipMapping[];
    removeCreatedContextIds: readonly string[];
    removeAddedLinks: StructureOption["addedLinks"];
    preservedContextIds: readonly string[];
  }>;
  requiresExplicitCommand: true;
}>;
export type StructureProposalRequest = Readonly<{
  snapshot: ValidatedSnapshot;
  diagnosis: StructureDiagnostic;
  contextId: string;
  peerContextId: string | null;
  currentPrimary: readonly Readonly<
    UnitRevisionRef & { contextId: string | null }
  >[];
  priorSourceUses: readonly Readonly<{
    resourceId: string;
    contextId: string;
    unit: UnitRevisionRef;
  }>[];
  parentEdges: readonly Readonly<{ parentId: string; childId: string }>[];
  relatedEdges: readonly Readonly<{ leftId: string; rightId: string }>[];
  contextPurposes: readonly Readonly<{
    contextId: string;
    purposeKey: string;
  }>[];
  newParent: Readonly<{
    contextId: string;
    name: string;
    attachUnderId: string | null;
  }> | null;
  split: Readonly<{
    newContexts: readonly Readonly<{ contextId: string; name: string }>[];
    assignments: readonly Readonly<{
      unit: UnitRevisionRef;
      targetContextIds: readonly string[];
    }>[];
  }> | null;
  rejectedSignatures: readonly string[];
}>;

function key(ref: UnitRevisionRef): string {
  return `${ref.unitId}\u0000${ref.revision}`;
}
function same(a: UnitRevisionRef, b: UnitRevisionRef): boolean {
  return a.unitId === b.unitId && a.revision === b.revision;
}
function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
function paths(
  edges: readonly Readonly<{ parentId: string; childId: string }>[],
  start: string,
  target: string,
): boolean {
  const seen = new Set<string>();
  const pending = [start];
  while (pending.length) {
    const current = pending.pop()!;
    if (current === target) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges)
      if (edge.parentId === current) pending.push(edge.childId);
  }
  return false;
}
function operation(
  before: readonly string[],
  after: readonly string[],
  sourceContextId: string,
): MembershipMapping["operation"] {
  if (before.join("\u0000") === after.join("\u0000")) return "keep";
  if (!after.includes(sourceContextId)) return "move";
  if (after.some((item) => !before.includes(item))) return "duplicate";
  return "move";
}

/** Compares preview-only alternatives; no option mutates records or chooses a primary. */
export function compareStructureOptions(
  request: StructureProposalRequest,
  hashText: (text: string) => string,
): readonly StructureOption[] {
  const {
    snapshot,
    diagnosis,
    contextId,
    peerContextId,
    currentPrimary,
    priorSourceUses,
    parentEdges,
    relatedEdges,
    contextPurposes,
    newParent,
    split,
    rejectedSignatures,
  } = request;
  const source = snapshot.contexts.find((item) => item.contextId === contextId);
  const peer =
    peerContextId === null
      ? null
      : snapshot.contexts.find((item) => item.contextId === peerContextId);
  if (
    !source ||
    (peerContextId !== null && (!peer || peerContextId === contextId)) ||
    diagnosis.snapshotInputHash !== snapshot.manifest.inputHash ||
    diagnosis.contextId !== contextId ||
    diagnosis.identityRevision !== source.identityRevision ||
    diagnosis.membershipRevision !== source.membershipRevision ||
    !Array.isArray(currentPrimary) ||
    !Array.isArray(priorSourceUses) ||
    !Array.isArray(parentEdges) ||
    !Array.isArray(relatedEdges) ||
    !Array.isArray(contextPurposes) ||
    !Array.isArray(rejectedSignatures)
  )
    throw new RangeError("structure proposal base revision or inputs disagree");
  const contextIds = new Set(snapshot.contexts.map((item) => item.contextId));
  if (
    new Set(contextPurposes.map((item) => item.contextId)).size !==
      contextPurposes.length ||
    contextPurposes.some(
      (item) =>
        !contextIds.has(item.contextId) ||
        typeof item.purposeKey !== "string" ||
        !item.purposeKey.trim(),
    ) ||
    !contextPurposes.some((item) => item.contextId === contextId) ||
    (peer && !contextPurposes.some((item) => item.contextId === peer.contextId))
  )
    throw new RangeError("approved context purposes are incomplete");
  const purpose = new Map(
    contextPurposes.map((item) => [item.contextId, item.purposeKey]),
  );
  if (
    new Set(currentPrimary.map(key)).size !== currentPrimary.length ||
    currentPrimary.length !== source.memberUnits.length ||
    currentPrimary.some(
      (item) =>
        !source.memberUnits.some((ref) => same(ref, item)) ||
        (item.contextId !== null &&
          !snapshot.contexts.some(
            (context) =>
              context.contextId === item.contextId &&
              context.memberUnits.some((ref) => same(ref, item)),
          )),
    )
  )
    throw new RangeError("current primary state must match source members");
  if (
    parentEdges.some(
      (edge) =>
        !contextIds.has(edge.parentId) ||
        !contextIds.has(edge.childId) ||
        edge.parentId === edge.childId,
    ) ||
    parentEdges.some((edge) => paths(parentEdges, edge.childId, edge.parentId))
  )
    throw new RangeError("context parent graph is invalid or cyclic");
  if (
    relatedEdges.some(
      (edge) =>
        !contextIds.has(edge.leftId) ||
        !contextIds.has(edge.rightId) ||
        edge.leftId === edge.rightId,
    )
  )
    throw new RangeError("context related graph is invalid");
  if (
    priorSourceUses.some(
      (item) =>
        !item.resourceId.trim() ||
        !contextIds.has(item.contextId) ||
        !snapshot.units.some((unit) => same(unit, item.unit)) ||
        !snapshot.contexts.some(
          (context) =>
            context.contextId === item.contextId &&
            context.memberUnits.some((member) => same(member, item.unit)),
        ),
    )
  )
    throw new RangeError("prior source use is outside snapshot");
  if (rejectedSignatures.some((item) => !/^[a-f0-9]{64}$/.test(item)))
    throw new RangeError("invalid rejected structure signature");
  if (
    newParent &&
    (!newParent.contextId.trim() ||
      !newParent.name.trim() ||
      contextIds.has(newParent.contextId) ||
      (newParent.attachUnderId !== null &&
        !contextIds.has(newParent.attachUnderId)))
  )
    throw new RangeError("invalid new parent definition");
  if (split) {
    if (
      split.newContexts.length < 2 ||
      new Set(split.newContexts.map((item) => item.contextId)).size !==
        split.newContexts.length ||
      split.newContexts.some(
        (item) =>
          !item.contextId.trim() ||
          !item.name.trim() ||
          contextIds.has(item.contextId),
      ) ||
      split.assignments.length !== source.memberUnits.length ||
      new Set(split.assignments.map((item) => key(item.unit))).size !==
        split.assignments.length ||
      split.assignments.some(
        (item) =>
          !source.memberUnits.some((ref) => same(ref, item.unit)) ||
          !item.targetContextIds.length ||
          new Set(item.targetContextIds).size !==
            item.targetContextIds.length ||
          item.targetContextIds.some(
            (id) =>
              id !== contextId &&
              !split.newContexts.some((context) => context.contextId === id),
          ),
      ) ||
      split.newContexts.some(
        (context) =>
          !split.assignments.some((item) =>
            item.targetContextIds.includes(context.contextId),
          ),
      )
    )
      throw new RangeError(
        "split mapping must cover all source members and new contexts",
      );
  }
  const bases = [source, ...(peer ? [peer] : [])].map((item) => ({
    contextId: item.contextId,
    identityRevision: item.identityRevision,
    membershipRevision: item.membershipRevision,
  }));
  const before = (unit: UnitRevisionRef) =>
    uniqueSorted(
      snapshot.contexts
        .filter((context) => context.memberUnits.some((ref) => same(ref, unit)))
        .map((context) => context.contextId),
    );
  const mapping = (
    unit: UnitRevisionRef,
    afterIds: readonly string[],
  ): MembershipMapping => {
    const beforeContextIds = before(unit);
    const afterContextIds = uniqueSorted(afterIds);
    return {
      unit: { unitId: unit.unitId, revision: unit.revision },
      beforeContextIds,
      afterContextIds,
      operation: operation(beforeContextIds, afterContextIds, contextId),
    };
  };
  const baseMappings = source.memberUnits.map((unit) =>
    mapping(unit, before(unit)),
  );
  const reasonsFor = (kind: StructureOptionKind): string[] => {
    const reasons: string[] = [];
    if (
      diagnosis.readiness === "insufficient" &&
      ["CREATE_PARENT", "SPLIT", "MERGE"].includes(kind)
    )
      reasons.push("INSUFFICIENT_DIAGNOSTIC");
    if (peer === null && ["LINK", "CREATE_PARENT", "MERGE"].includes(kind))
      reasons.push("PEER_REQUIRED");
    if (kind === "CREATE_PARENT" && !newParent)
      reasons.push("PARENT_DEFINITION_REQUIRED");
    if (kind === "SPLIT" && !split) reasons.push("SPLIT_MAPPING_REQUIRED");
    if (
      kind === "MERGE" &&
      peer &&
      purpose.get(contextId) !== purpose.get(peer.contextId)
    )
      reasons.push("PURPOSE_CONFLICT");
    if (kind === "MERGE" && diagnosis.purposeCount > 1)
      reasons.push("SOURCE_PURPOSE_MIXED");
    if (
      (kind === "MERGE" || kind === "CREATE_PARENT") &&
      peer &&
      (paths(parentEdges, source.contextId, peer.contextId) ||
        paths(parentEdges, peer.contextId, source.contextId))
    )
      reasons.push("PARENT_CHILD_NOT_PEERS");
    if (
      kind === "CREATE_PARENT" &&
      newParent &&
      peer &&
      (newParent.attachUnderId === source.contextId ||
        newParent.attachUnderId === peer.contextId ||
        (newParent.attachUnderId !== null &&
          (paths(parentEdges, source.contextId, newParent.attachUnderId) ||
            paths(parentEdges, peer.contextId, newParent.attachUnderId))))
    )
      reasons.push("PARENT_CYCLE");
    if (
      kind === "LINK" &&
      peer &&
      relatedEdges.some(
        (edge) =>
          (edge.leftId === contextId && edge.rightId === peerContextId) ||
          (edge.rightId === contextId && edge.leftId === peerContextId),
      )
    )
      reasons.push("LINK_ALREADY_EXISTS");
    return reasons;
  };
  const kinds: StructureOptionKind[] = [
    "KEEP",
    "LINK",
    "CREATE_PARENT",
    "SPLIT",
    "MERGE",
  ];
  return kinds.map((kind): StructureOption => {
    const reasons = reasonsFor(kind);
    let mappings = [...baseMappings];
    let createdContexts: StructureOption["createdContexts"] = [];
    let addedLinks: StructureOption["addedLinks"] = [];
    if (kind === "LINK" && peer)
      addedLinks = [
        {
          kind: "related",
          fromContextId: contextId,
          toContextId: peer.contextId,
        },
      ];
    if (kind === "CREATE_PARENT" && peer && newParent) {
      createdContexts = [
        {
          contextId: newParent.contextId,
          name: newParent.name,
          memberUnits: [],
        },
      ];
      addedLinks = [
        {
          kind: "parent",
          fromContextId: newParent.contextId,
          toContextId: contextId,
        },
        {
          kind: "parent",
          fromContextId: newParent.contextId,
          toContextId: peer.contextId,
        },
        ...(newParent.attachUnderId === null
          ? []
          : [
              {
                kind: "parent" as const,
                fromContextId: newParent.attachUnderId,
                toContextId: newParent.contextId,
              },
            ]),
      ];
    }
    if (kind === "SPLIT" && split) {
      mappings = source.memberUnits.map((unit) => {
        const targets = split.assignments.find((item) =>
          same(item.unit, unit),
        )!.targetContextIds;
        return mapping(unit, [
          ...before(unit).filter((id) => id !== contextId),
          ...targets,
        ]);
      });
      createdContexts = [...split.newContexts]
        .sort((a, b) =>
          a.contextId < b.contextId ? -1 : a.contextId > b.contextId ? 1 : 0,
        )
        .map((context) => ({
          contextId: context.contextId,
          name: context.name,
          memberUnits: mappings
            .filter((item) => item.afterContextIds.includes(context.contextId))
            .map((item) => item.unit),
        }));
    }
    if (kind === "MERGE" && peer)
      mappings = source.memberUnits.map((unit) =>
        mapping(unit, [
          ...before(unit).filter((id) => id !== contextId),
          peer.contextId,
        ]),
      );
    const primaryImpacts = mappings.map((item) => {
      const previousContextId = currentPrimary.find((primary) =>
        same(primary, item.unit),
      )!.contextId;
      return {
        unit: item.unit,
        previousContextId,
        requiresChoice:
          previousContextId !== null &&
          !item.afterContextIds.includes(previousContextId),
        availableContextIds: item.afterContextIds,
      };
    });
    const changed = new Map(
      mappings
        .filter((item) => item.operation !== "keep")
        .map((item) => [key(item.unit), item]),
    );
    const priorSourceImpacts = priorSourceUses
      .filter(
        (item) => changed.has(key(item.unit)) && item.contextId === contextId,
      )
      .map((item) => ({
        resourceId: item.resourceId,
        contextId: item.contextId,
        unit: item.unit,
        requiresReview: true,
      }));
    const signature = hashText(
      JSON.stringify([kind, bases, createdContexts, mappings, addedLinks]),
    );
    if (!/^[a-f0-9]{64}$/.test(signature))
      throw new RangeError("structure signature must be SHA-256 hex");
    const suppressed = rejectedSignatures.includes(signature);
    return {
      kind,
      signature,
      status: suppressed
        ? "suppressed"
        : reasons.length
          ? "blocked"
          : "reviewable",
      reasons: [...reasons, ...(suppressed ? ["PREVIOUSLY_REJECTED"] : [])],
      baseRevisions: bases,
      createdContexts,
      membershipMappings: mappings,
      addedLinks,
      primaryImpacts,
      priorSourceImpacts,
      inversePreview: {
        restoreMemberships: mappings,
        removeCreatedContextIds: createdContexts.map((item) => item.contextId),
        removeAddedLinks: addedLinks,
        preservedContextIds: bases.map((item) => item.contextId),
      },
      requiresExplicitCommand: true,
    };
  });
}
