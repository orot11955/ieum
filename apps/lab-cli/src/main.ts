#!/usr/bin/env node
import { CORE_PACKAGE_ID } from "@ieum/core";
import { buildSnapshotFromFile } from "./adapters/snapshot.js";

if (process.argv.length === 3 && process.argv[2] === "--smoke") {
  process.stdout.write(`${CORE_PACKAGE_ID}:lab-harness\n`);
} else if (process.argv.length === 4 && process.argv[2] === "--snapshot") {
  try {
    const snapshot = buildSnapshotFromFile(process.argv[3] ?? "");
    process.stdout.write(`${JSON.stringify(snapshot.manifest, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `Snapshot validation failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  }
} else {
  process.stderr.write("Usage: ieum-lab --smoke | --snapshot <file>\n");
  process.exitCode = 2;
}
