import type { EvidenceRef } from "../../model/types.js";
import type { EvidencePack } from "../evidence-pack/index.js";

export const DOCUMENT_CHECKLISTS = Object.freeze({
  guide: ["preconditions", "steps", "verification_scope"],
  experiment_note: ["conditions", "attempt", "result", "limitations"],
  decision_record: ["options", "criteria", "evidence", "remaining_risks"],
  comparison: ["viewpoints", "criteria", "support", "opposition", "unknowns"],
} as const);

export type DocumentPurpose = keyof typeof DOCUMENT_CHECKLISTS;
export type SourceRole =
  "personal_observation" | "external_claim" | "counterargument";
export type OutlineCitation = Readonly<{
  sourceIndex: number;
  role: SourceRole;
}>;
export type OutlineEntryRequest = Readonly<{
  itemId: string;
  citations: readonly OutlineCitation[];
  authorInterpretation: string | null;
}>;
export type DocumentPlanRequest = Readonly<{
  purpose: DocumentPurpose;
  audience: string;
  entries: readonly OutlineEntryRequest[];
  conflicts: readonly Readonly<{
    leftSourceIndex: number;
    rightSourceIndex: number;
    note: string;
  }>[];
}>;
export type PlannedOutlineEntry = Readonly<{
  itemId: string;
  status: "sourced" | "author_draft" | "missing";
  citations: readonly Readonly<{ ref: EvidenceRef; role: SourceRole }>[];
  authorInterpretation: string | null;
  independentOriginFamilies: readonly string[];
}>;
export type DocumentPlan = Readonly<{
  title: string;
  purpose: DocumentPurpose;
  audience: string;
  snapshotInputHash: string;
  outline: readonly PlannedOutlineEntry[];
  readiness: Readonly<{
    status: "needs_material" | "needs_author_review";
    missingItems: readonly string[];
    authorDraftItems: readonly string[];
    missingCounterargument: boolean;
    independentOriginFamilies: readonly string[];
    unresolvedConflicts: readonly Readonly<{
      left: EvidenceRef;
      right: EvidenceRef;
      note: string;
    }>[];
    reviewRequired: true;
  }>;
}>;

/** Builds headings and a missing-material report from selected sources only. */
export function planDocument(
  pack: EvidencePack,
  request: DocumentPlanRequest,
): DocumentPlan {
  const checklist = DOCUMENT_CHECKLISTS[request.purpose];
  if (!checklist) throw new RangeError("unknown document purpose");
  if (typeof request.audience !== "string" || !request.audience.trim())
    throw new RangeError("document audience is required");
  if (!Array.isArray(request.entries) || !Array.isArray(request.conflicts))
    throw new RangeError("document entries and conflicts must be arrays");
  const refs = pack.manifest.sourceRefs;
  const sameRef = (a: EvidenceRef, b: EvidenceRef) =>
    a.workspaceId === b.workspaceId &&
    a.sourceKind === b.sourceKind &&
    a.unitId === b.unitId &&
    a.unitRevision === b.unitRevision &&
    a.captureId === b.captureId &&
    a.captureRevision === b.captureRevision &&
    a.originKey === b.originKey &&
    a.sourceSpan.start === b.sourceSpan.start &&
    a.sourceSpan.end === b.sourceSpan.end &&
    a.sourceSpan.encoding === b.sourceSpan.encoding &&
    a.transform === b.transform &&
    a.text === b.text;
  const sectionRefs = Object.values(pack.sections).flatMap((entries) =>
    entries.map((entry) => entry.ref),
  );
  if (refs.some((ref) => !sectionRefs.some((item) => sameRef(ref, item))))
    throw new RangeError("evidence pack manifest has an unsupported source");
  function source(index: number): EvidenceRef {
    if (!Number.isSafeInteger(index) || index < 0 || index >= refs.length)
      throw new RangeError("outline source is outside evidence pack");
    return refs[index]!;
  }
  const byItem = new Map<string, OutlineEntryRequest>();
  for (const entry of request.entries) {
    if (
      !entry ||
      !checklist.some((itemId) => itemId === entry.itemId) ||
      byItem.has(entry.itemId)
    )
      throw new RangeError("unknown or duplicate checklist item");
    if (
      !Array.isArray(entry.citations) ||
      (entry.authorInterpretation !== null &&
        (typeof entry.authorInterpretation !== "string" ||
          !entry.authorInterpretation.trim()))
    )
      throw new RangeError("invalid outline entry");
    for (const citation of entry.citations) {
      const ref = source(citation.sourceIndex);
      if (
        !["personal_observation", "external_claim", "counterargument"].includes(
          citation.role,
        )
      )
        throw new RangeError("unknown source role");
      if (
        citation.role === "counterargument" &&
        !pack.sections.counterargument.some((item) => sameRef(item.ref, ref))
      )
        throw new RangeError(
          "counterargument citation is not in pack counterarguments",
        );
    }
    byItem.set(entry.itemId, entry);
  }
  const outline = checklist.map((itemId): PlannedOutlineEntry => {
    const entry = byItem.get(itemId);
    const citations =
      entry?.citations.map((item) => ({
        ref: source(item.sourceIndex),
        role: item.role,
      })) ?? [];
    const authorInterpretation = entry?.authorInterpretation ?? null;
    return {
      itemId,
      status: citations.length
        ? "sourced"
        : authorInterpretation
          ? "author_draft"
          : "missing",
      citations,
      authorInterpretation,
      independentOriginFamilies: [
        ...new Set(citations.map((item) => item.ref.originKey)),
      ].sort(),
    };
  });
  const unresolvedConflicts = request.conflicts.map((item) => {
    const left = source(item.leftSourceIndex);
    const right = source(item.rightSourceIndex);
    if (
      item.leftSourceIndex === item.rightSourceIndex ||
      typeof item.note !== "string" ||
      !item.note.trim()
    )
      throw new RangeError("conflict needs two distinct sources and a note");
    return { left, right, note: item.note };
  });
  const missingItems = outline
    .filter((item) => item.status === "missing")
    .map((item) => item.itemId);
  return {
    title: pack.title,
    purpose: request.purpose,
    audience: request.audience,
    snapshotInputHash: pack.manifest.snapshotInputHash,
    outline,
    readiness: {
      status: missingItems.length ? "needs_material" : "needs_author_review",
      missingItems,
      authorDraftItems: outline
        .filter((item) => item.status === "author_draft")
        .map((item) => item.itemId),
      missingCounterargument: !outline.some((item) =>
        item.citations.some((citation) => citation.role === "counterargument"),
      ),
      independentOriginFamilies: [
        ...new Set(outline.flatMap((item) => item.independentOriginFamilies)),
      ].sort(),
      unresolvedConflicts,
      reviewRequired: true,
    },
  };
}
