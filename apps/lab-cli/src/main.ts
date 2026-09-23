#!/usr/bin/env node
import { CORE_PACKAGE_ID } from "@ieum/core";
import type { RetrievalBudget } from "@ieum/core";
import { buildSnapshotFromFile } from "./adapters/snapshot.js";
import {
  compareRuns,
  inspectRun,
  replayRun,
  runFromFile,
} from "./adapters/run.js";

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
} else if (process.argv[2] === "run" && process.argv.length >= 4) {
  try {
    const args = process.argv.slice(3);
    const input = args.shift() ?? "";
    let output: string | undefined;
    let feedback: string | undefined;
    let budget: RetrievalBudget = 32;
    while (args.length) {
      const arg = args.shift();
      if (arg === "--out" && args.length) output = args.shift();
      else if (arg === "--feedback" && args.length) feedback = args.shift();
      else if (arg === "--budget" && args.length) {
        const value = args.shift();
        if (value === "all") budget = "all";
        else if (value === "16" || value === "32" || value === "64")
          budget = Number(value) as 16 | 32 | 64;
        else throw new RangeError("budget must be 16, 32, 64, or all");
      } else throw new RangeError(`unknown or incomplete run option: ${arg}`);
    }
    process.stdout.write(
      `${JSON.stringify(
        runFromFile(input, {
          ...(output === undefined ? {} : { output }),
          ...(feedback === undefined ? {} : { feedback }),
          budget,
        }),
      )}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Lab run failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  }
} else if (process.argv[2] === "replay" && process.argv.length === 4) {
  try {
    process.stdout.write(
      `${JSON.stringify(replayRun(process.argv[3] ?? ""))}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Lab replay failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  }
} else if (process.argv[2] === "inspect" && process.argv.length === 4) {
  try {
    process.stdout.write(
      `${JSON.stringify(inspectRun(process.argv[3] ?? ""))}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Lab inspect failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  }
} else if (process.argv[2] === "compare" && process.argv.length === 5) {
  try {
    process.stdout.write(
      `${JSON.stringify(compareRuns(process.argv[3] ?? "", process.argv[4] ?? ""))}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Lab compare failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  }
} else {
  process.stderr.write(
    "Usage: ieum-lab --smoke | --snapshot <file> | run <file> [--out <directory>] [--feedback <file>] [--budget <n|all>] | replay <run-directory> | inspect <run-directory> | compare <run-a> <run-b>\n",
  );
  process.exitCode = 2;
}
