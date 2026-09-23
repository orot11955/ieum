import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compareRuns, inspectRun, replayRun, runFromFile } from "./run.js";
import { packFromRun } from "./evidence-pack.js";

function fixture() {
  const captures = [
    {
      workspaceId: "w",
      captureId: "q",
      revision: 1,
      rawBody: "여행 기록 PRIVATE_QUERY",
      originKey: "q",
      recordedAt: 100,
      occurredAt: null,
    },
    {
      workspaceId: "w",
      captureId: "a",
      revision: 1,
      rawBody: "여행 기록 PRIVATE_SOURCE",
      originKey: "a",
      recordedAt: 90,
      occurredAt: null,
    },
  ];
  const units = captures.map((capture, index) => ({
    workspaceId: "w",
    unitId: index ? "ua" : "uq",
    revision: 1,
    captureId: capture.captureId,
    captureRevision: 1,
    originKey: capture.originKey,
    sourceSpan: { start: 0, end: capture.rawBody.length, encoding: "utf16" },
    content: { kind: "quote", text: capture.rawBody },
    recordedAt: capture.recordedAt,
  }));
  return {
    workspaceId: "w",
    asOfRecordedAt: 100,
    query: { unitId: "uq", revision: 1 },
    captures,
    units,
    contexts: [
      {
        workspaceId: "w",
        contextId: "c1",
        identityRevision: 1,
        membershipRevision: 1,
        name: "여행",
        recordedAt: 90,
        memberUnits: [{ unitId: "ua", revision: 1 }],
      },
      {
        workspaceId: "w",
        contextId: "c2",
        identityRevision: 1,
        membershipRevision: 1,
        name: "무관",
        recordedAt: 90,
        memberUnits: [],
      },
    ],
    relations: [],
    visibility: [],
    profileWatermarks: [],
  };
}

