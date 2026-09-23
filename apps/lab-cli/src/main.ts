#!/usr/bin/env node
import { CORE_PACKAGE_ID } from "@ieum/core";

if (process.argv.length === 3 && process.argv[2] === "--smoke") {
  process.stdout.write(`${CORE_PACKAGE_ID}:lab-harness\n`);
} else {
  process.stderr.write("Usage: ieum-lab --smoke\n");
  process.exitCode = 2;
}
