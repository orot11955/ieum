import { cosineSimilarity } from "../features/semantic/index.js";
import type { UnitRevisionRef } from "../model/types.js";
import type { ValidatedSnapshot } from "../snapshot/types.js";

export const STRUCTURE_DIAGNOSTIC_CONFIG = Object.freeze({
  version: "structure-diagnostic-v1" as const,
  maximumMembers: 64,
  minimumMembers: 4,
  minimumIndependentOrigins: 3,
  similarityEdge: 0.72,
  seed: 0,
});
export type StructureDiagnosticConfig = Readonly<{
  version: "structure-diagnostic-v1";
  maximumMembers: number;
  minimumMembers: number;
  minimumIndependentOrigins: number;
  similarityEdge: number;
  seed: number;
}>;
export type StructureMemberSignal = Readonly<{
  unitId: string;
  revision: number;
  vector: readonly number[];
  purposeKey: string;
  stance: "support" | "counter" | "neutral";
}>;
export type StructureDiagnosticInput = Readonly<{
  snapshot: ValidatedSnapshot;
  contextId: string;
  membershipRevision: number;
  dirty: true;
  modelNamespace: string;
  members: readonly StructureMemberSignal[];
  config: StructureDiagnosticConfig;
}>;
export type StructureSource = Readonly<{
  unitId: string;
  revision: number;
  captureId: string;
  captureRevision: number;
  originKey: string;
  sourceText: string;
}>;
export type StructureDiagnostic = Readonly<{
  runKey: string;
  snapshotInputHash: string;
  contextId: string;
  identityRevision: number;
  membershipRevision: number;
  modelNamespace: string;
  signalHash: string;
  config: StructureDiagnosticConfig;
  readiness: "insufficient" | "diagnostic";
  limitations: readonly string[];
  memberCount: number;
  independentOriginCount: number;
  purposeCount: number;
  pairwise: readonly Readonly<{
    left: UnitRevisionRef;
    right: UnitRevisionRef;
    cosine: number;
    sameOrigin: boolean;
    samePurpose: boolean;
    opposedStance: boolean;
    edge: boolean;
  }>[];
  components: readonly Readonly<{
    members: readonly UnitRevisionRef[];
    representative: StructureSource;
  }>[];
  bridgeMembers: readonly UnitRevisionRef[];
  outlierMembers: readonly UnitRevisionRef[];
  highSimilarityPurposeConflicts: number;
  opposedPairs: number;
  representativeSources: readonly StructureSource[];
  action: "none";
}>;

function key(ref: UnitRevisionRef): string {
  return `${ref.unitId}\u0000${ref.revision}`;
}
function sameRef(a: UnitRevisionRef, b: UnitRevisionRef): boolean {
  return a.unitId === b.unitId && a.revision === b.revision;
}
function componentsOf(
  adjacency: readonly ReadonlySet<number>[],
  removed = -1,
): number[][] {
  const visited = new Set<number>();
  const groups: number[][] = [];
  for (let index = 0; index < adjacency.length; index++) {
    if (index === removed || visited.has(index)) continue;
    const group: number[] = [];
    const pending = [index];
    visited.add(index);
    while (pending.length) {
      const current = pending.pop()!;
      group.push(current);
      for (const neighbor of adjacency[current]!) {
        if (neighbor === removed || visited.has(neighbor)) continue;
        visited.add(neighbor);
        pending.push(neighbor);
      }
    }
    group.sort((a, b) => a - b);
    groups.push(group);
  }
  return groups;
}

