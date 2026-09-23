import {
  computeLexicalFeatures,
  runObserveJudgement,
  scoreLexicalText,
  tokenizeLexicalText,
} from "@ieum/core";
import type {
  CandidateMeasurements,
  MemberMeasurement,
  ObserveJudgement,
  RetrievalBudget,
  RetrievalResult,
  ValidatedSnapshot,
} from "@ieum/core";
import { retrieveExactLexicalCandidates } from "./exact-finder.js";

function refKey(unitId: string, revision: number): string {
  return `${unitId}\u0000${revision}`;
}

/** Measure zero separately from missing for the Lab's exhaustive lexical scan. */
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
