import {
  computeLexicalFeatures,
  retrieveCandidates,
  scoreLexicalText,
} from "@ieum/core";
import type {
  IdentityHit,
  MemberHit,
  RetrievalBudget,
  RetrievalResult,
  RetrievalSources,
  ValidatedSnapshot,
} from "@ieum/core";

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function refKey(unitId: string, revision: number): string {
  return `${unitId}\u0000${revision}`;
}

/** Exhaustive, in-memory lexical scan of the snapshot's eligible contexts. */
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
