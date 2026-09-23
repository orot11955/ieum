import type { ValidatedSnapshot } from "../snapshot/types.js";

export const FUSION_CONFIG = Object.freeze({
  version: "rrf-v1",
  k0: 60,
  budget: 32,
});
export type RankHit = Readonly<{ contextId: string; rank: number }>;
export type SemanticRankSource =
  | Readonly<{ status: "ok"; hits: readonly RankHit[] }>
  | Readonly<{ status: "error"; code: string }>;
export type FusedHit = Readonly<{
  contextId: string;
  rank: number;
  rrfScore: number;
  lexicalRank: number | null;
  semanticRank: number | null;
}>;
export type FusionResult = Readonly<{
  snapshotInputHash: string;
  config: typeof FUSION_CONFIG;
  profileId: "hybrid-v0" | "lexical-degraded-v0";
  semanticFailureCode: string | null;
  hits: readonly FusedHit[];
}>;
export type AuxiliaryRankSignals = Readonly<{
  contextId: string;
  graph: number | null;
  session: number | null;
}>;
export type AuxiliaryFusionResult = Readonly<{
  profileId: "hybrid-graph-session-ablation-v0";
  snapshotInputHash: string;
  hits: readonly Readonly<{
    contextId: string;
    rank: number;
    fusionRank: number;
    rankOnlyScore: number;
    auxiliaryBoost: number;
  }>[];
}>;

function rankMap(
  hits: readonly RankHit[],
  allowed: ReadonlySet<string>,
  name: string,
): Map<string, number> {
  const result = new Map<string, number>();
  const ranks = new Set<number>();
  for (const hit of hits) {
    if (!allowed.has(hit.contextId) || result.has(hit.contextId))
      throw new RangeError(`${name} contains ineligible or duplicate context`);
    if (!Number.isSafeInteger(hit.rank) || hit.rank < 1 || ranks.has(hit.rank))
      throw new RangeError(`${name} requires unique positive ranks`);
    result.set(hit.contextId, hit.rank);
    ranks.add(hit.rank);
  }
  return result;
}

/** RRF merges ranks only; its value is never treated as confidence or content evidence. */
export function fuseRankings(
  snapshot: ValidatedSnapshot,
  lexicalHits: readonly RankHit[],
  semantic: SemanticRankSource,
  budget = FUSION_CONFIG.budget,
): FusionResult {
  if (!Number.isSafeInteger(budget) || budget < 1)
    throw new RangeError("fusion budget must be positive");
  const allowed = new Set(snapshot.contexts.map((item) => item.contextId));
  const lexical = rankMap(lexicalHits, allowed, "lexical source");
  if (semantic.status === "error" && !/^[A-Z][A-Z0-9_]*$/.test(semantic.code))
    throw new RangeError("semantic failure code must be stable uppercase");
  const semanticRanks =
    semantic.status === "ok"
      ? rankMap(semantic.hits, allowed, "semantic source")
      : new Map<string, number>();
  if (semantic.status === "ok" && semanticRanks.size !== allowed.size)
    throw new RangeError("hybrid source must contain every eligible context");
  const ids = new Set([...lexical.keys(), ...semanticRanks.keys()]);
  const ranked = [...ids].map((contextId) => {
    const lexicalRank = lexical.get(contextId) ?? null;
    const semanticRank = semanticRanks.get(contextId) ?? null;
    const rrfScore =
      (lexicalRank === null ? 0 : 1 / (FUSION_CONFIG.k0 + lexicalRank)) +
      (semanticRank === null ? 0 : 1 / (FUSION_CONFIG.k0 + semanticRank));
    return { contextId, lexicalRank, semanticRank, rrfScore };
  });
  ranked.sort(
    (a, b) =>
      b.rrfScore - a.rrfScore ||
      (a.contextId < b.contextId ? -1 : a.contextId > b.contextId ? 1 : 0),
  );
  return {
    snapshotInputHash: snapshot.manifest.inputHash,
    config: FUSION_CONFIG,
    profileId: semantic.status === "ok" ? "hybrid-v0" : "lexical-degraded-v0",
    semanticFailureCode: semantic.status === "error" ? semantic.code : null,
    hits: ranked
      .slice(0, budget)
      .map((hit, index) => ({ ...hit, rank: index + 1 })),
  };
}

/** B3 rank-only ablation. Content gates remain independent of this ordering. */
export function rerankFusionWithAuxiliary(
  fusion: FusionResult,
  signals: readonly AuxiliaryRankSignals[],
): AuxiliaryFusionResult {
  if (fusion.profileId !== "hybrid-v0")
    throw new RangeError("B3 ablation requires a complete hybrid profile");
  const byContext = new Map<string, AuxiliaryRankSignals>();
  for (const item of signals) {
    if (byContext.has(item.contextId))
      throw new RangeError("duplicate auxiliary context");
    for (const value of [item.graph, item.session])
      if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1))
        throw new RangeError("invalid auxiliary rank signal");
    byContext.set(item.contextId, item);
  }
  if (
    byContext.size !== fusion.hits.length ||
    fusion.hits.some((hit) => !byContext.has(hit.contextId))
  )
    throw new RangeError("auxiliary signals must cover fused contexts exactly");
  const maximumRrf = 2 / (FUSION_CONFIG.k0 + 1);
  const ordered = fusion.hits.map((hit) => {
    const signal = byContext.get(hit.contextId)!;
    const auxiliaryBoost =
      0.05 * (signal.graph ?? 0) + 0.03 * (signal.session ?? 0);
    return {
      contextId: hit.contextId,
      fusionRank: hit.rank,
      rankOnlyScore: Math.min(1, hit.rrfScore / maximumRrf + auxiliaryBoost),
      auxiliaryBoost,
    };
  });
  ordered.sort(
    (a, b) =>
      b.rankOnlyScore - a.rankOnlyScore ||
      (a.contextId < b.contextId ? -1 : a.contextId > b.contextId ? 1 : 0),
  );
  return {
    profileId: "hybrid-graph-session-ablation-v0",
    snapshotInputHash: fusion.snapshotInputHash,
    hits: ordered.map((hit, index) => ({ ...hit, rank: index + 1 })),
  };
}