/** Pure, bounded diagnosis of one changed and already approved context snapshot. */
export function diagnoseContextStructure(
  input: StructureDiagnosticInput,
  hashText: (text: string) => string,
): StructureDiagnostic {
  const {
    snapshot,
    contextId,
    membershipRevision,
    modelNamespace,
    members,
    config,
  } = input;
  if (
    input.dirty !== true ||
    typeof contextId !== "string" ||
    !contextId.trim() ||
    typeof modelNamespace !== "string" ||
    !modelNamespace.trim() ||
    !config ||
    config.version !== STRUCTURE_DIAGNOSTIC_CONFIG.version ||
    !Number.isSafeInteger(config.maximumMembers) ||
    config.maximumMembers < 1 ||
    config.maximumMembers > 64 ||
    !Number.isSafeInteger(config.minimumMembers) ||
    config.minimumMembers < 2 ||
    config.minimumMembers > config.maximumMembers ||
    !Number.isSafeInteger(config.minimumIndependentOrigins) ||
    config.minimumIndependentOrigins < 2 ||
    config.minimumIndependentOrigins > config.maximumMembers ||
    !Number.isFinite(config.similarityEdge) ||
    config.similarityEdge < -1 ||
    config.similarityEdge > 1 ||
    !Number.isSafeInteger(config.seed) ||
    config.seed < 0
  )
    throw new RangeError("invalid structure diagnostic config");
  const context = snapshot.contexts.find(
    (item) => item.contextId === contextId,
  );
  if (
    !context ||
    context.membershipRevision !== membershipRevision ||
    !snapshot.manifest.eligibleContexts.some(
      (item) =>
        item.contextId === contextId &&
        item.membershipRevision === membershipRevision,
    )
  )
    throw new RangeError("dirty context revision is outside approved snapshot");
  if (context.memberUnits.length > config.maximumMembers)
    throw new RangeError("context exceeds pairwise diagnostic budget");
  if (
    !Array.isArray(members) ||
    members.length !== context.memberUnits.length ||
    new Set(members.map(key)).size !== members.length ||
    members.some(
      (item) => !context.memberUnits.some((ref) => sameRef(ref, item)),
    )
  )
    throw new RangeError(
      "structure signals must exactly match context membership",
    );
  const signals = [...members].sort((a, b) =>
    key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0,
  );
  const signalHash = hashText(
    JSON.stringify([
      modelNamespace,
      signals.map((item) => [
        item.unitId,
        item.revision,
        item.vector,
        item.purposeKey,
        item.stance,
      ]),
    ]),
  );
  if (!/^[a-f0-9]{64}$/.test(signalHash))
    throw new RangeError("structure signal hash must be SHA-256 hex");
  const sources = signals.map((item): StructureSource => {
    if (
      typeof item.purposeKey !== "string" ||
      !item.purposeKey.trim() ||
      !["support", "counter", "neutral"].includes(item.stance)
    )
      throw new RangeError("invalid approved purpose signal");
    const unit = snapshot.units.find((value) => sameRef(value, item));
    if (!unit) throw new RangeError("structure unit is outside snapshot");
    const capture = snapshot.captures.find(
      (value) =>
        value.captureId === unit.captureId &&
        value.revision === unit.captureRevision,
    );
    if (!capture) throw new RangeError("structure source capture is missing");
    if (!Array.isArray(item.vector) || item.vector.length === 0)
      throw new RangeError("invalid structure vector");
    cosineSimilarity(item.vector, item.vector);
    return {
      unitId: unit.unitId,
      revision: unit.revision,
      captureId: unit.captureId,
      captureRevision: unit.captureRevision,
      originKey: unit.originKey,
      sourceText: capture.rawBody.slice(
        unit.sourceSpan.start,
        unit.sourceSpan.end,
      ),
    };
  });
  const dimensions = signals[0]?.vector.length ?? 0;
  if (signals.some((item) => item.vector.length !== dimensions))
    throw new RangeError("structure vectors have mixed dimensions");
  const adjacency = signals.map(() => new Set<number>());
  const pairwise: StructureDiagnostic["pairwise"][number][] = [];
  let highSimilarityPurposeConflicts = 0;
  let opposedPairs = 0;
  for (let left = 0; left < signals.length; left++)
    for (let right = left + 1; right < signals.length; right++) {
      const a = signals[left]!;
      const b = signals[right]!;
      const cosine = cosineSimilarity(a.vector, b.vector);
      const sameOrigin = sources[left]!.originKey === sources[right]!.originKey;
      const samePurpose = a.purposeKey === b.purposeKey;
      const opposedStance =
        samePurpose &&
        ((a.stance === "support" && b.stance === "counter") ||
          (a.stance === "counter" && b.stance === "support"));
      const edge = cosine >= config.similarityEdge && samePurpose;
      if (edge) {
        adjacency[left]!.add(right);
        adjacency[right]!.add(left);
      }
      if (cosine >= config.similarityEdge && !samePurpose)
        highSimilarityPurposeConflicts++;
      if (opposedStance) opposedPairs++;
      pairwise.push({
        left: { unitId: a.unitId, revision: a.revision },
        right: { unitId: b.unitId, revision: b.revision },
        cosine,
        sameOrigin,
        samePurpose,
        opposedStance,
        edge,
      });
    }
  const groups = componentsOf(adjacency);
  const originCount = new Set(sources.map((item) => item.originKey)).size;
  const limitations: string[] = [];
  if (signals.length < config.minimumMembers)
    limitations.push("SMALL_MEMBER_SAMPLE");
  if (originCount < config.minimumIndependentOrigins)
    limitations.push("LOW_ORIGIN_DIVERSITY");
  const multiContext = signals.map(
    (item) =>
      snapshot.contexts.filter((context) =>
        context.memberUnits.some((ref) => sameRef(ref, item)),
      ).length > 1,
  );
  if (multiContext.some(Boolean))
    limitations.push("MULTI_CONTEXT_MEMBERSHIP_PRESENT");
  const baselineComponents = groups.length;
  const bridgeMembers = signals
    .filter(
      (_item, index) =>
        multiContext[index] ||
        (adjacency[index]!.size > 1 &&
          componentsOf(adjacency, index).length > baselineComponents),
    )
    .map((item) => ({ unitId: item.unitId, revision: item.revision }));
  const outlierMembers = signals
    .filter((_, index) => adjacency[index]!.size === 0)
    .map((item) => ({ unitId: item.unitId, revision: item.revision }));
  const components = groups.map((group) => ({
    members: group.map((index) => ({
      unitId: signals[index]!.unitId,
      revision: signals[index]!.revision,
    })),
    representative: sources[group[config.seed % group.length]!]!,
  }));
  return {
    runKey: JSON.stringify([
      snapshot.manifest.inputHash,
      context.contextId,
      context.identityRevision,
      context.membershipRevision,
      modelNamespace,
      signalHash,
      config.version,
      config.maximumMembers,
      config.minimumMembers,
      config.minimumIndependentOrigins,
      config.similarityEdge,
      config.seed,
    ]),
    snapshotInputHash: snapshot.manifest.inputHash,
    contextId,
    identityRevision: context.identityRevision,
    membershipRevision,
    modelNamespace,
    signalHash,
    config,
    readiness: limitations.some(
      (item) =>
        item === "SMALL_MEMBER_SAMPLE" || item === "LOW_ORIGIN_DIVERSITY",
    )
      ? "insufficient"
      : "diagnostic",
    limitations,
    memberCount: signals.length,
    independentOriginCount: originCount,
    purposeCount: new Set(signals.map((item) => item.purposeKey)).size,
    pairwise,
    components,
    bridgeMembers,
    outlierMembers,
    highSimilarityPurposeConflicts,
    opposedPairs,
    representativeSources: components.map((item) => item.representative),
    action: "none",
  };
}
