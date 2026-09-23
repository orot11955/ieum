import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readAuxiliaryArtifact } from "../adapters/auxiliary-artifact.js";
import { readEmbeddingArtifact } from "../adapters/embedding-artifact.js";
import { compareHybridFile, evaluateHybrid } from "./hybrid.js";
import { loadDataset } from "./index.js";

const datasetFile = fileURLToPath(
  new URL("../../../../datasets/sample/core-07-b0.json", import.meta.url),
);
const embeddingFile = fileURLToPath(
  new URL(
    "../../../../datasets/sample/core-09-synthetic-embeddings.json",
    import.meta.url,
  ),
);
const auxiliaryFile = fileURLToPath(
  new URL(
    "../../../../datasets/sample/core-10-synthetic-auxiliary.json",
    import.meta.url,
  ),
);

test("B2/B3 synthetic comparison stays observe and reports no validated recommendation policy", () => {
  const dataset = loadDataset(datasetFile);
  const embedding = readEmbeddingArtifact(embeddingFile);
  const auxiliary = readAuxiliaryArtifact(auxiliaryFile, dataset);
  const result = evaluateHybrid(
    dataset,
    embedding,
    10,
    "ARTIFACT_UNAVAILABLE",
    auxiliary,
  );
  assert.equal(result.b2.overall.recallAtK.value, 0.95);
  assert.equal(result.b2.overall.noMatchFalseSuggestionRate.denominator, 4);
  assert.ok(result.b2.slices.korean);
  assert.equal(result.b3.status, "evaluated");
  if (result.b3.status !== "evaluated")
    throw new Error("B3 result unavailable");
  assert.equal(result.b3.signalRowsUsed, 2);
  assert.equal(result.b3.metrics.overall.recallAtK.value, 0.95);
  assert.equal(result.provisionalValidationConfig, null);
  assert.equal(result.suggestionActivation.enabled, false);
  assert.equal(result.mode, "observe");
  const directory = mkdtempSync(path.join(os.tmpdir(), "ieum-hybrid-"));
  try {
    const target = path.join(directory, "comparison");
    const output = compareHybridFile(datasetFile, embeddingFile, {
      auxiliaryFile,
      output: target,
    });
    assert.equal(output.b3Status, "evaluated");
    const report = JSON.parse(
      readFileSync(path.join(target, "comparison.json"), "utf8"),
    );
    assert.equal(report.auxiliaryArtifactHash, auxiliary.artifactHash);
    assert.equal(report.mode, "observe");
    const cliTarget = path.join(directory, "cli");
    const cli = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("../main.js", import.meta.url)),
        "compare-hybrid",
        datasetFile,
        embeddingFile,
        "--aux",
        auxiliaryFile,
        "--out",
        cliTarget,
      ],
      { encoding: "utf8" },
    );
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(JSON.parse(cli.stdout).b3Status, "evaluated");
    assert.equal(cli.stdout.includes("memberText"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("negated Korean query stays an explicit slice while suggestion mode remains observe", () => {
  const dataset = loadDataset(datasetFile);
  const relabeled = {
    ...dataset,
    cases: dataset.cases.map((item) =>
      item.id === "cooking-3"
        ? { ...item, slices: [...item.slices, "negation"] }
        : item,
    ),
  };
  const result = evaluateHybrid(
    relabeled,
    readEmbeddingArtifact(embeddingFile),
  );
  assert.ok(result.b2.slices.negation);
  assert.equal(result.b2.slices.negation?.queryCoverage.numerator, 0);
  assert.equal(result.mode, "observe");
});

test("total and partial semantic failure switch the whole run to lexical-degraded without mixing thresholds", () => {
  const dataset = loadDataset(datasetFile);
  const unavailable = evaluateHybrid(dataset, null);
  assert.equal(unavailable.executionProfileId, "lexical-degraded-v0");
  assert.equal(unavailable.semanticFailureCode, "ARTIFACT_UNAVAILABLE");
  assert.equal(unavailable.b2.overall.recallAtK.value, 0.98);
  assert.equal(unavailable.provisionalValidationConfig, null);
  assert.equal(unavailable.mode, "observe");
  const artifact = readEmbeddingArtifact(embeddingFile);
  const partial = { ...artifact, vectors: artifact.vectors.slice(1) };
  const degraded = evaluateHybrid(dataset, partial);
  assert.equal(degraded.executionProfileId, "lexical-degraded-v0");
  assert.equal(degraded.semanticFailureCode, "ARTIFACT_INCOMPLETE");
  assert.equal(degraded.b2.overall.recallAtK.value, 0.98);
});

test("auxiliary artifact rejects future signals, mismatched dataset, duplicate evidence, and label fields", () => {
  const dataset = loadDataset(datasetFile);
  const raw = JSON.parse(readFileSync(auxiliaryFile, "utf8"));
  const directory = mkdtempSync(path.join(os.tmpdir(), "ieum-aux-invalid-"));
  const file = path.join(directory, "aux.json");
  const attempt = (mutate: (value: typeof raw) => void) => {
    const value = structuredClone(raw);
    mutate(value);
    writeFileSync(file, JSON.stringify(value));
    return () => readAuxiliaryArtifact(file, dataset);
  };
  try {
    assert.throws(
      attempt((value) => {
        value.datasetHash = "0".repeat(64);
      }),
      /dataset hash mismatch/,
    );
    assert.throws(
      attempt((value) => {
        value.signals[0].recordedAt = 100;
      }),
      /eligible time/,
    );
    assert.throws(
      attempt((value) => {
        value.signals.push({ ...value.signals[0] });
      }),
      /duplicate/,
    );
    assert.throws(
      attempt((value) => {
        value.signals[0].gold = "relevant";
      }),
      /invalid auxiliary signal fields/,
    );
    assert.throws(
      () => readAuxiliaryArtifact(path.join(directory, "missing"), dataset),
      /unavailable/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
