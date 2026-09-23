import type { ValidatedSnapshot } from "../../snapshot/types.js";
import type { ThoughtUnitRevision } from "../../model/types.js";
import { LEXICAL_CONFIG } from "./config.js";
import { containsNegation, tokenizeLexicalText } from "./tokenizer.js";

export { LEXICAL_CONFIG } from "./config.js";
export type { LexicalConfig } from "./config.js";
export { normalizeLexicalText, tokenizeLexicalText } from "./tokenizer.js";

export type LexicalCandidateFeature = Readonly<{
  unitId: string;
  revision: number;
  originKey: string;
  /** Cosine similarity, not semantic agreement or a probability. */
  cosine: number | null;
  status: "available" | "empty_query" | "empty_candidate";
  slices: readonly ("no_shared_terms" | "negation_unmodeled")[];
}>;

export type LexicalFeatures = Readonly<{
  config: typeof LEXICAL_CONFIG;
  snapshotInputHash: string;
  corpusOriginCount: number;
  documentFrequency: readonly Readonly<{ token: string; origins: number }>[];
  candidates: readonly LexicalCandidateFeature[];
}>;

export type LexicalCorpus = Pick<
  LexicalFeatures,
  "corpusOriginCount" | "documentFrequency"
>;

function frequency(tokens: readonly string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const token of tokens) result.set(token, (result.get(token) ?? 0) + 1);
  return result;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function weightedVector(
  tokens: readonly string[],
  corpusSize: number,
  df: ReadonlyMap<string, number>,
): Map<string, number> {
  const vector = new Map<string, number>();
  for (const [token, count] of frequency(tokens)) {
    const idf =
      Math.log(
        (corpusSize + LEXICAL_CONFIG.idfSmoothing) /
          ((df.get(token) ?? 0) + LEXICAL_CONFIG.idfSmoothing),
      ) + 1;
    vector.set(token, count * idf);
  }
  return vector;
}

function cosine(
  query: ReadonlyMap<string, number>,
  candidate: ReadonlyMap<string, number>,
): number {
  let dot = 0;
  let querySquare = 0;
  let candidateSquare = 0;
  for (const token of [...query.keys()].sort(compare)) {
    const weight = query.get(token)!;
    querySquare += weight * weight;
    dot += weight * (candidate.get(token) ?? 0);
  }
  for (const token of [...candidate.keys()].sort(compare)) {
    const weight = candidate.get(token)!;
    candidateSquare += weight * weight;
  }
  return Math.min(
    1,
    Math.max(0, dot / Math.sqrt(querySquare * candidateSquare)),
  );
}

/** Score another search text with the same fixed snapshot IDF corpus. */
export function scoreLexicalText(
  queryText: string,
  candidateText: string,
  corpus: LexicalCorpus,
): number | null {
  const df = new Map(
    corpus.documentFrequency.map(({ token, origins }) => [token, origins]),
  );
  const query = weightedVector(
    tokenizeLexicalText(queryText),
    corpus.corpusOriginCount,
    df,
  );
  const candidate = weightedVector(
    tokenizeLexicalText(candidateText),
    corpus.corpusOriginCount,
    df,
  );
  return query.size && candidate.size ? cosine(query, candidate) : null;
}

/** Compute unit-level features over the already validated, fixed candidate set. */
export function computeLexicalFeatures(
  snapshot: ValidatedSnapshot,
): LexicalFeatures {
  const candidates = [...snapshot.units].sort(
    (a, b) => compare(a.unitId, b.unitId) || a.revision - b.revision,
  );
  const originTokens = new Map<string, Set<string>>();
  for (const unit of candidates) {
    if (unit.originKey === snapshot.query.originKey) {
      throw new RangeError("query origin cannot enter lexical corpus");
    }
    const terms = originTokens.get(unit.originKey) ?? new Set<string>();
    for (const token of tokenizeLexicalText(unit.content.text))
      terms.add(token);
    originTokens.set(unit.originKey, terms);
  }
  const df = new Map<string, number>();
  for (const origin of [...originTokens.keys()].sort(compare)) {
    for (const token of [...originTokens.get(origin)!].sort(compare)) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }
  const corpusSize = originTokens.size;
  const queryTokens = tokenizeLexicalText(snapshot.query.content.text);
  const queryVector = weightedVector(queryTokens, corpusSize, df);
  const queryHasNegation = containsNegation(snapshot.query.content.text);

  return {
    config: LEXICAL_CONFIG,
    snapshotInputHash: snapshot.manifest.inputHash,
    corpusOriginCount: corpusSize,
    documentFrequency: [...df]
      .sort(([a], [b]) => compare(a, b))
      .map(([token, origins]) => ({ token, origins })),
    candidates: candidates.map((unit: ThoughtUnitRevision) => {
      const candidateTokens = tokenizeLexicalText(unit.content.text);
      const candidateVector = weightedVector(candidateTokens, corpusSize, df);
      const status =
        queryVector.size === 0
          ? "empty_query"
          : candidateVector.size === 0
            ? "empty_candidate"
            : "available";
      const value =
        status === "available" ? cosine(queryVector, candidateVector) : null;
      const slices: LexicalCandidateFeature["slices"][number][] = [];
      if (value === 0) slices.push("no_shared_terms");
      if (queryHasNegation || containsNegation(unit.content.text)) {
        slices.push("negation_unmodeled");
      }
      return {
        unitId: unit.unitId,
        revision: unit.revision,
        originKey: unit.originKey,
        cosine: value,
        status,
        slices,
      };
    }),
  };
}
