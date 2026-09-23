import type { ValidatedSnapshot } from "../../snapshot/types.js";

export type SemanticSpace = Readonly<{
  namespace: string;
  modelId: string;
  modelRevision: string;
  dimensions: number;
  tokenizer: string;
  queryPrefix: string;
  passagePrefix: string;
  pooling: string;
  precision: "float32" | "float64";
}>;

export type SemanticVectors = Readonly<{
  space: SemanticSpace;
  query: readonly number[];
  identities: readonly Readonly<{
    contextId: string;
    vector: readonly number[];
  }>[];
  units: readonly Readonly<{
    unitId: string;
    revision: number;
    vector: readonly number[];
  }>[];
}>;

export type SemanticHit = Readonly<{
  contextId: string;
  rank: number;
  cosine: number;
  identityCosine: number;
  bestMember: Readonly<{
    unitId: string;
    revision: number;
    cosine: number;
  }> | null;
}>;

function vector(
  value: readonly number[],
  dimensions: number,
  name: string,
): void {
  if (
    !Array.isArray(value) ||
    value.length !== dimensions ||
    value.some((part) => typeof part !== "number" || !Number.isFinite(part))
  )
    throw new RangeError(`${name} has invalid vector dimensions or values`);
  if (value.every((part) => part === 0))
    throw new RangeError(`${name} is a zero vector`);
}

export function cosineSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  if (a.length !== b.length || a.length === 0)
    throw new RangeError(
      "cosine vectors must have the same nonzero dimensions",
    );
  vector(a, a.length, "query");
  vector(b, a.length, "candidate");
  let aMax = 0;
  let bMax = 0;
  for (let index = 0; index < a.length; index++) {
    aMax = Math.max(aMax, Math.abs(a[index]!));
    bMax = Math.max(bMax, Math.abs(b[index]!));
  }
  let dot = 0;
  let aSquare = 0;
  let bSquare = 0;
  for (let index = 0; index < a.length; index++) {
    const left = a[index]! / aMax;
    const right = b[index]! / bMax;
    dot += left * right;
    aSquare += left * left;
    bSquare += right * right;
  }
  return Math.max(-1, Math.min(1, dot / Math.sqrt(aSquare * bSquare)));
}

/** Exact rank over one already scoped snapshot; cosine is not a probability. */
export function rankSemanticSnapshot(
  snapshot: ValidatedSnapshot,
  input: SemanticVectors,
): readonly SemanticHit[] {
  const dimensions = input.space.dimensions;
  if (!Number.isSafeInteger(dimensions) || dimensions < 1)
    throw new RangeError("semantic dimensions must be positive");
  vector(input.query, dimensions, "query");
  const identities = new Map<string, readonly number[]>();
  for (const item of input.identities) {
    vector(item.vector, dimensions, "identity");
    if (identities.has(item.contextId))
      throw new RangeError("duplicate semantic identity");
    identities.set(item.contextId, item.vector);
  }
  const units = new Map<string, readonly number[]>();
  for (const item of input.units) {
    vector(item.vector, dimensions, "unit");
    const key = `${item.unitId}\u0000${item.revision}`;
    if (units.has(key)) throw new RangeError("duplicate semantic unit");
    units.set(key, item.vector);
  }
  if (
    identities.size !== snapshot.contexts.length ||
    units.size !== snapshot.units.length
  )
    throw new RangeError("semantic artifact is incomplete for snapshot");
  for (const contextId of identities.keys())
    if (!snapshot.contexts.some((item) => item.contextId === contextId))
      throw new RangeError("semantic identity is outside snapshot");
  for (const key of units.keys())
    if (
      !snapshot.units.some(
        (item) => key === `${item.unitId}\u0000${item.revision}`,
      )
    )
      throw new RangeError("semantic unit is outside snapshot");
  const hits = snapshot.contexts.map((context) => {
    const identityVector = identities.get(context.contextId);
    if (!identityVector) throw new RangeError("semantic identity is missing");
    const identityCosine = cosineSimilarity(input.query, identityVector);
    const members = context.memberUnits.map((ref) => {
      const memberVector = units.get(`${ref.unitId}\u0000${ref.revision}`);
      if (!memberVector) throw new RangeError("semantic member is missing");
      return {
        unitId: ref.unitId,
        revision: ref.revision,
        cosine: cosineSimilarity(input.query, memberVector),
      };
    });
    members.sort(
      (a, b) =>
        b.cosine - a.cosine ||
        (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0) ||
        a.revision - b.revision,
    );
    const bestMember = members[0] ?? null;
    return {
      contextId: context.contextId,
      identityCosine,
      bestMember,
      cosine: Math.max(identityCosine, bestMember?.cosine ?? -1),
    };
  });
  hits.sort(
    (a, b) =>
      b.cosine - a.cosine ||
      (a.contextId < b.contextId ? -1 : a.contextId > b.contextId ? 1 : 0),
  );
  return hits.map((hit, index) => ({ ...hit, rank: index + 1 }));
}
