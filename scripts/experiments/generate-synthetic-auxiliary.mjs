import { writeFileSync } from "node:fs";
import { auxiliaryDatasetHash } from "../../apps/lab-cli/dist/adapters/auxiliary-artifact.js";
import { loadDataset } from "../../apps/lab-cli/dist/evaluation/index.js";

const datasetPath = new URL(
  "../../datasets/sample/core-07-b0.json",
  import.meta.url,
);
const outputPath = new URL(
  "../../datasets/sample/core-10-synthetic-auxiliary.json",
  import.meta.url,
);
const dataset = loadDataset(datasetPath);
if (dataset.dataKind !== "synthetic")
  throw new RangeError("sample generator requires synthetic data");
const signals = [
  {
    queryId: "deploy-1",
    contextId: "deploy-canary",
    graph: null,
    session: 1,
    recordedAt: 1,
    evidenceId: "synthetic-prior-view-1",
  },
  {
    queryId: "garden-2",
    contextId: "garden-water",
    graph: 1,
    session: null,
    recordedAt: 1,
    evidenceId: "synthetic-link-1",
  },
];
for (const signal of signals) {
  const query = dataset.cases.find((item) => item.id === signal.queryId);
  if (
    !query ||
    !dataset.contexts.some((item) => item.id === signal.contextId) ||
    signal.recordedAt >= query.recordedAt
  )
    throw new RangeError(
      "synthetic auxiliary example is outside dataset scope",
    );
}
writeFileSync(
  outputPath,
  `${JSON.stringify({ schemaVersion: 1, datasetHash: auxiliaryDatasetHash(dataset), dataKind: "synthetic", signals })}\n`,
);
process.stdout.write(
  `Wrote ${signals.length} synthetic auxiliary signals without using labels.\n`,
);
