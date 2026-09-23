import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEXICAL_SCORE_CONFIG,
  LEXICAL_CONFIG,
  OBSERVE_POLICY_CONFIG,
  RETRIEVAL_CONFIG,
  runObserveJudgement,
} from "@ieum/core";
import type {
  CandidateMeasurements,
  ObserveJudgement,
  RetrievalBudget,
  RetrievalResult,
  SnapshotManifest,
} from "@ieum/core";
import { retrieveExactLexicalCandidates } from "./exact-finder.js";
import { measureExactCandidates } from "./observe.js";
import { buildSnapshotFromFile } from "./snapshot.js";

const artifactFiles = [
  "input.json",
  "features.json",
  "judgements.jsonl",
  "failures.jsonl",
  "feedback.jsonl",
  "metrics.json",
  "report.md",
] as const;
type ArtifactFile = (typeof artifactFiles)[number];

type FeedbackEvent = Readonly<{
  commandId: string;
  kind:
    "exposure" | "direct_selection" | "relevance_rejection" | "primary_change";
  contextId: string | null;
  exposureId?: string;
}>;

type StoredFeatures = Readonly<{
  retrieval: RetrievalResult;
  measurements: readonly (readonly [string, CandidateMeasurements])[];
}>;

type RunManifest = Readonly<{
  schemaVersion: 1;
  runId: string;
  execution: "fresh_exact_observe";
  modelExecution: "none";
  engineHash: string;
  configHash: string;
  inputHash: string;
  snapshotInputHash: string;
  snapshotManifest: SnapshotManifest;
  featureHash: string;
  decisionHash: string;
  profileId: string;
  policyVersion: string;
  budget: RetrievalBudget;
  stageDurationsMs: Readonly<{
    snapshot: number;
    retrieval: number;
    measurement: number;
    decision: number;
  }>;
  fallbacks: readonly [];
  files: Readonly<Record<ArtifactFile, string>>;
}>;

function hash(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function lines(values: readonly unknown[]): string {
  return values.map((value) => `${JSON.stringify(value)}\n`).join("");
}

function parseObject(data: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    throw new RangeError(`invalid ${label} JSON`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RangeError(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function parseLines(data: string): unknown[] {
  try {
    return data
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown);
  } catch {
    throw new RangeError("invalid run JSONL artifact");
  }
}

function engineHash(): string {
  const coreRoot = path.dirname(
    fileURLToPath(import.meta.resolve("@ieum/core")),
  );
  const labRoot = fileURLToPath(new URL("../", import.meta.url));
  const parts: string[] = [];
  for (const [name, root] of [
    ["core", coreRoot],
    ["lab", labRoot],
  ] as const) {
    function visit(directory: string): void {
      for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
        (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
      )) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(absolute);
        else if (
          entry.isFile() &&
          entry.name.endsWith(".js") &&
          !entry.name.endsWith(".test.js")
        ) {
          parts.push(
            `${name}/${path.relative(root, absolute)}:${hash(readFileSync(absolute))}`,
          );
        }
      }
    }
    visit(root);
  }
  return hash(parts.join("\n"));
}

function configHash(budget: RetrievalBudget): string {
  return hash(
    JSON.stringify({
      score: LEXICAL_SCORE_CONFIG,
      lexical: LEXICAL_CONFIG,
      policy: OBSERVE_POLICY_CONFIG,
      retrieval: RETRIEVAL_CONFIG,
      budget,
    }),
  );
}

function validateBudget(budget: RetrievalBudget): void {
  if (budget !== "all" && budget !== 16 && budget !== 32 && budget !== 64) {
    throw new RangeError("budget must be 16, 32, 64, or all");
  }
}

function readFeedback(
  file: string | undefined,
  contextIds: ReadonlySet<string>,
  candidateIds: ReadonlySet<string>,
): FeedbackEvent[] {
  if (!file) return [];
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new RangeError("invalid feedback JSON");
  }
  if (!Array.isArray(value)) throw new RangeError("feedback must be an array");
  const events: FeedbackEvent[] = [];
  const commands = new Set<string>();
  const exposures = new Map<string, string>();
  const respondedExposures = new Set<string>();
  for (const item of value as unknown[]) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new RangeError("feedback event must be an object");
    }
    const event = item as Record<string, unknown>;
    if (
      typeof event.commandId !== "string" ||
      event.commandId.length === 0 ||
      commands.has(event.commandId)
    ) {
      throw new RangeError("feedback command IDs must be nonempty and unique");
    }
    if (
      ![
        "exposure",
        "direct_selection",
        "relevance_rejection",
        "primary_change",
      ].includes(String(event.kind))
    ) {
      throw new RangeError("unknown feedback event kind");
    }
    if (
      event.contextId !== null &&
      (typeof event.contextId !== "string" || !contextIds.has(event.contextId))
    ) {
      throw new RangeError("feedback context is outside snapshot");
    }
    if (
      event.kind !== "primary_change" &&
      typeof event.contextId !== "string"
    ) {
      throw new RangeError("feedback event requires a context");
    }
    if (
      event.kind === "exposure" &&
      !candidateIds.has(event.contextId as string)
    ) {
      throw new RangeError("exposure must reference a returned candidate");
    }
    if (event.kind === "exposure" && event.exposureId !== undefined) {
      throw new RangeError("exposure cannot reference another exposure");
    }
    if (
      event.kind === "relevance_rejection" &&
      typeof event.exposureId !== "string"
    ) {
      throw new RangeError("relevance rejection requires an exposure ID");
    }
    if (event.exposureId !== undefined) {
      if (
        typeof event.exposureId !== "string" ||
        exposures.get(event.exposureId) !== event.contextId
      ) {
        throw new RangeError(
          "feedback exposure ID must match a prior exposure and context",
        );
      }
      if (respondedExposures.has(event.exposureId))
        throw new RangeError("exposure already has a response");
      respondedExposures.add(event.exposureId);
    }
    const normalized: FeedbackEvent = {
      commandId: event.commandId,
      kind: event.kind as FeedbackEvent["kind"],
      contextId: event.contextId as string | null,
      ...(event.exposureId === undefined
        ? {}
        : { exposureId: event.exposureId as string }),
    };
    events.push(normalized);
    commands.add(normalized.commandId);
    if (normalized.kind === "exposure")
      exposures.set(normalized.commandId, normalized.contextId as string);
  }
  return events;
}

