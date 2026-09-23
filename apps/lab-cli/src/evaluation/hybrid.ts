import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  HYBRID_SCORE_CONFIG,
  assessSuggestionActivation,
  evaluateCandidate,
  fuseRankings,
  rankSemanticSnapshot,
  rerankFusionWithAuxiliary,
  scoreCandidate,
  selectValidationThresholds,
  suggestionReportBody,
} from "@ieum/core";
import type { SemanticHit, TuningRow, ValidatedSnapshot } from "@ieum/core";
import {
  readEmbeddingArtifact,
  resolveSnapshotVectors,
} from "../adapters/embedding-artifact.js";
import type { EmbeddingArtifact } from "../adapters/embedding-artifact.js";
import { readAuxiliaryArtifact } from "../adapters/auxiliary-artifact.js";
import type { AuxiliaryArtifact } from "../adapters/auxiliary-artifact.js";
import {
  measureExactCandidates,
  runExactObserve,
} from "../adapters/observe.js";
import { retrieveExactLexicalCandidates } from "../adapters/exact-finder.js";
import { loadDataset, reportRows, snapshotFor } from "./index.js";
import type { CaseResult, EvaluationDataset } from "./index.js";

const hash = (text: string | Buffer) =>
  createHash("sha256").update(text).digest("hex");
function hybridScores(
  snapshot: ValidatedSnapshot,
  semanticHits: readonly SemanticHit[],
) {
  const semantic = new Map(semanticHits.map((item) => [item.contextId, item]));
  const retrieval = retrieveExactLexicalCandidates(snapshot, "all");
  const measurements = measureExactCandidates(snapshot, retrieval);
  return retrieval.candidates.map((candidate) => {
    const rawSemantic = semantic.get(candidate.contextId);
    if (!rawSemantic)
      throw new RangeError("hybrid score is missing a semantic context");
    const transformedSemantic = (rawSemantic.cosine + 1) / 2; // fixed monotonic transform, not calibration
    const original = measurements.get(candidate.contextId);
    if (!original)
      throw new RangeError("hybrid lexical measurement is missing");
    const evaluation = evaluateCandidate(snapshot, candidate, {
      ...original,
      semantic: { availability: "available", value: transformedSemantic },
    });
    return {
      contextId: candidate.contextId,
      score: scoreCandidate(evaluation, HYBRID_SCORE_CONFIG),
    };
  });
}

