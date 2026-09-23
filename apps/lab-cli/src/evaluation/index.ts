import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { rankSemanticSnapshot, validateSnapshot } from "@ieum/core";
import type { ValidatedSnapshot } from "@ieum/core";
import { runExactObserve } from "../adapters/observe.js";
import {
  readEmbeddingArtifact,
  resolveSnapshotVectors,
} from "../adapters/embedding-artifact.js";
import type { EmbeddingArtifact } from "../adapters/embedding-artifact.js";

type Split = "development" | "validation" | "holdout";
type LabelKind = "match" | "no_match" | "ambiguous" | "insufficient";
type PairReview = "relevant" | "irrelevant" | "unreviewed";

type ContextRow = Readonly<{
  id: string;
  name: string;
  memberText: string;
  originFamily: string;
}>;
type Label = Readonly<{
  kind: LabelKind;
  relevantContextIds: readonly string[];
  reviews: readonly Readonly<{ contextId: string; status: PairReview }>[];
}>;
type CaseRow = Readonly<{
  id: string;
  text: string;
  originFamily: string;
  recordedAt: number;
  split: Split;
  slices: readonly string[];
  gold: Label;
}>;
export type EvaluationDataset = Readonly<{
  schemaVersion: 1;
  dataKind: "synthetic" | "authorized_private";
  contexts: readonly ContextRow[];
  cases: readonly CaseRow[];
}>;

type Ratio = Readonly<{
  numerator: number;
  denominator: number;
  value: number | null;
}>;
type MetricSet = Readonly<{
  evaluatedQueries: number;
  ambiguousQueries: number;
  insufficientQueries: number;
  recallAtK: Ratio;
  hitAtK: Ratio;
  reviewedPairPrecision: Ratio;
  queryCoverage: Ratio;
  noMatchFalseSuggestionRate: Ratio;
  unreviewedLabeledPairs: number;
  unreviewedSuggestedPairs: number;
  exhaustiveAtKQueries: number;
}>;

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function keys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  name: string,
): void {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected)
    throw new RangeError(`${name} has unsupported field: ${unexpected}`);
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(`${name} must be nonempty text`);
  return value;
}

function uniqueStrings(value: unknown, name: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  )
    throw new TypeError(`${name} must be an array of nonempty strings`);
  if (new Set(value).size !== value.length)
    throw new RangeError(`${name} contains duplicates`);
  return value as string[];
}

