import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { EvaluationDataset } from "../evaluation/index.js";

export type AuxiliarySignalRow = Readonly<{
  queryId: string;
  contextId: string;
  graph: number | null;
  session: number | null;
  recordedAt: number;
  evidenceId: string;
}>;
export type AuxiliaryArtifact = Readonly<{
  artifactHash: string;
  datasetHash: string;
  dataKind: EvaluationDataset["dataKind"];
  signals: ReadonlyMap<string, AuxiliarySignalRow>;
}>;

const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

export function auxiliaryDatasetHash(dataset: EvaluationDataset): string {
  return hash(JSON.stringify(dataset));
}

export function readAuxiliaryArtifact(
  file: string,
  dataset: EvaluationDataset,
): AuxiliaryArtifact {
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch {
    throw new RangeError("auxiliary artifact unavailable");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new RangeError("invalid auxiliary artifact JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new RangeError("auxiliary artifact must be an object");
  const root = parsed as Record<string, unknown>;
  if (
    Object.keys(root).some(
      (key) =>
        !["schemaVersion", "datasetHash", "dataKind", "signals"].includes(key),
    ) ||
    root.schemaVersion !== 1 ||
    root.datasetHash !== auxiliaryDatasetHash(dataset) ||
    root.dataKind !== dataset.dataKind ||
    !Array.isArray(root.signals)
  )
    throw new RangeError("auxiliary artifact header or dataset hash mismatch");
  const cases = new Map(dataset.cases.map((item) => [item.id, item]));
  const contexts = new Map(dataset.contexts.map((item) => [item.id, item]));
  const signals = new Map<string, AuxiliarySignalRow>();
  const evidenceIds = new Set<string>();
  for (const value of root.signals) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new RangeError("invalid auxiliary signal");
    const row = value as Record<string, unknown>;
    if (
      Object.keys(row).some(
        (key) =>
          ![
            "queryId",
            "contextId",
            "graph",
            "session",
            "recordedAt",
            "evidenceId",
          ].includes(key),
      ) ||
      typeof row.queryId !== "string" ||
      typeof row.contextId !== "string" ||
      typeof row.evidenceId !== "string" ||
      !row.evidenceId.trim()
    )
      throw new RangeError("invalid auxiliary signal fields");
    const item = cases.get(row.queryId);
    const context = contexts.get(row.contextId);
    if (
      !item ||
      !context ||
      context.originFamily === item.originFamily ||
      !Number.isSafeInteger(row.recordedAt) ||
      (row.recordedAt as number) >= item.recordedAt
    )
      throw new RangeError(
        "auxiliary signal is outside eligible time or source scope",
      );
    for (const number of [row.graph, row.session])
      if (
        number !== null &&
        (typeof number !== "number" ||
          !Number.isFinite(number) ||
          number < 0 ||
          number > 1)
      )
        throw new RangeError("invalid auxiliary signal value");
    if (row.graph === null && row.session === null)
      throw new RangeError("empty auxiliary signal");
    const key = `${row.queryId}\u0000${row.contextId}`;
    if (signals.has(key) || evidenceIds.has(row.evidenceId))
      throw new RangeError("duplicate auxiliary signal or evidence ID");
    signals.set(key, {
      queryId: row.queryId,
      contextId: row.contextId,
      graph: row.graph as number | null,
      session: row.session as number | null,
      recordedAt: row.recordedAt as number,
      evidenceId: row.evidenceId,
    });
    evidenceIds.add(row.evidenceId);
  }
  return {
    artifactHash: hash(bytes),
    datasetHash: root.datasetHash as string,
    dataKind: dataset.dataKind,
    signals,
  };
}