function allSemanticVectorsAvailable(
  dataset: EvaluationDataset,
  artifact: EmbeddingArtifact,
): boolean {
  try {
    for (const item of dataset.cases)
      resolveSnapshotVectors(snapshotFor(dataset.contexts, item), artifact);
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

export function evaluateHybrid(
  dataset: EvaluationDataset,
  artifact: EmbeddingArtifact | null,
  k = 10,
  unavailableCode = "ARTIFACT_UNAVAILABLE",
  auxiliary: AuxiliaryArtifact | null = null,
) {
  const semanticReady =
    artifact !== null && allSemanticVectorsAvailable(dataset, artifact);
  const rows: CaseResult[] = [];
  const b3Rows: CaseResult[] = [];
  let usedAuxiliarySignals = 0;
  const tuningRows: TuningRow[] = [];
  for (const item of dataset.cases) {
    const snapshot = snapshotFor(dataset.contexts, item);
    const lexical = runExactObserve(snapshot, 32);
    const semanticHits = semanticReady
      ? rankSemanticSnapshot(
          snapshot,
          resolveSnapshotVectors(snapshot, artifact!),
        )
      : null;
    const fusion = fuseRankings(
      snapshot,
      lexical.retrieval.candidates.map((candidate) => ({
        contextId: candidate.contextId,
        rank: candidate.rank,
      })),
      semanticHits === null
        ? {
            status: "error",
            code: artifact === null ? unavailableCode : "ARTIFACT_INCOMPLETE",
          }
        : {
            status: "ok",
            hits: semanticHits.map((hit) => ({
              contextId: hit.contextId,
              rank: hit.rank,
            })),
          },
    );
    rows.push({
      id: item.id,
      split: item.split,
      slices: item.slices,
      label: item.gold,
      eligibleContextCount: snapshot.contexts.length,
      topContextIds: fusion.hits.slice(0, k).map((hit) => hit.contextId),
      suggestedContextIds: [],
    });
    if (semanticHits !== null && auxiliary !== null) {
      const signals = fusion.hits.map((hit) => {
        const signal = auxiliary.signals.get(
          `${item.id}\u0000${hit.contextId}`,
        );
        if (signal) usedAuxiliarySignals++;
        return {
          contextId: hit.contextId,
          graph: signal?.graph ?? null,
          session: signal?.session ?? null,
        };
      });
      const b3 = rerankFusionWithAuxiliary(fusion, signals);
      b3Rows.push({
        id: item.id,
        split: item.split,
        slices: item.slices,
        label: item.gold,
        eligibleContextCount: snapshot.contexts.length,
        topContextIds: b3.hits.slice(0, k).map((hit) => hit.contextId),
        suggestedContextIds: [],
      });
    }
    if (
      item.split === "validation" &&
      (item.gold.kind === "match" || item.gold.kind === "no_match") &&
      semanticHits !== null
    ) {
      const scores = new Map(
        hybridScores(snapshot, semanticHits).map((entry) => [
          entry.contextId,
          entry.score,
        ]),
      );
      tuningRows.push({
        split: "validation",
        labelKind: item.gold.kind,
        candidates: fusion.hits.slice(0, k).map((hit) => ({
          contextId: hit.contextId,
          score: scores.get(hit.contextId)!,
          review:
            item.gold.reviews.find(
              (review) => review.contextId === hit.contextId,
            )?.status ?? "unreviewed",
        })),
      });
    }
  }
  const profileId = semanticReady ? "hybrid-v0" : "lexical-degraded-v0";
  const b2 = reportRows(
    rows,
    k,
    profileId === "hybrid-v0" ? "B2-hybrid-rrf-v0" : "B2-lexical-degraded-v0",
    dataset.dataKind,
    dataset.contexts.length,
  );
  const validationRecall = b2.splits.validation?.recallAtK;
  const selected =
    semanticReady &&
    tuningRows.length &&
    validationRecall &&
    validationRecall.denominator > 0
      ? selectValidationThresholds(
          tuningRows,
          profileId,
          {
            numerator: validationRecall.numerator,
            denominator: validationRecall.denominator,
          },
          hash,
        )
      : null;
  let activation: ReturnType<typeof assessSuggestionActivation> | null = null;
  if (selected) {
    const body = {
      split: "validation" as const,
      dataKind: dataset.dataKind,
      datasetHash: hash(JSON.stringify(dataset)),
      featureArtifactHash: artifact!.artifactHash,
      profileId,
      configHash: selected.config.configHash,
      ...selected.metrics,
      independentOriginFamilyCount: new Set(
        dataset.cases
          .filter((item) => item.split === "validation")
          .map((item) => item.originFamily),
      ).size,
    };
    activation = assessSuggestionActivation(
      selected.config,
      { ...body, reportHash: hash(suggestionReportBody(body)) },
      hash,
    );
  }
  return {
    b2,
    b3:
      semanticReady && auxiliary !== null && usedAuxiliarySignals > 0
        ? {
            status: "evaluated" as const,
            signalRowsUsed: usedAuxiliarySignals,
            dataKind: auxiliary.dataKind,
            metrics: reportRows(
              b3Rows,
              k,
              "B3-graph-session-rank-ablation-v0",
              dataset.dataKind,
              dataset.contexts.length,
            ),
            note: "Rank-only ablation; graph/session boosts do not satisfy content or suggestion gates.",
          }
        : {
            status: "not_evaluated" as const,
            reason: !semanticReady
              ? ("DEGRADED_PROFILE" as const)
              : ("NO_GRAPH_SESSION_INPUTS" as const),
          },
    executionProfileId: profileId,
    semanticFailureCode: semanticReady
      ? null
      : artifact === null
        ? unavailableCode
        : "ARTIFACT_INCOMPLETE",
    provisionalValidationConfig: selected?.config ?? null,
    validationMetricsForSelection: selected?.metrics ?? null,
    suggestionActivation: activation ?? {
      enabled: false,
      reasons: ["NO_VALIDATED_CONFIG"],
    },
    mode: "observe" as const,
  };
}

export function compareHybridFile(
  datasetFile: string,
  artifactFile: string,
  options: { output?: string; auxiliaryFile?: string } = {},
) {
  const datasetBytes = readFileSync(datasetFile);
  const dataset = loadDataset(datasetFile);
  if (!readFileSync(datasetFile).equals(datasetBytes))
    throw new RangeError("evaluation dataset changed during run");
  let artifact: EmbeddingArtifact | null = null;
  let unavailableCode = "ARTIFACT_UNAVAILABLE";
  try {
    artifact = readEmbeddingArtifact(artifactFile);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    unavailableCode =
      error.message === "embedding artifact unavailable"
        ? "ARTIFACT_UNAVAILABLE"
        : "ARTIFACT_INVALID";
  }
  const auxiliary = options.auxiliaryFile
    ? readAuxiliaryArtifact(options.auxiliaryFile, dataset)
    : null;
  const result = evaluateHybrid(
    dataset,
    artifact,
    10,
    unavailableCode,
    auxiliary,
  );
  const id = randomUUID();
  const target = path.resolve(
    options.output ??
      path.join(
        os.homedir(),
        ".local",
        "share",
        "ieum-lab",
        "hybrid-comparisons",
        id,
      ),
  );
  if (existsSync(target))
    throw new RangeError("hybrid comparison directory already exists");
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = mkdtempSync(`${target}.tmp-`);
  try {
    const files = {
      "comparison.json": `${JSON.stringify({ dataKind: dataset.dataKind, datasetHash: hash(datasetBytes), artifactHash: artifact?.artifactHash ?? null, auxiliaryArtifactHash: auxiliary?.artifactHash ?? null, ...result }, null, 2)}\n`,
      "report.md": `# B2/B3 hybrid comparison\n\n- data kind: ${dataset.dataKind}\n- profile: ${result.executionProfileId}\n- B2 Recall@10: ${result.b2.overall.recallAtK.numerator}/${result.b2.overall.recallAtK.denominator}\n- B3: ${result.b3.status}\n- suggestion mode: observe\n\nRRF and B3 are rank scores, not confidence. Validation-only threshold selection is provisional. Synthetic vectors and auxiliary signals cannot authorize product recommendations.\n`,
    };
    for (const [name, content] of Object.entries(files))
      writeFileSync(path.join(temporary, name), content, {
        flag: "wx",
        mode: 0o600,
      });
    writeFileSync(
      path.join(temporary, "manifest.json"),
      `${JSON.stringify({ schemaVersion: 1, comparisonId: id, datasetHash: hash(datasetBytes), artifactHash: artifact?.artifactHash ?? null, auxiliaryArtifactHash: auxiliary?.artifactHash ?? null, files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, hash(content)])) }, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    if (existsSync(target))
      throw new RangeError("hybrid comparison directory already exists");
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  return {
    comparisonId: id,
    directory: target,
    profileId: result.executionProfileId,
    mode: result.mode,
    b3Status: result.b3.status,
  };
}