function parseDataset(input: unknown): EvaluationDataset {
  const root = object(input, "dataset");
  keys(root, ["schemaVersion", "dataKind", "contexts", "cases"], "dataset");
  if (
    root.schemaVersion !== 1 ||
    (root.dataKind !== "synthetic" && root.dataKind !== "authorized_private") ||
    !Array.isArray(root.contexts) ||
    !Array.isArray(root.cases)
  )
    throw new RangeError("invalid dataset header");
  const contexts: ContextRow[] = root.contexts.map((value: unknown) => {
    const row = object(value, "context");
    keys(row, ["id", "name", "memberText", "originFamily"], "context");
    return {
      id: string(row.id, "context.id"),
      name: string(row.name, "context.name"),
      memberText: string(row.memberText, "context.memberText"),
      originFamily: string(row.originFamily, "context.originFamily"),
    };
  });
  if (new Set(contexts.map((item) => item.id)).size !== contexts.length)
    throw new RangeError("duplicate context ID");
  const contextIds = new Set(contexts.map((item) => item.id));
  const cases: CaseRow[] = root.cases.map((value: unknown) => {
    const row = object(value, "case");
    keys(
      row,
      ["id", "text", "originFamily", "recordedAt", "split", "slices", "gold"],
      "case",
    );
    if (!Number.isSafeInteger(row.recordedAt) || (row.recordedAt as number) < 1)
      throw new RangeError("case.recordedAt must be a positive safe integer");
    if (
      row.split !== "development" &&
      row.split !== "validation" &&
      row.split !== "holdout"
    )
      throw new RangeError("invalid split");
    const gold = object(row.gold, "gold");
    keys(gold, ["kind", "relevantContextIds", "reviews"], "gold");
    if (
      gold.kind !== "match" &&
      gold.kind !== "no_match" &&
      gold.kind !== "ambiguous" &&
      gold.kind !== "insufficient"
    )
      throw new RangeError("invalid label kind");
    const relevantContextIds = uniqueStrings(
      gold.relevantContextIds,
      "relevantContextIds",
    );
    if (relevantContextIds.some((id) => !contextIds.has(id)))
      throw new RangeError("label references unknown context");
    if (gold.kind === "match" && relevantContextIds.length === 0)
      throw new RangeError("match requires relevant contexts");
    if (gold.kind !== "match" && relevantContextIds.length !== 0)
      throw new RangeError("only match may have fixed relevant contexts");
    if (!Array.isArray(gold.reviews))
      throw new TypeError("gold.reviews must be an array");
    const reviews = gold.reviews.map((review: unknown) => {
      const pair = object(review, "review");
      keys(pair, ["contextId", "status"], "review");
      const contextId = string(pair.contextId, "review.contextId");
      if (
        !contextIds.has(contextId) ||
        (pair.status !== "relevant" &&
          pair.status !== "irrelevant" &&
          pair.status !== "unreviewed")
      )
        throw new RangeError("invalid reviewed pair");
      return { contextId, status: pair.status as PairReview };
    });
    if (new Set(reviews.map((item) => item.contextId)).size !== reviews.length)
      throw new RangeError("duplicate pair review");
    if (
      gold.kind === "no_match" &&
      reviews.some((item) => item.status === "relevant")
    )
      throw new RangeError("no_match cannot contain a relevant pair review");
    for (const id of relevantContextIds) {
      if (reviews.find((item) => item.contextId === id)?.status !== "relevant")
        throw new RangeError("fixed relevant context needs a relevant review");
    }
    return {
      id: string(row.id, "case.id"),
      text: string(row.text, "case.text"),
      originFamily: string(row.originFamily, "case.originFamily"),
      recordedAt: row.recordedAt as number,
      split: row.split,
      slices: uniqueStrings(row.slices, "case.slices"),
      gold: { kind: gold.kind, relevantContextIds, reviews },
    };
  });
  if (
    !contexts.length ||
    !cases.length ||
    new Set(cases.map((item) => item.id)).size !== cases.length
  )
    throw new RangeError("dataset needs contexts and unique cases");
  const familySplits = new Map<string, Split>();
  for (const item of cases) {
    const prior = familySplits.get(item.originFamily);
    if (prior && prior !== item.split)
      throw new RangeError("origin family crosses dataset splits");
    familySplits.set(item.originFamily, item.split);
  }
  const ranges = (["development", "validation", "holdout"] as const).map(
    (split) => {
      const times = cases
        .filter((item) => item.split === split)
        .map((item) => item.recordedAt);
      return {
        split,
        min: Math.min(...times),
        max: Math.max(...times),
        count: times.length,
      };
    },
  );
  const populatedRanges = ranges.filter((range) => range.count > 0);
  for (let index = 1; index < populatedRanges.length; index++) {
    if (populatedRanges[index - 1]!.max >= populatedRanges[index]!.min)
      throw new RangeError("dataset split time windows overlap");
  }
  return { schemaVersion: 1, dataKind: root.dataKind, contexts, cases };
}

export function loadDataset(file: string): EvaluationDataset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new RangeError("invalid evaluation dataset JSON");
  }
  return parseDataset(parsed);
}

/** Accept only the feature schema. Gold and feedback are never sent to Core. */
export function validateFeatureInput(
  input: unknown,
  inputHash: string,
): ValidatedSnapshot {
  function rejectLabels(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) rejectLabels(item);
    } else if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (
          key === "gold" ||
          key === "feedback" ||
          key === "label" ||
          key === "reviews"
        )
          throw new RangeError("evaluation labels cannot enter feature input");
        rejectLabels(child);
      }
    }
  }
  rejectLabels(input);
  const raw = object(input, "feature input");
  keys(
    raw,
    [
      "workspaceId",
      "asOfRecordedAt",
      "query",
      "captures",
      "units",
      "contexts",
      "relations",
      "visibility",
      "profileWatermarks",
    ],
    "feature input",
  );
  for (const collection of [
    "captures",
    "units",
    "contexts",
    "relations",
    "visibility",
    "profileWatermarks",
  ]) {
    if (!Array.isArray(raw[collection]))
      throw new TypeError(`feature input ${collection} must be an array`);
  }
  return validateSnapshot(raw, inputHash);
}

