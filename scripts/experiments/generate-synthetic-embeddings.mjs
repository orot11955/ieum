import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tokenizeLexicalText } from "../../packages/core/dist/index.js";

const datasetPath = new URL(
  "../../datasets/sample/core-07-b0.json",
  import.meta.url,
);
const outputPath = new URL(
  "../../datasets/sample/core-09-synthetic-embeddings.json",
  import.meta.url,
);
const dataset = JSON.parse(readFileSync(datasetPath, "utf8"));
if (dataset.dataKind !== "synthetic")
  throw new RangeError("sample generator requires synthetic data");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const dimensions = 32;
const fields = {
  modelId: "synthetic-token-hash-projection",
  modelRevision: "1",
  dimensions,
  tokenizer: "ieum-lexical-v1",
  queryPrefix: "none",
  passagePrefix: "none",
  pooling: "signed-token-sum-l2",
  precision: "float64",
};
function embed(text) {
  const vector = Array(dimensions).fill(0);
  const tokens = tokenizeLexicalText(text);
  for (const token of tokens.length ? tokens : [text]) {
    const digest = createHash("sha256").update(token).digest();
    const index = digest.readUInt16BE(0) % dimensions;
    vector[index] += digest[2] & 1 ? 1 : -1;
  }
  if (vector.every((value) => value === 0)) vector[0] = 1;
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return vector.map((value) => value / norm);
}
const vectors = [
  ...dataset.cases.map(({ id, text }) => ({
    kind: "query",
    id: `unit:query:${id}`,
    revision: 1,
    textHash: sha256(text),
    vector: embed(text),
  })),
  ...dataset.contexts.map(({ id, name }) => ({
    kind: "identity",
    id,
    revision: null,
    textHash: sha256(name),
    vector: embed(name),
  })),
  ...dataset.contexts.map(({ id, memberText }) => ({
    kind: "unit",
    id: `unit:capture:${id}`,
    revision: 1,
    textHash: sha256(memberText),
    vector: embed(memberText),
  })),
];
writeFileSync(
  outputPath,
  `${JSON.stringify({ schemaVersion: 1, space: { namespace: sha256(JSON.stringify(fields)), ...fields }, vectors })}\n`,
);
process.stdout.write(
  `Wrote ${vectors.length} synthetic vectors from text fields only.\n`,
);
