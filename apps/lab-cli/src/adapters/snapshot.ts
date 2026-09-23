import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { validateSnapshot } from "@ieum/core";
import type { ValidatedSnapshot } from "@ieum/core";

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Snapshot fixture arrays are sets; their input order is not meaningful. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
  }
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(input)
        .sort(compare)
        .map((key) => [key, canonicalize(input[key])]),
    );
  }
  return value;
}

export function buildSnapshotFromFile(filePath: string): ValidatedSnapshot {
  const input: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  const canonicalInput = JSON.stringify(canonicalize(input));
  const inputHash = createHash("sha256").update(canonicalInput).digest("hex");
  return validateSnapshot(input, inputHash);
}