export function snapshotFor(
  contexts: readonly ContextRow[],
  item: CaseRow,
): ValidatedSnapshot {
  const workspaceId = "sample-lab";
  const captures = contexts.map((context) => ({
    workspaceId,
    captureId: `capture:${context.id}`,
    revision: 1,
    rawBody: context.memberText,
    originKey: context.originFamily,
    recordedAt: 0,
    occurredAt: null,
  }));
  const queryCapture = {
    workspaceId,
    captureId: `query:${item.id}`,
    revision: 1,
    rawBody: item.text,
    originKey: item.originFamily,
    recordedAt: item.recordedAt,
    occurredAt: null,
  };
  const units = [...captures, queryCapture].map((capture) => ({
    workspaceId,
    unitId: `unit:${capture.captureId}`,
    revision: 1,
    captureId: capture.captureId,
    captureRevision: 1,
    originKey: capture.originKey,
    sourceSpan: {
      start: 0,
      end: capture.rawBody.length,
      encoding: "utf16" as const,
    },
    content: { kind: "quote" as const, text: capture.rawBody },
    recordedAt: capture.recordedAt,
  }));
  const featureInput = {
    workspaceId,
    asOfRecordedAt: item.recordedAt,
    query: { unitId: `unit:query:${item.id}`, revision: 1 },
    captures: [...captures, queryCapture],
    units,
    contexts: contexts.map((context) => ({
      workspaceId,
      contextId: context.id,
      identityRevision: 1,
      membershipRevision: 1,
      name: context.name,
      recordedAt: 0,
      memberUnits: [{ unitId: `unit:capture:${context.id}`, revision: 1 }],
    })),
    relations: [],
    visibility: [],
    profileWatermarks: [],
  };
  return validateFeatureInput(
    featureInput,
    digest(JSON.stringify(featureInput)),
  );
}

function ratio(numerator: number, denominator: number): Ratio {
  return {
    numerator,
    denominator,
    value: denominator === 0 ? null : numerator / denominator,
  };
}

type CaseResult = Readonly<{
  id: string;
  split: Split;
  slices: readonly string[];
  label: Label;
  eligibleContextCount: number;
  topContextIds: readonly string[];
  suggestedContextIds: readonly string[];
}>;

function summarize(rows: readonly CaseResult[], k: number): MetricSet {
  const evaluated = rows.filter(
    (item) => item.label.kind === "match" || item.label.kind === "no_match",
  );
  const matches = rows.filter((item) => item.label.kind === "match");
  const noMatches = rows.filter((item) => item.label.kind === "no_match");
  let recallSum = 0;
  let hit = 0;
  for (const item of matches) {
    const found = item.label.relevantContextIds.filter((id) =>
      item.topContextIds.includes(id),
    ).length;
    recallSum += found / item.label.relevantContextIds.length;
    if (found > 0) hit += 1;
  }
  const suggestions = evaluated.flatMap((item) =>
    item.suggestedContextIds.map((id) => ({ item, id })),
  );
  const reviewed = suggestions.filter(
    ({ item, id }) =>
      item.label.reviews.find((pair) => pair.contextId === id)?.status !==
        "unreviewed" &&
      item.label.reviews.some((pair) => pair.contextId === id),
  );
  const relevant = reviewed.filter(
    ({ item, id }) =>
      item.label.reviews.find((pair) => pair.contextId === id)?.status ===
      "relevant",
  ).length;
  return {
    evaluatedQueries: evaluated.length,
    ambiguousQueries: rows.filter((item) => item.label.kind === "ambiguous")
      .length,
    insufficientQueries: rows.filter(
      (item) => item.label.kind === "insufficient",
    ).length,
    recallAtK: {
      numerator: recallSum,
      denominator: matches.length,
      value: matches.length ? recallSum / matches.length : null,
    },
    hitAtK: ratio(hit, matches.length),
    reviewedPairPrecision: ratio(relevant, reviewed.length),
    queryCoverage: ratio(
      evaluated.filter((item) => item.suggestedContextIds.length > 0).length,
      evaluated.length,
    ),
    noMatchFalseSuggestionRate: ratio(
      noMatches.filter((item) => item.suggestedContextIds.length > 0).length,
      noMatches.length,
    ),
    unreviewedLabeledPairs: rows.reduce(
      (sum, item) =>
        sum +
        item.label.reviews.filter((pair) => pair.status === "unreviewed")
          .length,
      0,
    ),
    unreviewedSuggestedPairs: suggestions.length - reviewed.length,
    exhaustiveAtKQueries: rows.filter((item) => item.eligibleContextCount <= k)
      .length,
  };
}

