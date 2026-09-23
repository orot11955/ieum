import type { ContextSnapshot, ThoughtUnitRevision } from "../model/types.js";
import type { ValidatedSnapshot } from "../snapshot/types.js";

export const RETRIEVAL_CONFIG = Object.freeze({
  version: "identity-member-union-v1",
  defaultBudget: 32,
  memberOriginQuota: 3,
});

export type RetrievalBudget = 16 | 32 | 64 | "all";
export type RetrievalSource = "identity" | "member";

export type IdentityHit = Readonly<{
  contextId: string;
  rank: number;
  cosine: number;
}>;

export type MemberHit = IdentityHit &
  Readonly<{
    unitId: string;
    revision: number;
    originKey: string;
  }>;

export type SourceResult<Hit> =
  | Readonly<{ status: "ok"; hits: readonly Hit[]; truncated: boolean }>
  | Readonly<{ status: "error"; code: string }>;

export type RetrievalSources = Readonly<{
  identity: SourceResult<IdentityHit>;
  member: SourceResult<MemberHit>;
}>;

export type SourceRank = Readonly<{
  /** Rank among distinct contexts after source-specific deduplication. */
  rank: number;
  /** Original adapter rank before origin/context deduplication. */
  originalRank: number;
  cosine: number;
}>;

export type MemberEvidence = Readonly<{
  unitId: string;
  revision: number;
  originKey: string;
  originalRank: number;
  cosine: number;
}>;

export type RetrievedCandidate = Readonly<{
  contextId: string;
  identityRevision: number;
  membershipRevision: number;
  rank: number;
  matchStatus: "source_match" | "exhaustive_only";
  sourceRanks: Readonly<{
    identity: SourceRank | null;
    member: SourceRank | null;
  }>;
  memberEvidence: readonly MemberEvidence[];
}>;

export type SourceReport = Readonly<{
  source: RetrievalSource;
  status: "ok" | "error";
  errorCode: string | null;
  inputTruncated: boolean;
  inputHitCount: number;
  distinctContextCount: number;
  duplicatesRemoved: number;
  quotaDropped: number;
  budgetDropped: number;
  truncated: boolean;
}>;

export type RetrievalResult = Readonly<{
  config: typeof RETRIEVAL_CONFIG;
  snapshotInputHash: string;
  budget: RetrievalBudget;
  eligibleContextCount: number;
  matchedContextCount: number;
  returnedContextCount: number;
  status: "found" | "no_candidates";
  truncated: boolean;
  sources: readonly SourceReport[];
  candidates: readonly RetrievedCandidate[];
}>;

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareHits<Hit extends IdentityHit>(a: Hit, b: Hit): number {
  return a.rank - b.rank || compare(a.contextId, b.contextId);
}

function validateHit(
  hit: IdentityHit,
  contexts: ReadonlyMap<string, ContextSnapshot>,
): void {
  if (!contexts.has(hit.contextId)) {
    throw new RangeError("search hit references ineligible context");
  }
  if (!Number.isSafeInteger(hit.rank) || hit.rank < 1) {
    throw new RangeError("search hit rank must be a positive safe integer");
  }
  if (!Number.isFinite(hit.cosine) || hit.cosine < 0 || hit.cosine > 1) {
    throw new RangeError("search hit cosine must be finite and within [0,1]");
  }
}

function refKey(unitId: string, revision: number): string {
  return `${unitId}\u0000${revision}`;
}

function validateMember(
  hit: MemberHit,
  context: ContextSnapshot,
  units: ReadonlyMap<string, ThoughtUnitRevision>,
  queryOrigin: string,
): void {
  const unit = units.get(refKey(hit.unitId, hit.revision));
  if (
    !unit ||
    unit.originKey !== hit.originKey ||
    unit.originKey === queryOrigin ||
    !context.memberUnits.some(
      (ref) => ref.unitId === hit.unitId && ref.revision === hit.revision,
    )
  ) {
    throw new RangeError(
      "member hit must reference an eligible context member",
    );
  }
}

