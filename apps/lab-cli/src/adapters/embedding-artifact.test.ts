import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { rankSemanticSnapshot } from "@ieum/core";
import {
  compareSemanticFile,
  evaluateB0,
  evaluateB1,
  loadDataset,
  snapshotFor,
} from "../evaluation/index.js";
import { runExactObserve } from "./observe.js";
import {
  readEmbeddingArtifact,
  resolveSnapshotVectors,
} from "./embedding-artifact.js";

const datasetFile = fileURLToPath(
  new URL("../../../../datasets/sample/core-07-b0.json", import.meta.url),
);
const artifactFile = fileURLToPath(
  new URL(
    "../../../../datasets/sample/core-09-synthetic-embeddings.json",
    import.meta.url,
  ),
);

test("fixed artifact ranks the same 60 synthetic snapshots and records B0/B1 quality and process samples", () => {
  const artifact = readEmbeddingArtifact(artifactFile);
  const dataset = loadDataset(datasetFile);
  assert.equal(artifact.vectors.length, 140);
  const b0 = evaluateB0(dataset);
  const b1 = evaluateB1(dataset, artifact);
  assert.equal(
    b0.overall.recallAtK.denominator,
    b1.overall.recallAtK.denominator,
  );
  assert.equal(b0.overall.recallAtK.value, 0.98);
  assert.equal(b1.overall.recallAtK.value, 0.74);
  assert.equal(b1.overall.reviewedPairPrecision.value, null);
  assert.equal(b1.splits.holdout?.recallAtK.value, 0.85);
  const directory = mkdtempSync(path.join(os.tmpdir(), "ieum-semantic-"));
  try {
    const target = path.join(directory, "comparison");
    const output = compareSemanticFile(datasetFile, artifactFile, target);
    assert.equal(output.directory, target);
    const report = JSON.parse(
      readFileSync(path.join(target, "comparison.json"), "utf8"),
    );
    assert.equal(report.artifactHash, artifact.artifactHash);
    assert.ok(report.processMeasurements.b0DurationMs >= 0);
    assert.ok(report.processMeasurements.b1DurationMs >= 0);
    assert.throws(
      () => compareSemanticFile(datasetFile, artifactFile, target),
      /already exists/,
    );
    const cliTarget = path.join(directory, "cli-comparison");
    const cli = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("../main.js", import.meta.url)),
        "compare-semantic",
        datasetFile,
        artifactFile,
        "--out",
        cliTarget,
      ],
      { encoding: "utf8" },
    );
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(JSON.parse(cli.stdout).directory, cliTarget);
    assert.equal(cli.stdout.includes("gold"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("wrong model namespace, dimension, zero vector, missing source, changed text, and unavailable provider artifact fail", () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "ieum-semantic-invalid-"),
  );
  const raw = JSON.parse(readFileSync(artifactFile, "utf8"));
  const file = path.join(directory, "artifact.json");
  const attempt = (mutate: (value: typeof raw) => void) => {
    const value = structuredClone(raw);
    mutate(value);
    writeFileSync(file, JSON.stringify(value));
    return () => readEmbeddingArtifact(file);
  };
  try {
    assert.throws(
      () => readEmbeddingArtifact(path.join(directory, "missing")),
      /unavailable/,
    );
    assert.throws(
      attempt((value) => {
        value.space.modelRevision = "other-model";
      }),
      /namespace mismatch/,
    );
    assert.throws(
      attempt((value) => {
        value.vectors[0].vector.pop();
      }),
      /dimensions/,
    );
    assert.throws(
      attempt((value) => {
        value.vectors[0].vector.fill(0);
      }),
      /zero embedding/,
    );
    const dataset = loadDataset(datasetFile);
    const snapshot = snapshotFor(dataset.contexts, dataset.cases[0]!);
    const missing = attempt((value) => {
      value.vectors = value.vectors.filter(
        (item: { id: string }) => item.id !== snapshot.query.unitId,
      );
    })();
    assert.throws(
      () => resolveSnapshotVectors(snapshot, missing),
      /missing query/,
    );
    const changed = attempt((value) => {
      const entry = value.vectors.find(
        (item: { id: string }) => item.id === snapshot.query.unitId,
      );
      entry.textHash = "0".repeat(64);
    })();
    assert.throws(
      () => resolveSnapshotVectors(snapshot, changed),
      /text changed/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("identifier regression remains visible when a fixed vector space loses a C++ lexical match", () => {
  const snapshot = snapshotFor(
    [
      {
        id: "cpp",
        name: "C++ toolchain",
        memberText: "C++ compiler flags",
        originFamily: "cpp",
      },
      {
        id: "other",
        name: "database",
        memberText: "database records",
        originFamily: "other",
      },
    ],
    {
      id: "q",
      text: "C++ compiler",
      originFamily: "q",
      recordedAt: 100,
      split: "development",
      slices: ["identifier"],
      gold: {
        kind: "match",
        relevantContextIds: ["cpp"],
        reviews: [{ contextId: "cpp", status: "relevant" }],
      },
    },
  );
  const b0 = runExactObserve(snapshot, "all");
  const b1 = rankSemanticSnapshot(snapshot, {
    space: {
      namespace: "fixed",
      modelId: "regression",
      modelRevision: "1",
      dimensions: 2,
      tokenizer: "manual",
      queryPrefix: "none",
      passagePrefix: "none",
      pooling: "manual",
      precision: "float32",
    },
    query: [1, 0],
    identities: [
      { contextId: "cpp", vector: [0, 1] },
      { contextId: "other", vector: [1, 0] },
    ],
    units: [
      { unitId: "unit:capture:cpp", revision: 1, vector: [0, 1] },
      { unitId: "unit:capture:other", revision: 1, vector: [1, 0] },
    ],
  });
  assert.equal(b0.retrieval.candidates[0]?.contextId, "cpp");
  assert.equal(b1[0]?.contextId, "other");
});