function reportRows(
  rows: readonly CaseResult[],
  k: number,
  baseline: string,
  dataKind: EvaluationDataset["dataKind"],
  contextCount: number,
) {
  const splits = Object.fromEntries(
    (["development", "validation", "holdout"] as const).map((split) => [
      split,
      summarize(
        rows.filter((row) => row.split === split),
        k,
      ),
    ]),
  );
  const sliceNames = [...new Set(rows.flatMap((row) => row.slices))].sort();
  const slices = Object.fromEntries(
    sliceNames.map((slice) => [
      slice,
      summarize(
        rows.filter((row) => row.slices.includes(slice)),
        k,
      ),
    ]),
  );
  const failures = rows
    .filter(
      (row) =>
        row.label.kind === "match" &&
        row.label.relevantContextIds.some(
          (id) => !row.topContextIds.includes(id),
        ),
    )
    .map((row) => ({
      queryId: row.id,
      split: row.split,
      slices: row.slices,
      missedContextIds: row.label.relevantContextIds.filter(
        (id) => !row.topContextIds.includes(id),
      ),
    }));
  return {
    baseline,
    dataKind,
    k,
    contextCount,
    queryCount: rows.length,
    overall: summarize(rows, k),
    splits,
    slices,
    failures,
    qualityGate: "not_evaluated" as const,
  };
}

export function evaluateB0(dataset: EvaluationDataset, k = 10) {
  if (!Number.isSafeInteger(k) || k < 1 || k > 32)
    throw new RangeError("K must be an integer in [1,32]");
  const rows: CaseResult[] = dataset.cases.map((item) => {
    const judgement = runExactObserve(snapshotFor(dataset.contexts, item), 32);
    return {
      id: item.id,
      split: item.split,
      slices: item.slices,
      label: item.gold,
      eligibleContextCount: judgement.retrieval.eligibleContextCount,
      topContextIds: judgement.retrieval.candidates
        .slice(0, k)
        .map((candidate) => candidate.contextId),
      suggestedContextIds: [], // B0 is observe-only; no candidate is a suggestion.
    };
  });
  return reportRows(
    rows,
    k,
    "B0-lexical-v0",
    dataset.dataKind,
    dataset.contexts.length,
  );
}

export function evaluateB1(
  dataset: EvaluationDataset,
  artifact: EmbeddingArtifact,
  k = 10,
) {
  if (!Number.isSafeInteger(k) || k < 1 || k > 32)
    throw new RangeError("K must be an integer in [1,32]");
  const rows: CaseResult[] = dataset.cases.map((item) => {
    const snapshot = snapshotFor(dataset.contexts, item);
    const hits = rankSemanticSnapshot(
      snapshot,
      resolveSnapshotVectors(snapshot, artifact),
    );
    return {
      id: item.id,
      split: item.split,
      slices: item.slices,
      label: item.gold,
      eligibleContextCount: snapshot.contexts.length,
      topContextIds: hits.slice(0, k).map((hit) => hit.contextId),
      suggestedContextIds: [], // B1 is also observe-only; ranks are not suggestions.
    };
  });
  return reportRows(
    rows,
    k,
    "B1-fixed-exact-v0",
    dataset.dataKind,
    dataset.contexts.length,
  );
}

