import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { rankSemanticSnapshot } from "@ieum/core";
import type {
  SemanticSpace,
  SemanticVectors,
  ValidatedSnapshot,
} from "@ieum/core";
import { buildSnapshotFromFile } from "./snapshot.js";

type VectorEntry = Readonly<{
  kind: "query" | "identity" | "unit";
  id: string;
  revision: number | null;
  textHash: string;
  vector: readonly number[];
}>;
export type EmbeddingArtifact = Readonly<{
  schemaVersion: 1;
  space: SemanticSpace;
  vectors: readonly VectorEntry[];
  artifactHash: string;
}>;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new RangeError(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new RangeError(`${name} must be nonempty text`);
  return value;
}

export function semanticNamespace(
  fields: Omit<SemanticSpace, "namespace">,
): string {
  return sha256(JSON.stringify(fields));
}

export function readEmbeddingArtifact(file: string): EmbeddingArtifact {
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch {
    throw new RangeError("embedding artifact unavailable");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new RangeError("invalid embedding artifact JSON");
  }
  const root = record(parsed, "artifact");
  if (root.schemaVersion !== 1 || !Array.isArray(root.vectors))
    throw new RangeError("invalid embedding artifact header");
  if (
    Object.keys(root).some(
      (key) => !["schemaVersion", "space", "vectors"].includes(key),
    )
  )
    throw new RangeError("embedding artifact contains unsupported fields");
  const rawSpace = record(root.space, "embedding space");
  const allowedSpace = [
    "namespace",
    "modelId",
    "modelRevision",
    "dimensions",
    "tokenizer",
    "queryPrefix",
    "passagePrefix",
    "pooling",
    "precision",
  ];
  if (Object.keys(rawSpace).some((key) => !allowedSpace.includes(key)))
    throw new RangeError("embedding space contains unsupported fields");
  const fields = {
    modelId: string(rawSpace.modelId, "modelId"),
    modelRevision: string(rawSpace.modelRevision, "modelRevision"),
    dimensions: rawSpace.dimensions as number,
    tokenizer: string(rawSpace.tokenizer, "tokenizer"),
    queryPrefix: string(rawSpace.queryPrefix, "queryPrefix"),
    passagePrefix: string(rawSpace.passagePrefix, "passagePrefix"),
    pooling: string(rawSpace.pooling, "pooling"),
    precision: rawSpace.precision as SemanticSpace["precision"],
  };
  if (
    !Number.isSafeInteger(fields.dimensions) ||
    fields.dimensions < 1 ||
    !["float32", "float64"].includes(fields.precision) ||
    rawSpace.namespace !== semanticNamespace(fields)
  )
    throw new RangeError("embedding model space or namespace mismatch");
  const space: SemanticSpace = {
    namespace: rawSpace.namespace as string,
    ...fields,
  };
  const keys = new Set<string>();
  const vectors: VectorEntry[] = root.vectors.map((value: unknown) => {
    const row = record(value, "embedding vector");
    if (
      Object.keys(row).some(
        (key) =>
          !["kind", "id", "revision", "textHash", "vector"].includes(key),
      )
    )
      throw new RangeError("embedding vector contains unsupported fields");
    if (row.kind !== "query" && row.kind !== "identity" && row.kind !== "unit")
      throw new RangeError("invalid embedding vector kind");
    const id = string(row.id, "embedding id");
    const revision = row.revision;
    if (
      row.kind === "identity"
        ? revision !== null
        : !Number.isSafeInteger(revision) || (revision as number) < 1
    )
      throw new RangeError("invalid embedding source revision");
    if (
      typeof row.textHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(row.textHash)
    )
      throw new RangeError("invalid embedding text hash");
    if (!Array.isArray(row.vector) || row.vector.length !== fields.dimensions)
      throw new RangeError("embedding vector dimensions mismatch");
    if (
      row.vector.some(
        (part: unknown) => typeof part !== "number" || !Number.isFinite(part),
      )
    )
      throw new RangeError("embedding vector must contain finite numbers");
    if (row.vector.every((part: number) => part === 0))
      throw new RangeError("zero embedding vector");
    const key = `${row.kind}\u0000${id}\u0000${revision}`;
    if (keys.has(key)) throw new RangeError("duplicate embedding source");
    keys.add(key);
    return {
      kind: row.kind,
      id,
      revision: revision as number | null,
      textHash: row.textHash,
      vector: row.vector as number[],
    };
  });
  return { schemaVersion: 1, space, vectors, artifactHash: sha256(bytes) };
}

export function resolveSnapshotVectors(
  snapshot: ValidatedSnapshot,
  artifact: EmbeddingArtifact,
): SemanticVectors {
  const entries = new Map(
    artifact.vectors.map((item) => [
      `${item.kind}\u0000${item.id}\u0000${item.revision}`,
      item,
    ]),
  );
  function get(
    kind: VectorEntry["kind"],
    id: string,
    revision: number | null,
    text: string,
  ): readonly number[] {
    const item = entries.get(`${kind}\u0000${id}\u0000${revision}`);
    if (!item)
      throw new RangeError(`embedding artifact missing ${kind} source`);
    if (item.textHash !== sha256(text))
      throw new RangeError("embedding source text changed");
    return item.vector;
  }
  return {
    space: artifact.space,
    query: get(
      "query",
      snapshot.query.unitId,
      snapshot.query.revision,
      snapshot.query.content.text,
    ),
    identities: snapshot.contexts.map((context) => ({
      contextId: context.contextId,
      vector: get("identity", context.contextId, null, context.name),
    })),
    units: snapshot.units.map((unit) => ({
      unitId: unit.unitId,
      revision: unit.revision,
      vector: get("unit", unit.unitId, unit.revision, unit.content.text),
    })),
  };
}

export function rankSemanticFile(snapshotFile: string, artifactFile: string) {
  const snapshot = buildSnapshotFromFile(snapshotFile);
  const artifact = readEmbeddingArtifact(artifactFile);
  const hits = rankSemanticSnapshot(
    snapshot,
    resolveSnapshotVectors(snapshot, artifact),
  );
  return {
    snapshotInputHash: snapshot.manifest.inputHash,
    artifactHash: artifact.artifactHash,
    namespace: artifact.space.namespace,
    modelId: artifact.space.modelId,
    modelRevision: artifact.space.modelRevision,
    eligibleContextCount: snapshot.contexts.length,
    hits,
  };
}