function errorCode(result: SourceResult<unknown>): string | null {
  if (result.status === "ok") return null;
  if (!/^[A-Z][A-Z0-9_]*$/.test(result.code)) {
    throw new RangeError(
      "source error code must be a stable uppercase identifier",
    );
  }
  return result.code;
}

type RankedContext = Readonly<{
  contextId: string;
  sourceRank: SourceRank;
  evidence: readonly MemberEvidence[];
}>;

function identityContexts(
  result: SourceResult<IdentityHit>,
  contexts: ReadonlyMap<string, ContextSnapshot>,
): RankedContext[] {
  if (result.status === "error") return [];
  const sorted = [...result.hits].sort(compareHits);
  const seen = new Set<string>();
  return sorted.map((hit, index) => {
    validateHit(hit, contexts);
    if (seen.has(hit.contextId)) {
      throw new RangeError("identity source returned duplicate context");
    }
    seen.add(hit.contextId);
    return {
      contextId: hit.contextId,
      sourceRank: {
        rank: index + 1,
        originalRank: hit.rank,
        cosine: hit.cosine,
      },
      evidence: [],
    };
  });
}

function memberContexts(
  result: SourceResult<MemberHit>,
  contexts: ReadonlyMap<string, ContextSnapshot>,
  units: ReadonlyMap<string, ThoughtUnitRevision>,
  queryOrigin: string,
): {
  ranked: RankedContext[];
  duplicatesRemoved: number;
  quotaDropped: number;
} {
  if (result.status === "error") {
    return { ranked: [], duplicatesRemoved: 0, quotaDropped: 0 };
  }
  const byContext = new Map<string, Map<string, MemberHit>>();
  let duplicatesRemoved = 0;
  for (const hit of [...result.hits].sort(compareHits)) {
    validateHit(hit, contexts);
    validateMember(hit, contexts.get(hit.contextId)!, units, queryOrigin);
    const byOrigin =
      byContext.get(hit.contextId) ?? new Map<string, MemberHit>();
    const previous = byOrigin.get(hit.originKey);
    if (previous) duplicatesRemoved += 1;
    if (
      !previous ||
      hit.cosine > previous.cosine ||
      (hit.cosine === previous.cosine &&
        (hit.rank < previous.rank ||
          (hit.rank === previous.rank &&
            compare(hit.unitId, previous.unitId) < 0)))
    ) {
      byOrigin.set(hit.originKey, hit);
    }
    byContext.set(hit.contextId, byOrigin);
  }
  let quotaDropped = 0;
  const groups = [...byContext].map(([contextId, byOrigin]) => {
    const representatives = [...byOrigin.values()].sort(
      (a, b) =>
        b.cosine - a.cosine || a.rank - b.rank || compare(a.unitId, b.unitId),
    );
    quotaDropped += Math.max(
      0,
      representatives.length - RETRIEVAL_CONFIG.memberOriginQuota,
    );
    const kept = representatives.slice(0, RETRIEVAL_CONFIG.memberOriginQuota);
    return {
      contextId,
      best: kept[0]!,
      evidence: kept.map(
        ({ unitId, revision, originKey, rank, cosine }): MemberEvidence => ({
          unitId,
          revision,
          originKey,
          originalRank: rank,
          cosine,
        }),
      ),
    };
  });
  groups.sort(
    (a, b) =>
      b.best.cosine - a.best.cosine ||
      a.best.rank - b.best.rank ||
      compare(a.contextId, b.contextId),
  );
  const ranked = groups.map(({ contextId, best, evidence }, index) => ({
    contextId,
    sourceRank: {
      rank: index + 1,
      originalRank: best.rank,
      cosine: best.cosine,
    },
    evidence,
  }));
  return { ranked, duplicatesRemoved, quotaDropped };
}

