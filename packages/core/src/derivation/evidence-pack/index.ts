import { parseEvidenceRef } from "../../model/validation.js";
import type { EvidenceRef, UnitRevisionRef } from "../../model/types.js";
import type { ValidatedSnapshot } from "../../snapshot/types.js";

export const PACK_SECTIONS = [
  "question",
  "observation",
  "counterargument",
  "decision",
  "unknown",
] as const;
export type PackSection = (typeof PACK_SECTIONS)[number];

export type PackSelection = Readonly<UnitRevisionRef & { quote: string }>;
export type EvidencePackRequest = Readonly<{
  selectedContextId: string;
  title: string;
  purpose: string;
  sections: Readonly<Record<PackSection, readonly PackSelection[]>>;
}>;
export type PackSource = Readonly<{
  ref: EvidenceRef;
  captureHash: string;
}>;
export type EvidencePack = Readonly<{
  schemaVersion: 1;
  title: string;
  manifest: Readonly<{
    workspaceId: string;
    snapshotInputHash: string;
    selectedContextId: string;
    purpose: string;
    sourceRefs: readonly EvidenceRef[];
    sourceHashes: readonly Readonly<{
      captureId: string;
      revision: number;
      sha256: string;
    }>[];
    originFamilies: readonly string[];
  }>;
  sections: Readonly<Record<PackSection, readonly PackSource[]>>;
  missingSections: readonly PackSection[];
}>;

export function createEvidencePack(
  snapshot: ValidatedSnapshot,
  request: EvidencePackRequest,
  hashText: (text: string) => string,
): EvidencePack {
  if (!request.title?.trim() || !request.purpose?.trim())
    throw new RangeError("pack title and purpose are required");
  const context = snapshot.contexts.find(
    (item) => item.contextId === request.selectedContextId,
  );
  if (!context) throw new RangeError("selected context is outside snapshot");
  if (!request.sections || typeof request.sections !== "object")
    throw new RangeError("pack sections are required");
  const allowed = new Set(
    context.memberUnits.map((ref) => `${ref.unitId}\u0000${ref.revision}`),
  );
  const sources = new Map<
    string,
    { captureId: string; revision: number; sha256: string }
  >();
  const sections = {} as Record<PackSection, readonly PackSource[]>;
  for (const section of PACK_SECTIONS) {
    const selections = request.sections[section];
    if (!Array.isArray(selections))
      throw new RangeError(`pack section ${section} must be an array`);
    sections[section] = Object.freeze(
      selections.map((selection) => {
        if (!selection || typeof selection !== "object")
          throw new RangeError("pack selection must be an object");
        const key = `${selection.unitId}\u0000${selection.revision}`;
        const isQuery =
          section === "question" &&
          selection.unitId === snapshot.query.unitId &&
          selection.revision === snapshot.query.revision;
        if (!isQuery && !allowed.has(key))
          throw new RangeError("pack source is outside selected context");
        const unit = isQuery
          ? snapshot.query
          : snapshot.units.find(
              (item) =>
                item.unitId === selection.unitId &&
                item.revision === selection.revision,
            );
        if (!unit) throw new RangeError("pack source revision is missing");
        const capture = snapshot.captures.find(
          (item) =>
            item.captureId === unit.captureId &&
            item.revision === unit.captureRevision,
        );
        if (!capture) throw new RangeError("pack capture revision is missing");
        const ref = parseEvidenceRef(
          {
            workspaceId: unit.workspaceId,
            sourceKind: "unit",
            unitId: unit.unitId,
            unitRevision: unit.revision,
            captureId: capture.captureId,
            captureRevision: capture.revision,
            originKey: unit.originKey,
            sourceSpan: unit.sourceSpan,
            transform: "quote",
            text: selection.quote,
          },
          unit,
          capture,
        );
        const captureHash = hashText(capture.rawBody);
        if (!/^[a-f0-9]{64}$/.test(captureHash))
          throw new RangeError("source hash must be a SHA-256 hex digest");
        sources.set(`${capture.captureId}\u0000${capture.revision}`, {
          captureId: capture.captureId,
          revision: capture.revision,
          sha256: captureHash,
        });
        return Object.freeze({ ref, captureHash });
      }),
    );
  }
  const sourceRefs = PACK_SECTIONS.flatMap((section) =>
    sections[section].map((item) => item.ref),
  );
  return Object.freeze({
    schemaVersion: 1 as const,
    title: request.title,
    manifest: Object.freeze({
      workspaceId: snapshot.manifest.workspaceId,
      snapshotInputHash: snapshot.manifest.inputHash,
      selectedContextId: context.contextId,
      purpose: request.purpose,
      sourceRefs: Object.freeze(sourceRefs),
      sourceHashes: Object.freeze(
        [...sources.values()].sort(
          (a, b) =>
            (a.captureId < b.captureId
              ? -1
              : a.captureId > b.captureId
                ? 1
                : 0) || a.revision - b.revision,
        ),
      ),
      originFamilies: Object.freeze(
        [...new Set(sourceRefs.map((ref) => ref.originKey))].sort(),
      ),
    }),
    sections: Object.freeze(sections),
    missingSections: Object.freeze(
      PACK_SECTIONS.filter((section) => sections[section].length === 0),
    ),
  });
}
