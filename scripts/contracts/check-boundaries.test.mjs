import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { findBoundaryViolations } from "./check-boundaries.mjs";

test("core, web, and delivery reject forbidden imports", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ieum-boundaries-"));
  try {
    mkdirSync(path.join(root, "packages/core/src"), { recursive: true });
    mkdirSync(path.join(root, "apps/web/src"), { recursive: true });
    mkdirSync(path.join(root, "packages/contracts/src"), { recursive: true });
    writeFileSync(
      path.join(root, "packages/core/src/bad.ts"),
      'import "@ieum/backend";\n',
    );
    writeFileSync(
      path.join(root, "apps/web/src/bad.ts"),
      'import type { Row } from "drizzle-orm";\nimport "@nestjs/common";\n',
    );
    writeFileSync(
      path.join(root, "packages/contracts/src/delivery.ts"),
      'import "../../core/src/snapshot.js";\n',
    );
    assert.deepEqual(findBoundaryViolations(root), [
      "packages/core/src/bad.ts imports @ieum/backend",
      "apps/web/src/bad.ts imports drizzle-orm",
      "apps/web/src/bad.ts imports @nestjs/common",
      "packages/contracts/src/delivery.ts imports ../../core/src/snapshot.js",
    ]);
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("./check-boundaries.mjs", import.meta.url)),
        "--root",
        root,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /core\/src\/bad\.ts imports @ieum\/backend/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