function withFixture(fn: (directory: string, input: string) => void) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ieum-run-test-"));
  const input = path.join(directory, "fixture.json");
  writeFileSync(input, JSON.stringify(fixture()));
  try {
    fn(directory, input);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("run is immutable, inspectable and replays a stored decision without recomputing features", () => {
  withFixture((directory, input) => {
    const first = path.join(directory, "first");
    const second = path.join(directory, "second");
    const result = runFromFile(input, { output: first, budget: "all" });
    assert.equal(result.directory, first);
    assert.deepEqual(readdirSync(first).sort(), [
      "failures.jsonl",
      "features.json",
      "feedback.jsonl",
      "input.json",
      "judgements.jsonl",
      "manifest.json",
      "metrics.json",
      "report.md",
    ]);
    assert.equal(readFileSync(path.join(first, "failures.jsonl"), "utf8"), "");
    assert.equal(
      readFileSync(path.join(first, "report.md"), "utf8").includes("PRIVATE_"),
      false,
    );
    const manifest = JSON.parse(
      readFileSync(path.join(first, "manifest.json"), "utf8"),
    );
    assert.match(manifest.engineHash, /^[a-f0-9]{64}$/);
    assert.match(manifest.configHash, /^[a-f0-9]{64}$/);
    assert.equal(manifest.modelExecution, "none");
    assert.equal(manifest.snapshotManifest.query.unitId, "uq");
    assert.deepEqual(manifest.fallbacks, []);
    assert.ok(
      Object.values(manifest.stageDurationsMs).every(
        (value) => typeof value === "number" && value >= 0,
      ),
    );
    assert.equal(inspectRun(first).integrity, "artifact_hashes_verified");
    assert.deepEqual(replayRun(first), {
      runId: result.runId,
      matched: true,
      execution: "decision_replay",
      modelExecuted: false,
      decisionHash: manifest.decisionHash,
    });
    runFromFile(input, { output: second, budget: "all" });
    const comparison = compareRuns(first, second);
    assert.equal(comparison.sameInput, true);
    assert.equal(comparison.sameEngine, true);
    assert.equal(comparison.sameConfig, true);
    assert.equal(comparison.sameFeatures, true);
    assert.equal(comparison.sameDecision, true);
    assert.throws(
      () => runFromFile(input, { output: first }),
      /already exists/,
    );
    writeFileSync(input, "changed original fixture");
    assert.equal(replayRun(first).matched, true);
    assert.equal(
      readFileSync(path.join(first, "input.json"), "utf8").includes(
        "PRIVATE_QUERY",
      ),
      true,
    );
  });
});

test("direct selection creates a private immutable evidence pack from stored run input", () => {
  withFixture((directory, input) => {
    const feedback = path.join(directory, "feedback.json");
    writeFileSync(
      feedback,
      JSON.stringify([
        { commandId: "select-1", kind: "direct_selection", contextId: "c1" },
      ]),
    );
    const run = path.join(directory, "run");
    runFromFile(input, { output: run, feedback });
    const requestFile = path.join(directory, "pack-request.json");
    const request = {
      selectionCommandId: "select-1",
      selectedContextId: "c1",
      title: "여행",
      purpose: "기록 정리",
      sections: {
        question: [
          { unitId: "uq", revision: 1, quote: "여행 기록 PRIVATE_QUERY" },
        ],
        observation: [
          { unitId: "ua", revision: 1, quote: "여행 기록 PRIVATE_SOURCE" },
        ],
        counterargument: [],
        decision: [],
        unknown: [],
      },
    };
    writeFileSync(requestFile, JSON.stringify(request));
    const output = path.join(directory, "pack");
    const result = packFromRun(run, requestFile, output);
    assert.equal(result.directory, output);
    assert.deepEqual(result.missingSections, [
      "counterargument",
      "decision",
      "unknown",
    ]);
    assert.match(
      readFileSync(path.join(output, "pack.md"), "utf8"),
      /PRIVATE_SOURCE/,
    );
    const manifest = JSON.parse(
      readFileSync(path.join(output, "manifest.json"), "utf8"),
    );
    assert.equal(manifest.selectionCommandId, "select-1");
    assert.equal(manifest.originFamilies.length, 2);
    assert.match(manifest.sourceHashes[0].sha256, /^[a-f0-9]{64}$/);
    assert.throws(
      () => packFromRun(run, requestFile, output),
      /already exists/,
    );
    writeFileSync(input, "changed original fixture");
    assert.match(
      readFileSync(path.join(output, "pack.md"), "utf8"),
      /PRIVATE_SOURCE/,
    );
    request.selectionCommandId = "wrong";
    writeFileSync(requestFile, JSON.stringify(request));
    assert.throws(
      () => packFromRun(run, requestFile, path.join(directory, "wrong")),
      /matching stored direct selection/,
    );
    request.selectionCommandId = "select-1";
    request.sections.observation[0]!.quote = "invented";
    writeFileSync(requestFile, JSON.stringify(request));
    assert.throws(
      () => packFromRun(run, requestFile, path.join(directory, "mismatch")),
      /original source span/,
    );
    request.sections.observation[0]!.quote = "여행 기록 PRIVATE_SOURCE";
    writeFileSync(requestFile, JSON.stringify(request));
    const privateHome = path.join(directory, "private-home");
    mkdirSync(privateHome);
    const cli = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("../main.js", import.meta.url)),
        "pack",
        run,
        requestFile,
      ],
      { encoding: "utf8", env: { ...process.env, HOME: privateHome } },
    );
    assert.equal(cli.status, 0, cli.stderr);
    const cliResult = JSON.parse(cli.stdout);
    assert.ok(
      cliResult.directory.startsWith(
        path.join(privateHome, ".local", "share", "ieum-lab", "packs"),
      ),
    );
    assert.equal(cli.stdout.includes("PRIVATE_SOURCE"), false);
    assert.match(
      readFileSync(path.join(cliResult.directory, "pack.md"), "utf8"),
      /PRIVATE_SOURCE/,
    );
  });
});

