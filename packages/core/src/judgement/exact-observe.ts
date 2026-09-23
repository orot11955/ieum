import {
  computeLexicalFeatures,
  scoreLexicalText,
  tokenizeLexicalText,
} from "../features/lexical/index.js";
import { retrieveCandidates } from "../retrieval/index.js";
import type {
  IdentityHit,
  MemberHit,
  RetrievalBudget,
  RetrievalResult,
  RetrievalSources,
} from "../retrieval/index.js";
import type {
  CandidateMeasurements,
  MemberMeasurement,
} from "../evaluation/index.js";
import type { ValidatedSnapshot } from "../snapshot/types.js";
import { runObserveJudgement } from "./index.js";
import type { ObserveJudgement } from "./index.js";

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function refKey(unitId: string, revision: number): string {
  return `${unitId}\u0000${revision}`;
}

/** Complete in-memory lexical sources; callers may choose a smaller retrieval budget. */
export function findExactLexicalSources(
  snapshot: ValidatedSnapshot,
): RetrievalSources {
  const features = computeLexicalFeatures(snapshot);
  const identity = snapshot.contexts
    .map((context) => ({
      contextId: context.contextId,
      cosine: scoreLexicalText(
        snapshot.query.content.text,
        context.name,
        features,
      ),
    }))
    .filter(
      (item): item is { contextId: string; cosine: number } =>
        item.cosine !== null && item.cosine > 0,
    )
    .sort((a, b) => b.cosine - a.cosine || compare(a.contextId, b.contextId))
    .map((item, index): IdentityHit => ({ ...item, rank: index + 1 }));

  const byUnit = new Map(
    features.candidates.map((candidate) => [
      refKey(candidate.unitId, candidate.revision),
      candidate,
    ]),
  );
  const memberUnranked: Omit<MemberHit, "rank">[] = [];
  for (const context of snapshot.contexts) {
    for (const ref of context.memberUnits) {
      const feature = byUnit.get(refKey(ref.unitId, ref.revision));
      if (!feature) {
        throw new RangeError(
          "context member is missing from validated snapshot units",
        );
      }
      if (feature.cosine !== null && feature.cosine > 0) {
        memberUnranked.push({
          contextId: context.contextId,
          unitId: feature.unitId,
          revision: feature.revision,
          originKey: feature.originKey,
          cosine: feature.cosine,
        });
      }
    }
  }
  const member = memberUnranked
    .sort(
      (a, b) =>
        b.cosine - a.cosine ||
        compare(a.contextId, b.contextId) ||
        compare(a.unitId, b.unitId) ||
        a.revision - b.revision,
    )
    .map((item, index): MemberHit => ({ ...item, rank: index + 1 }));

  return {
    identity: { status: "ok", hits: identity, truncated: false },
    member: { status: "ok", hits: member, truncated: false },
  };
}

export function retrieveExactLexicalCandidates(
  snapshot: ValidatedSnapshot,
  budget: RetrievalBudget = 32,
): RetrievalResult {
  return retrieveCandidates(
    snapshot,
    findExactLexicalSources(snapshot),
    budget,
  );
}

/** Keep measured zero distinct from missing input in the complete lexical scan. */
export function measureExactCandidates(
  snapshot: ValidatedSnapshot,
  retrieval: RetrievalResult,
): ReadonlyMap<string, CandidateMeasurements> {
  if (
    retrieval.snapshotInputHash !== snapshot.manifest.inputHash ||
    retrieval.sources.some(
      (source) => source.status !== "ok" || source.inputTruncated,
    )
  ) {
    throw new RangeError(
      "exact measurements require the same snapshot and complete sources",
    );
  }
  const features = computeLexicalFeatures(snapshot);
  const byUnit = new Map(
    features.candidates.map((item) => [
      refKey(item.unitId, item.revision),
      item,
    ]),
  );
  const byContext = new Map(
    snapshot.contexts.map((item) => [item.contextId, item]),
  );
  const queryEmpty =
    tokenizeLexicalText(snapshot.query.content.text).length === 0;
  const measurements = new Map<string, CandidateMeasurements>();
  for (const candidate of retrieval.candidates) {
    const context = byContext.get(candidate.contextId);
    if (!context)
      throw new RangeError("candidate context is outside exact snapshot");
    const identityValue = scoreLexicalText(
      snapshot.query.content.text,
      context.name,
      features,
    );
    const identity: CandidateMeasurements["identity"] =
      identityValue === null
        ? {
            availability: "missing",
            reason: queryEmpty ? "EMPTY_QUERY_VECTOR" : "EMPTY_IDENTITY_VECTOR",
          }
        : { availability: "available", value: identityValue };
    let member: CandidateMeasurements["member"];
    if (context.memberUnits.length === 0) {
      member = { availability: "not_applicable", reason: "NO_MEMBERS" };
    } else {
      const measured: MemberMeasurement[] = [];
      for (const ref of context.memberUnits) {
        const feature = byUnit.get(refKey(ref.unitId, ref.revision));
        if (!feature)
          throw new RangeError(
            "context member is outside exact snapshot units",
          );
        if (feature.cosine !== null) {
          measured.push({
            unitId: feature.unitId,
            revision: feature.revision,
            originKey: feature.originKey,
            cosine: feature.cosine,
          });
        }
      }
      member = measured.length
        ? { availability: "available", members: measured }
        : {
            availability: "missing",
            reason: queryEmpty ? "EMPTY_QUERY_VECTOR" : "EMPTY_MEMBER_VECTOR",
          };
    }
    measurements.set(candidate.contextId, {
      identity,
      member,
      semantic: { availability: "not_applicable", reason: "DISABLED" },
    });
  }
  return measurements;
}

export function runExactObserve(
  snapshot: ValidatedSnapshot,
  budget: RetrievalBudget = 32,
): ObserveJudgement {
  const retrieval = retrieveExactLexicalCandidates(snapshot, budget);
  return runObserveJudgement(
    snapshot,
    retrieval,
    measureExactCandidates(snapshot, retrieval),
  );
}