/** Union already-scoped source hits; explicit user commands use a separate path. */
export function retrieveCandidates(
  snapshot: ValidatedSnapshot,
  sources: RetrievalSources,
  budget: RetrievalBudget = RETRIEVAL_CONFIG.defaultBudget,
): RetrievalResult {
  if (budget !== "all" && ![16, 32, 64].includes(budget)) {
    throw new RangeError("budget must be 16, 32, 64, or all");
  }
  const contexts = new Map(
    snapshot.contexts.map((context) => [context.contextId, context]),
  );
  const units = new Map(
    snapshot.units.map((unit) => [refKey(unit.unitId, unit.revision), unit]),
  );
  const identity = identityContexts(sources.identity, contexts);
  const member = memberContexts(
    sources.member,
    contexts,
    units,
    snapshot.query.originKey,
  );
  const union = new Map<
    string,
    { identity: RankedContext | null; member: RankedContext | null }
  >();
  for (const item of identity) {
    union.set(item.contextId, { identity: item, member: null });
  }
  for (const item of member.ranked) {
    const existing = union.get(item.contextId) ?? {
      identity: null,
      member: null,
    };
    union.set(item.contextId, { ...existing, member: item });
  }
  const matchedContextCount = union.size;
  if (budget === "all") {
    for (const context of snapshot.contexts) {
      if (!union.has(context.contextId)) {
        union.set(context.contextId, { identity: null, member: null });
      }
    }
  }
  const ordered = [...union].sort(([aId, a], [bId, b]) => {
    const aRank = Math.min(
      a.identity?.sourceRank.rank ?? Infinity,
      a.member?.sourceRank.rank ?? Infinity,
    );
    const bRank = Math.min(
      b.identity?.sourceRank.rank ?? Infinity,
      b.member?.sourceRank.rank ?? Infinity,
    );
    return (aRank === bRank ? 0 : aRank - bRank) || compare(aId, bId);
  });
  const retained = budget === "all" ? ordered : ordered.slice(0, budget);
  const candidates: RetrievedCandidate[] = retained.map(
    ([contextId, entry], index): RetrievedCandidate => {
      const context = contexts.get(contextId)!;
      return {
        contextId,
        identityRevision: context.identityRevision,
        membershipRevision: context.membershipRevision,
        rank: index + 1,
        matchStatus:
          entry.identity || entry.member ? "source_match" : "exhaustive_only",
        sourceRanks: {
          identity: entry.identity?.sourceRank ?? null,
          member: entry.member?.sourceRank ?? null,
        },
        memberEvidence: entry.member?.evidence ?? [],
      };
    },
  );
  const retainedIds = new Set(
    candidates.map((candidate) => candidate.contextId),
  );
  const sourceReport = (
    source: RetrievalSource,
    result: SourceResult<IdentityHit> | SourceResult<MemberHit>,
    ranked: readonly RankedContext[],
    duplicatesRemoved: number,
    quotaDropped: number,
  ): SourceReport => {
    const code = errorCode(result);
    const budgetDropped = ranked.filter(
      (item) => !retainedIds.has(item.contextId),
    ).length;
    return {
      source,
      status: result.status,
      errorCode: code,
      inputTruncated: result.status === "ok" && result.truncated,
      inputHitCount: result.status === "ok" ? result.hits.length : 0,
      distinctContextCount: ranked.length,
      duplicatesRemoved,
      quotaDropped,
      budgetDropped,
      truncated:
        (result.status === "ok" && result.truncated) ||
        quotaDropped > 0 ||
        budgetDropped > 0,
    };
  };
  const reports = [
    sourceReport("identity", sources.identity, identity, 0, 0),
    sourceReport(
      "member",
      sources.member,
      member.ranked,
      member.duplicatesRemoved,
      member.quotaDropped,
    ),
  ];
  return {
    config: RETRIEVAL_CONFIG,
    snapshotInputHash: snapshot.manifest.inputHash,
    budget,
    eligibleContextCount: contexts.size,
    matchedContextCount,
    returnedContextCount: candidates.length,
    status: candidates.length ? "found" : "no_candidates",
    truncated: reports.some((report) => report.truncated),
    sources: reports,
    candidates,
  };
}

/** Only validates an explicitly named context against the scoped snapshot. */
export function resolveExplicitContext(
  snapshot: ValidatedSnapshot,
  contextId: string,
):
  | Readonly<{ status: "eligible"; context: ContextSnapshot }>
  | Readonly<{ status: "ineligible" }> {
  const context = snapshot.contexts.find(
    (item) => item.contextId === contextId,
  );
  return context ? { status: "eligible", context } : { status: "ineligible" };
}
