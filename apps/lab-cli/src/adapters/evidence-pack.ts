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
import { createEvidencePack, PACK_SECTIONS } from "@ieum/core";
import type { EvidencePackRequest } from "@ieum/core";
import { readRun } from "./run.js";
import { buildSnapshotFromFile } from "./snapshot.js";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function markdown(pack: ReturnType<typeof createEvidencePack>): string {
  const names = {
    question: "질문",
    observation: "관찰",
    counterargument: "반론",
    decision: "결정",
    unknown: "미확인",
  };
  const output = [
    `# ${pack.title.replaceAll("\n", " ")}`,
    "",
    `목적: ${pack.manifest.purpose.replaceAll("\n", " ")}`,
    "",
  ];
  for (const section of PACK_SECTIONS) {
    output.push(`## ${names[section]}`, "");
    const entries = pack.sections[section];
    if (entries.length === 0) output.push("미확인", "");
    for (const { ref } of entries) {
      output.push(
        `- 출처: ${ref.unitId}@${ref.unitRevision}, ${ref.captureId}@${ref.captureRevision}, ${ref.sourceSpan.start}-${ref.sourceSpan.end}`,
        "",
        ...ref.text.split("\n").map((line) => `> ${line}`),
        "",
      );
    }
  }
  return `${output.join("\n")}\n`;
}

export function packFromRun(
  runDirectory: string,
  requestFile: string,
  output?: string,
) {
  const run = readRun(runDirectory);
  let request: EvidencePackRequest & { selectionCommandId: string };
  try {
    request = JSON.parse(readFileSync(requestFile, "utf8")) as typeof request;
  } catch {
    throw new RangeError("invalid evidence pack request JSON");
  }
  if (
    !request ||
    typeof request !== "object" ||
    typeof request.selectionCommandId !== "string" ||
    !request.selectionCommandId.trim() ||
    !run.feedback.some(
      (event) =>
        event !== null &&
        typeof event === "object" &&
        (event as Record<string, unknown>).kind === "direct_selection" &&
        (event as Record<string, unknown>).commandId ===
          request.selectionCommandId &&
        (event as Record<string, unknown>).contextId ===
          request.selectedContextId,
    )
  ) {
    throw new RangeError("pack requires a matching stored direct selection");
  }
  const snapshot = buildSnapshotFromFile(path.join(run.root, "input.json"));
  if (snapshot.manifest.inputHash !== run.manifest.snapshotInputHash)
    throw new RangeError("pack snapshot disagrees with run manifest");
  const pack = createEvidencePack(snapshot, request, sha256);
  const packId = randomUUID();
  const target = path.resolve(
    output ??
      path.join(os.homedir(), ".local", "share", "ieum-lab", "packs", packId),
  );
  if (existsSync(target)) throw new RangeError("pack directory already exists");
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = mkdtempSync(`${target}.tmp-`);
  try {
    const files = {
      "pack.json": `${JSON.stringify(pack, null, 2)}\n`,
      "pack.md": markdown(pack),
    };
    for (const [name, content] of Object.entries(files))
      writeFileSync(path.join(temporary, name), content, {
        flag: "wx",
        mode: 0o600,
      });
    writeFileSync(
      path.join(temporary, "manifest.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          packId,
          runId: run.manifest.runId,
          selectionCommandId: request.selectionCommandId,
          ...pack.manifest,
          files: Object.fromEntries(
            Object.entries(files).map(([name, content]) => [
              name,
              sha256(content),
            ]),
          ),
        },
        null,
        2,
      )}\n`,
      { flag: "wx", mode: 0o600 },
    );
    if (existsSync(target))
      throw new RangeError("pack directory already exists");
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  return { packId, directory: target, missingSections: pack.missingSections };
}
