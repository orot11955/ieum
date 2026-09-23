import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateB0, loadDataset, validateFeatureInput } from "./index.js";

const sample = fileURLToPath(
  new URL("../../../../datasets/sample/core-07-b0.json", import.meta.url),
);
function scratch(fn: (root: string) => void) {
  const root = mkdtempSync(path.join(os.tmpdir(), "ieum-eval-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function changedDataset(
  root: string,
  change: (value: Record<string, unknown>) => void,
): string {
  const data = JSON.parse(readFileSync(sample, "utf8")) as Record<
    string,
    unknown
  >;
  change(data);
  const file = path.join(root, "changed.json");
  writeFileSync(file, JSON.stringify(data));
  return file;
}

test("B0 sample has 40 distinct contexts, 60 grouped queries and separate synthetic results", () => {
  const dataset = loadDataset(sample);
  assert.equal(dataset.dataKind, "synthetic");
  assert.equal(dataset.contexts.length, 40);
  assert.equal(dataset.cases.length, 60);
  assert.deepEqual(
    Object.fromEntries(
      ["development", "validation", "holdout"].map((split) => [
        split,
        dataset.cases.filter((item) => item.split === split).length,
      ]),
    ),
    { development: 36, validation: 12, holdout: 12 },
  );
  const result = evaluateB0(dataset);
  assert.equal(result.overall.recallAtK.denominator, 50);
  assert.equal(result.overall.recallAtK.numerator, 49);
  assert.equal(result.overall.noMatchFalseSuggestionRate.denominator, 4);
  assert.deepEqual(result.overall.reviewedPairPrecision, {
    numerator: 0,
    denominator: 0,
    value: null,
  });
  assert.equal(result.overall.queryCoverage.value, 0);
  assert.equal(result.failures.length, 1);
  assert.equal(result.qualityGate, "not_evaluated");
  assert.equal(JSON.stringify(result.failures).includes("rawBody"), false);
});

test("one hit of two relevant contexts yields Recall@1 of one half and Hit@1 of one", () => {
  const sampleData = loadDataset(sample);
  const first = sampleData.cases.find((item) => item.id === "deploy-5");
  assert.ok(first);
  const result = evaluateB0(
    {
      schemaVersion: 1,
      dataKind: "synthetic",
      contexts: sampleData.contexts.slice(0, 2),
      cases: [first],
    },
    1,
  );
  assert.deepEqual(result.overall.recallAtK, {
    numerator: 0.5,
    denominator: 1,
    value: 0.5,
  });
  assert.deepEqual(result.overall.hitAtK, {
    numerator: 1,
    denominator: 1,
    value: 1,
  });
  assert.equal(result.failures.length, 1);
});

test("empty metric denominators are N/A and unanswered reviews do not become negatives", () => {
  const data = loadDataset(sample);
  const ambiguous = data.cases.find((item) => item.gold.kind === "ambiguous");
  const insufficient = data.cases.find(
    (item) => item.gold.kind === "insufficient",
  );
  assert.ok(ambiguous && insufficient);
  const result = evaluateB0({
    schemaVersion: 1,
    dataKind: "synthetic",
    contexts: data.contexts,
    cases: [ambiguous, insufficient],
  });
  assert.equal(result.overall.recallAtK.value, null);
  assert.equal(result.overall.hitAtK.value, null);
  assert.equal(result.overall.queryCoverage.value, null);
  assert.equal(result.overall.noMatchFalseSuggestionRate.value, null);
  assert.equal(result.overall.reviewedPairPrecision.value, null);
  assert.equal(result.overall.ambiguousQueries, 1);
  assert.equal(result.overall.insufficientQueries, 1);
  assert.equal(result.overall.unreviewedLabeledPairs, 1);
  assert.equal(result.overall.unreviewedSuggestedPairs, 0);
});

test("gold and feedback are rejected at the feature boundary and source dataset boundary", () => {
  assert.throws(
    () => validateFeatureInput({ gold: { kind: "match" } }, "a".repeat(64)),
    /labels cannot enter feature input/,
  );
  assert.throws(
    () =>
      validateFeatureInput({ query: { feedback: "future" } }, "a".repeat(64)),
    /labels cannot enter feature input/,
  );
  scratch((root) => {
    const file = changedDataset(root, (data) => {
      (data.cases as Record<string, unknown>[])[0]!.feedback = [
        { recordedAt: 9999, contextId: "deploy-rollback" },
      ];
    });
    assert.throws(() => loadDataset(file), /unsupported field: feedback/);
  });
});

test("origin families and recorded time cannot cross development, validation and holdout", () => {
  scratch((root) => {
    const sameOrigin = changedDataset(root, (data) => {
      (data.cases as Record<string, unknown>[])[36]!.originFamily =
        "query:deploy";
    });
    assert.throws(() => loadDataset(sameOrigin), /origin family crosses/);
    const badTime = changedDataset(root, (data) => {
      (data.cases as Record<string, unknown>[])[36]!.recordedAt = 101;
    });
    assert.throws(() => loadDataset(badTime), /time windows overlap/);
  });
});

test("CLI writes a self-contained synthetic B0 report and failure list outside source input", () => {
  scratch((root) => {
    const main = fileURLToPath(new URL("../main.js", import.meta.url));
    const out = path.join(root, "evaluation");
    const result = spawnSync(
      process.execPath,
      [main, "evaluate", sample, "--out", out],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.contextCount, 40);
    assert.equal(summary.queryCount, 60);
    assert.equal(summary.failureCount, 1);
    const metrics = JSON.parse(
      readFileSync(path.join(out, "metrics.json"), "utf8"),
    );
    assert.equal(metrics.overall.recallAtK.denominator, 50);
    assert.equal(
      readFileSync(path.join(out, "failures.jsonl"), "utf8").trim().split("\n")
        .length,
      1,
    );
    assert.equal(
      readFileSync(path.join(out, "report.md"), "utf8").includes("여행"),
      false,
    );
    assert.equal(
      readFileSync(sample, "utf8").includes('"schemaVersion": 1'),
      true,
    );
  });
});
