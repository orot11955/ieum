import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";
import { managementOpenApi } from "../../packages/contracts/dist/management.js";
import { deliveryOpenApi } from "../../packages/contracts/dist/delivery.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const check = process.argv.includes("--check");
const documents = [
  ["management", managementOpenApi],
  ["delivery", deliveryOpenApi],
];
let drift = false;

for (const [name, document] of documents) {
  const outputs = [
    [
      `packages/contracts/openapi/${name}.json`,
      `${JSON.stringify(document, null, 2)}\n`,
    ],
    [
      `packages/contracts/generated/${name}.ts`,
      astToString(await openapiTS(document)),
    ],
  ];
  for (const [relative, expected] of outputs) {
    const target = path.join(root, relative);
    if (check) {
      let actual;
      try {
        actual = readFileSync(target, "utf8");
      } catch {
        actual = undefined;
      }
      if (actual !== expected) {
        console.error(`Generated contract drift: ${relative}`);
        drift = true;
      }
    } else {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, expected);
      console.log(`Generated ${relative}`);
    }
  }
}

if (drift) process.exitCode = 1;