test("feedback keeps exposure, direct selection, explicit rejection, primary change, and nonresponse distinct", () => {
  withFixture((directory, input) => {
    const feedback = path.join(directory, "feedback.json");
    writeFileSync(
      feedback,
      JSON.stringify([
        { commandId: "e1", kind: "exposure", contextId: "c1" },
        { commandId: "e2", kind: "exposure", contextId: "c1" },
        {
          commandId: "s1",
          kind: "direct_selection",
          contextId: "c1",
          exposureId: "e1",
        },
        {
          commandId: "r1",
          kind: "relevance_rejection",
          contextId: "c1",
          exposureId: "e2",
        },
        { commandId: "p1", kind: "primary_change", contextId: null },
      ]),
    );
    const output = path.join(directory, "run");
    runFromFile(input, { output, feedback });
    const events = readFileSync(path.join(output, "feedback.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      events.map((event) => event.kind),
      [
        "exposure",
        "exposure",
        "direct_selection",
        "relevance_rejection",
        "primary_change",
      ],
    );
    const metrics = JSON.parse(
      readFileSync(path.join(output, "metrics.json"), "utf8"),
    );
    assert.equal(metrics.exposureCount, 2);
    assert.equal(metrics.unansweredExposureCount, 0);
    assert.equal(metrics.directSelectionCount, 1);
    assert.equal(metrics.explicitRelevanceRejectionCount, 1);
    assert.equal(metrics.primaryChangeCount, 1);
    assert.equal(metrics.evaluatedPairCount, 0);
    assert.equal(replayRun(output).matched, true);

    writeFileSync(
      feedback,
      JSON.stringify([{ commandId: "e3", kind: "exposure", contextId: "c1" }]),
    );
    const unanswered = path.join(directory, "unanswered");
    runFromFile(input, { output: unanswered, feedback });
    assert.equal(
      JSON.parse(readFileSync(path.join(unanswered, "metrics.json"), "utf8"))
        .unansweredExposureCount,
      1,
    );
    assert.equal(
      JSON.parse(readFileSync(path.join(unanswered, "metrics.json"), "utf8"))
        .explicitRelevanceRejectionCount,
      0,
    );
  });
});

test("duplicate command IDs and invalid exposure references fail before publishing a run", () => {
  withFixture((directory, input) => {
    const feedback = path.join(directory, "feedback.json");
    const output = path.join(directory, "run");
    writeFileSync(
      feedback,
      JSON.stringify([
        { commandId: "same", kind: "exposure", contextId: "c1" },
        {
          commandId: "same",
          kind: "relevance_rejection",
          contextId: "c1",
          exposureId: "same",
        },
      ]),
    );
    assert.throws(() => runFromFile(input, { output, feedback }), /unique/);
    assert.equal(existsSync(output), false);
    writeFileSync(
      feedback,
      JSON.stringify([
        {
          commandId: "r",
          kind: "relevance_rejection",
          contextId: "c1",
          exposureId: "missing",
        },
      ]),
    );
    assert.throws(
      () => runFromFile(input, { output, feedback }),
      /prior exposure/,
    );
    assert.equal(existsSync(output), false);
    writeFileSync(
      feedback,
      JSON.stringify([
        { commandId: "e", kind: "exposure", contextId: "c1" },
        {
          commandId: "s",
          kind: "direct_selection",
          contextId: "c1",
          exposureId: "e",
        },
        {
          commandId: "r",
          kind: "relevance_rejection",
          contextId: "c1",
          exposureId: "e",
        },
      ]),
    );
    assert.throws(
      () => runFromFile(input, { output, feedback }),
      /already has a response/,
    );
    assert.equal(existsSync(output), false);
  });
});

test("stale temporary directories are ignored and modified artifacts fail integrity checks", () => {
  withFixture((directory, input) => {
    const output = path.join(directory, "run");
    const stale = path.join(directory, "run.tmp-interrupted");
    mkdirSync(stale);
    writeFileSync(path.join(stale, "partial"), "interrupted");
    runFromFile(input, { output });
    assert.equal(existsSync(stale), true);
    assert.equal(replayRun(output).matched, true);
    assert.throws(() => inspectRun(stale));
    writeFileSync(path.join(output, "features.json"), "{}\n");
    assert.throws(() => replayRun(output), /hash mismatch/);
    assert.throws(() => inspectRun(output), /hash mismatch/);
  });
});

test("decision replay rejects an engine mismatch instead of claiming a model rerun", () => {
  withFixture((directory, input) => {
    const output = path.join(directory, "run");
    runFromFile(input, { output });
    const manifestPath = path.join(output, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.engineHash = "0".repeat(64);
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => replayRun(output), /rerun, not decision replay/);
  });
});

test("CLI run, replay, inspect, compare expose metadata without printing private text", () => {
  withFixture((directory, input) => {
    const main = fileURLToPath(new URL("../main.js", import.meta.url));
    const first = path.join(directory, "first");
    const second = path.join(directory, "second");
    for (const output of [first, second]) {
      const run = spawnSync(
        process.execPath,
        [main, "run", input, "--out", output, "--budget", "all"],
        { encoding: "utf8" },
      );
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.stdout.includes("PRIVATE_"), false);
    }
    const defaultRun = spawnSync(process.execPath, [main, "run", input], {
      encoding: "utf8",
      env: { ...process.env, HOME: directory },
    });
    assert.equal(defaultRun.status, 0, defaultRun.stderr);
    const defaultDirectory = JSON.parse(defaultRun.stdout).directory as string;
    assert.equal(
      defaultDirectory.startsWith(
        path.join(directory, ".local", "share", "ieum-lab", "runs"),
      ),
      true,
    );
    assert.equal(
      existsSync(path.join(defaultDirectory, "manifest.json")),
      true,
    );
    for (const args of [
      ["replay", first],
      ["inspect", first],
      ["compare", first, second],
    ]) {
      const result = spawnSync(process.execPath, [main, ...args], {
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.includes("PRIVATE_"), false);
    }
    const invalid = path.join(directory, "invalid.json");
    writeFileSync(invalid, '{"raw":"PRIVATE_ERROR", bad json');
    const failed = spawnSync(
      process.execPath,
      [main, "run", invalid, "--out", path.join(directory, "invalid-run")],
      { encoding: "utf8" },
    );
    assert.equal(failed.status, 1);
    assert.equal(failed.stderr.includes("PRIVATE_ERROR"), false);
    assert.equal(existsSync(path.join(directory, "invalid-run")), false);
  });
});
