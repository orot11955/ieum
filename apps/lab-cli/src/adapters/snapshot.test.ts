import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildSnapshotFromFile } from "./snapshot.js";

function fixture() {
  const captures = [
    {
      workspaceId: "w1",
      captureId: "q",
      revision: 1,
      rawBody: "PRIVATE QUERY TEXT",
      originKey: "origin:q",
      recordedAt: 100,
      occurredAt: null,
    },
    {
      workspaceId: "w1",
      captureId: "a",
      revision: 1,
      rawBody: "PRIVATE CANDIDATE TEXT",
      originKey: "origin:a",
      recordedAt: 100,
      occurredAt: 10,
    },
  ];
  const units = captures.map((capture, index) => ({
    workspaceId: "w1",
    unitId: index === 0 ? "uq" : "ua",
    revision: 1,
    captureId: capture.captureId,
    captureRevision: 1,
    originKey: capture.originKey,
    sourceSpan: { start: 0, end: capture.rawBody.length, encoding: "utf16" },
    content: { kind: "quote", text: capture.rawBody },
    recordedAt: 100,
  }));
  return {
    workspaceId: "w1",
    asOfRecordedAt: 100,
    query: { unitId: "uq", revision: 1 },
    captures,
    units,
    contexts: [
      {
        workspaceId: "w1",
        contextId: "c",
        identityRevision: 1,
        membershipRevision: 1,
        name: "context",
        recordedAt: 100,
        memberUnits: [
          { unitId: "uq", revision: 1 },
          { unitId: "ua", revision: 1 },
        ],
      },
    ],
    relations: [],
    visibility: [],
    profileWatermarks: [],
  };
}

test("file adapter hashes canonical input and CLI prints only the manifest", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ieum-snapshot-"));
  try {
    const firstPath = path.join(directory, "first.json");
    const secondPath = path.join(directory, "second.json");
    const first = fixture();
    const second = {
      ...first,
      captures: [...first.captures].reverse(),
      units: [...first.units].reverse(),
      contexts: first.contexts.map((context) => ({
        ...context,
        memberUnits: [...context.memberUnits].reverse(),
      })),
    };
    writeFileSync(firstPath, JSON.stringify(first));
    writeFileSync(
      secondPath,
      JSON.stringify(Object.fromEntries(Object.entries(second).reverse())),
    );

    const manifest = buildSnapshotFromFile(firstPath).manifest;
    assert.deepEqual(buildSnapshotFromFile(secondPath).manifest, manifest);
    assert.match(manifest.inputHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(manifest.eligibleUnits, [{ unitId: "ua", revision: 1 }]);
    assert.equal(JSON.stringify(manifest).includes("PRIVATE"), false);

    const mainPath = fileURLToPath(new URL("../main.js", import.meta.url));
    const cli = spawnSync(
      process.execPath,
      [mainPath, "--snapshot", firstPath],
      {
        encoding: "utf8",
      },
    );
    assert.equal(cli.status, 0);
    assert.deepEqual(JSON.parse(cli.stdout), manifest);
    assert.equal(cli.stdout.includes("PRIVATE"), false);

    writeFileSync(
      secondPath,
      JSON.stringify({
        ...second,
        captures: [
          ...second.captures,
          { ...second.captures[0], workspaceId: "w2" },
        ],
      }),
    );
    const invalid = spawnSync(
      process.execPath,
      [mainPath, "--snapshot", secondPath],
      {
        encoding: "utf8",
      },
    );
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Snapshot validation failed/);
    assert.equal(invalid.stdout, "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