export function compareSemanticFile(
  datasetFile: string,
  artifactFile: string,
  output?: string,
) {
  const datasetBytes = readFileSync(datasetFile);
  const dataset = loadDataset(datasetFile);
  if (!readFileSync(datasetFile).equals(datasetBytes))
    throw new RangeError("evaluation dataset changed during run");
  const beforeB0 = process.memoryUsage().heapUsed;
  const b0Start = performance.now();
  const b0 = evaluateB0(dataset);
  const b0DurationMs = performance.now() - b0Start;
  const afterB0 = process.memoryUsage().heapUsed;
  const b1Start = performance.now();
  const artifact = readEmbeddingArtifact(artifactFile);
  const b1 = evaluateB1(dataset, artifact);
  const b1DurationMs = performance.now() - b1Start;
  const afterB1 = process.memoryUsage().heapUsed;
  const id = randomUUID();
  const target = path.resolve(
    output ??
      path.join(os.homedir(), ".local", "share", "ieum-lab", "comparisons", id),
  );
  if (existsSync(target))
    throw new RangeError("comparison directory already exists");
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temp = mkdtempSync(`${target}.tmp-`);
  try {
    const comparison = {
      dataKind: dataset.dataKind,
      datasetHash: digest(datasetBytes),
      artifactHash: artifact.artifactHash,
      namespace: artifact.space.namespace,
      modelId: artifact.space.modelId,
      modelRevision: artifact.space.modelRevision,
      b0,
      b1,
      processMeasurements: {
        b0DurationMs,
        b1DurationMs,
        b0HeapDeltaBytes: afterB0 - beforeB0,
        b1HeapDeltaBytes: afterB1 - afterB0,
        note: "Single sequential process samples, including snapshot construction and B1 artifact loading; heap deltas are not peak memory or steady-state benchmarks.",
      },
      qualityGate: "not_evaluated",
    };
    const files = {
      "comparison.json": `${JSON.stringify(comparison, null, 2)}\n`,
      "report.md": `# B0/B1 fixed-artifact comparison\n\n- data kind: ${dataset.dataKind}\n- contexts: ${dataset.contexts.length}\n- queries: ${dataset.cases.length}\n- K: 10\n- B0 Recall@10: ${b0.overall.recallAtK.numerator}/${b0.overall.recallAtK.denominator}\n- B1 Recall@10: ${b1.overall.recallAtK.numerator}/${b1.overall.recallAtK.denominator}\n- quality gate: not evaluated\n\nBoth modes are observe-only. Synthetic vectors do not validate a real semantic model. Duration and heap deltas are single-process samples, not latency or peak-memory guarantees.\n`,
    };
    for (const [name, content] of Object.entries(files))
      writeFileSync(path.join(temp, name), content, {
        flag: "wx",
        mode: 0o600,
      });
    writeFileSync(
      path.join(temp, "manifest.json"),
      `${JSON.stringify({ schemaVersion: 1, comparisonId: id, datasetHash: digest(datasetBytes), artifactHash: artifact.artifactHash, files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, digest(content)])) }, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    if (existsSync(target))
      throw new RangeError("comparison directory already exists");
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    throw error;
  }
  return {
    comparisonId: id,
    directory: target,
    dataKind: dataset.dataKind,
    contextCount: dataset.contexts.length,
    queryCount: dataset.cases.length,
    artifactHash: artifact.artifactHash,
  };
}

export function evaluateFile(file: string, output?: string) {
  const input = readFileSync(file);
  const dataset = loadDataset(file);
  if (!readFileSync(file).equals(input))
    throw new RangeError("evaluation dataset changed during run");
  const result = evaluateB0(dataset);
  const id = randomUUID();
  const target = path.resolve(
    output ??
      path.join(os.homedir(), ".local", "share", "ieum-lab", "evaluations", id),
  );
  if (existsSync(target))
    throw new RangeError("evaluation directory already exists");
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temp = mkdtempSync(`${target}.tmp-`);
  try {
    const files = {
      "dataset.json": input,
      "metrics.json": `${JSON.stringify({ ...result, failures: undefined }, null, 2)}\n`,
      "failures.jsonl": result.failures
        .map((item) => `${JSON.stringify(item)}\n`)
        .join(""),
      "report.md": `# B0 synthetic/authorized dataset evaluation\n\n- data kind: ${dataset.dataKind}\n- contexts: ${result.contextCount}\n- queries: ${result.queryCount}\n- K: ${result.k}\n- failures: ${result.failures.length}\n- quality gate: not evaluated\n\nRatios and denominators are in metrics.json. Observe mode produces no suggestions; suggestion precision is N/A.\n`,
    };
    for (const [name, content] of Object.entries(files))
      writeFileSync(path.join(temp, name), content, {
        flag: "wx",
        mode: 0o600,
      });
    writeFileSync(
      path.join(temp, "manifest.json"),
      `${JSON.stringify({ schemaVersion: 1, evaluationId: id, dataKind: dataset.dataKind, datasetHash: digest(input), files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, digest(content)])) }, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    if (existsSync(target))
      throw new RangeError("evaluation directory already exists");
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    throw error;
  }
  return {
    evaluationId: id,
    directory: target,
    dataKind: dataset.dataKind,
    contextCount: result.contextCount,
    queryCount: result.queryCount,
    failureCount: result.failures.length,
  };
}