function metricsFor(
  judgement: ObserveJudgement,
  feedback: readonly FeedbackEvent[],
) {
  const responded = new Set(
    feedback.flatMap((event) => (event.exposureId ? [event.exposureId] : [])),
  );
  const count = (kind: FeedbackEvent["kind"]) =>
    feedback.filter((event) => event.kind === kind).length;
  return {
    queryCount: 1,
    candidateCount: judgement.candidates.filter(
      (item) => item.decision.status === "candidate",
    ).length,
    abstainCount: judgement.status === "abstain" ? 1 : 0,
    exposureCount: count("exposure"),
    unansweredExposureCount: feedback.filter(
      (event) => event.kind === "exposure" && !responded.has(event.commandId),
    ).length,
    directSelectionCount: count("direct_selection"),
    explicitRelevanceRejectionCount: count("relevance_rejection"),
    primaryChangeCount: count("primary_change"),
    evaluatedPairCount: 0,
    note: "Manual event counts only; unanswered exposures are not negative labels. Quality metrics belong to CORE-07.",
  };
}

function writeImmutableRun(
  directory: string,
  files: Readonly<Record<ArtifactFile, string>>,
  manifest: RunManifest,
): void {
  const target = path.resolve(directory);
  if (existsSync(target)) throw new RangeError("run directory already exists");
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = mkdtempSync(`${target}.tmp-`);
  try {
    for (const file of artifactFiles)
      writeFileSync(path.join(temporary, file), files[file], {
        flag: "wx",
        mode: 0o600,
      });
    writeFileSync(path.join(temporary, "manifest.json"), json(manifest), {
      flag: "wx",
      mode: 0o600,
    });
    if (existsSync(target))
      throw new RangeError("run directory already exists");
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

export function runFromFile(
  input: string,
  options: {
    output?: string;
    feedback?: string;
    budget?: RetrievalBudget;
  } = {},
) {
  const budget = options.budget ?? 32;
  validateBudget(budget);
  const start = performance.now();
  const inputBytes = readFileSync(input);
  let inputText: string;
  try {
    inputText = new TextDecoder("utf-8", { fatal: true }).decode(inputBytes);
  } catch {
    throw new RangeError("snapshot fixture must be UTF-8 JSON");
  }
  let snapshot: ReturnType<typeof buildSnapshotFromFile>;
  try {
    snapshot = buildSnapshotFromFile(input);
  } catch {
    throw new RangeError("invalid snapshot fixture");
  }
  if (!readFileSync(input).equals(inputBytes))
    throw new RangeError("snapshot fixture changed during run");
  const snapshotDone = performance.now();
  const retrieval = retrieveExactLexicalCandidates(snapshot, budget);
  const retrievalDone = performance.now();
  const measurements = measureExactCandidates(snapshot, retrieval);
  const measurementDone = performance.now();
  const judgement = runObserveJudgement(snapshot, retrieval, measurements);
  const decisionDone = performance.now();
  const features: StoredFeatures = {
    retrieval,
    measurements: [...measurements],
  };
  const feedback = readFeedback(
    options.feedback,
    new Set(snapshot.contexts.map((item) => item.contextId)),
    new Set(judgement.candidates.map((item) => item.candidate.contextId)),
  );
  const runId = randomUUID();
  const files: Record<ArtifactFile, string> = {
    "input.json": inputText,
    "features.json": json(features),
    "judgements.jsonl": lines([judgement]),
    "failures.jsonl": "",
    "feedback.jsonl": lines(feedback),
    "metrics.json": json(metricsFor(judgement, feedback)),
    "report.md": `# IEUM Lab run\n\n- runId: ${runId}\n- execution: fresh exact lexical observe\n- snapshotInputHash: ${snapshot.manifest.inputHash}\n- status: ${judgement.status}\n- returned candidates: ${judgement.candidates.length}\n- feedback events: ${feedback.length}\n- quality evaluation: not run\n\nPrivate input and features are stored in this run directory. No model was executed.\n`,
  };
  const fileHashes = Object.fromEntries(
    artifactFiles.map((file) => [
      file,
      hash(file === "input.json" ? inputBytes : files[file]),
    ]),
  ) as Record<ArtifactFile, string>;
  const manifest: RunManifest = {
    schemaVersion: 1,
    runId,
    execution: "fresh_exact_observe",
    modelExecution: "none",
    engineHash: engineHash(),
    configHash: configHash(budget),
    inputHash: fileHashes["input.json"],
    snapshotInputHash: snapshot.manifest.inputHash,
    snapshotManifest: snapshot.manifest,
    featureHash: fileHashes["features.json"],
    decisionHash: fileHashes["judgements.jsonl"],
    profileId: judgement.profileId,
    policyVersion: judgement.policyVersion,
    budget,
    stageDurationsMs: {
      snapshot: snapshotDone - start,
      retrieval: retrievalDone - snapshotDone,
      measurement: measurementDone - retrievalDone,
      decision: decisionDone - measurementDone,
    },
    fallbacks: [],
    files: fileHashes,
  };
  const directory =
    options.output ??
    path.join(os.homedir(), ".local", "share", "ieum-lab", "runs", runId);
  writeImmutableRun(directory, files, manifest);
  return {
    runId,
    directory: path.resolve(directory),
    status: judgement.status,
    candidateCount: judgement.candidates.length,
  };
}

function readRun(directory: string) {
  const root = path.resolve(directory);
  const rawManifest = parseObject(
    readFileSync(path.join(root, "manifest.json"), "utf8"),
    "manifest",
  );
  if (
    rawManifest.schemaVersion !== 1 ||
    rawManifest.execution !== "fresh_exact_observe" ||
    rawManifest.modelExecution !== "none" ||
    typeof rawManifest.runId !== "string" ||
    typeof rawManifest.engineHash !== "string" ||
    typeof rawManifest.configHash !== "string" ||
    typeof rawManifest.snapshotInputHash !== "string" ||
    typeof rawManifest.inputHash !== "string" ||
    typeof rawManifest.featureHash !== "string" ||
    typeof rawManifest.decisionHash !== "string"
  ) {
    throw new RangeError("invalid run manifest");
  }
  validateBudget(rawManifest.budget as RetrievalBudget);
  const hashes = rawManifest.files;
  if (hashes === null || typeof hashes !== "object" || Array.isArray(hashes))
    throw new RangeError("invalid file hash manifest");
  const files = {} as Record<ArtifactFile, string>;
  for (const file of artifactFiles) {
    const expected = (hashes as Record<string, unknown>)[file];
    if (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected))
      throw new RangeError("invalid file hash manifest");
    const bytes = readFileSync(path.join(root, file));
    if (hash(bytes) !== expected)
      throw new RangeError(`run artifact hash mismatch: ${file}`);
    files[file] = bytes.toString("utf8");
  }
  const manifest = rawManifest as RunManifest;
  if (
    manifest.inputHash !== manifest.files["input.json"] ||
    manifest.featureHash !== manifest.files["features.json"] ||
    manifest.decisionHash !== manifest.files["judgements.jsonl"] ||
    manifest.snapshotManifest?.inputHash !== manifest.snapshotInputHash
  ) {
    throw new RangeError("run manifest hash fields disagree");
  }
  const judgements = parseLines(files["judgements.jsonl"]);
  if (judgements.length !== 1)
    throw new RangeError("run requires one stored judgement");
  const judgement = judgements[0] as ObserveJudgement;
  if (
    judgement === null ||
    typeof judgement !== "object" ||
    judgement.snapshotInputHash !== manifest.snapshotInputHash ||
    judgement.profileId !== manifest.profileId ||
    judgement.policyVersion !== manifest.policyVersion ||
    (judgement.status !== "candidate" && judgement.status !== "abstain") ||
    !Array.isArray(judgement.candidates)
  )
    throw new RangeError("stored judgement disagrees with manifest");
  const feedback = parseLines(files["feedback.jsonl"]);
  const failures = parseLines(files["failures.jsonl"]);
  const metrics = parseObject(files["metrics.json"], "metrics");
  if (failures.length !== 0)
    throw new RangeError("completed run contains failures");
  return {
    root,
    manifest,
    files,
    judgement,
    feedback,
    metrics,
  };
}

export function inspectRun(directory: string) {
  const run = readRun(directory);
  return {
    runId: run.manifest.runId,
    execution: run.manifest.execution,
    modelExecution: run.manifest.modelExecution,
    snapshotInputHash: run.manifest.snapshotInputHash,
    engineHash: run.manifest.engineHash,
    configHash: run.manifest.configHash,
    status: run.judgement.status,
    candidateCount: run.judgement.candidates.length,
    feedbackEventCount: run.feedback.length,
    metrics: run.metrics,
    integrity: "artifact_hashes_verified",
  };
}

export function replayRun(directory: string) {
  const run = readRun(directory);
  if (
    run.manifest.engineHash !== engineHash() ||
    run.manifest.configHash !== configHash(run.manifest.budget)
  ) {
    throw new RangeError(
      "engine or config differs; this would be a rerun, not decision replay",
    );
  }
  let snapshot: ReturnType<typeof buildSnapshotFromFile>;
  try {
    snapshot = buildSnapshotFromFile(path.join(run.root, "input.json"));
  } catch {
    throw new RangeError("stored snapshot fixture is invalid");
  }
  if (snapshot.manifest.inputHash !== run.manifest.snapshotInputHash)
    throw new RangeError("snapshot input hash differs");
  if (
    JSON.stringify(snapshot.manifest) !==
    JSON.stringify(run.manifest.snapshotManifest)
  )
    throw new RangeError("snapshot revision manifest differs");
  const stored = parseObject(run.files["features.json"], "features");
  if (
    !Array.isArray(stored.measurements) ||
    stored.retrieval === null ||
    typeof stored.retrieval !== "object"
  )
    throw new RangeError("invalid stored features");
  const entries = stored.measurements as [string, CandidateMeasurements][];
  if (
    entries.some(
      (entry) =>
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== "string",
    )
  )
    throw new RangeError("invalid stored measurements");
  const measurements = new Map(entries);
  if (measurements.size !== entries.length)
    throw new RangeError("duplicate stored measurement context");
  const decision = runObserveJudgement(
    snapshot,
    stored.retrieval as RetrievalResult,
    measurements,
  );
  if (JSON.stringify(decision) !== JSON.stringify(run.judgement))
    throw new RangeError("decision replay mismatch");
  return {
    runId: run.manifest.runId,
    matched: true,
    execution: "decision_replay",
    modelExecuted: false,
    decisionHash: run.manifest.decisionHash,
  };
}

export function compareRuns(first: string, second: string) {
  const a = readRun(first);
  const b = readRun(second);
  return {
    firstRunId: a.manifest.runId,
    secondRunId: b.manifest.runId,
    sameInput: a.manifest.snapshotInputHash === b.manifest.snapshotInputHash,
    sameEngine: a.manifest.engineHash === b.manifest.engineHash,
    sameConfig: a.manifest.configHash === b.manifest.configHash,
    sameFeatures: a.manifest.featureHash === b.manifest.featureHash,
    sameDecision: JSON.stringify(a.judgement) === JSON.stringify(b.judgement),
    firstStatus: a.judgement.status,
    secondStatus: b.judgement.status,
  };
}
