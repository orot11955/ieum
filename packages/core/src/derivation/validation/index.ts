import { parseEvidenceRef } from "../../model/validation.js";
import type { EvidenceRef } from "../../model/types.js";
import type { ValidatedSnapshot } from "../../snapshot/types.js";
import { PACK_SECTIONS } from "../evidence-pack/index.js";
import type { EvidencePack } from "../evidence-pack/index.js";

export type DraftClaimKind =
  "quote" | "paraphrase" | "synthesis" | "author_added";
export type ModelDraft = Readonly<{
  draftRevision: number;
  blocks: readonly Readonly<{
    blockId: string;
    text: string;
    claims: readonly Readonly<{
      claimId: string;
      text: string;
      kind: DraftClaimKind;
      sourceIndices: readonly number[];
    }>[];
  }>[];
}>;
export type CurrentSourceState = Readonly<{
  unitId: string;
  unitRevision: number;
  captureId: string;
  captureRevision: number;
  captureHash: string;
}>;
export type PreviousClaimMapping = Readonly<{
  claimId: string;
  blockHash: string;
  mappingHash: string;
}>;
export type ClaimValidation = Readonly<{
  claimId: string;
  kind: DraftClaimKind;
  blockId: string;
  blockHash: string;
  mappingHash: string;
  sources: readonly EvidenceRef[];
  independentOriginFamilies: readonly string[];
  issues: readonly string[];
  sourceStatus: "valid" | "invalid" | "none";
  semanticStatus: "requires_review" | "needs_remap" | "invalid";
  authorStatus: "not_applicable" | "needs_author_confirmation";
}>;
export type DraftValidationReport = Readonly<{
  status: "unavailable" | "invalid" | "review_required";
  draftRevision: number | null;
  claims: readonly ClaimValidation[];
  reviewRequired: true;
  canPublish: false;
}>;

function sameRef(a: EvidenceRef, b: EvidenceRef): boolean {
  return (
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
    a.text === b.text
  );
}
function digest(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Checks the allowlisted pack against its immutable snapshot, without reading external data. */
function verifyPack(
  pack: EvidencePack,
  snapshot: ValidatedSnapshot,
  hashText: (text: string) => string,
): void {
  if (
    pack.schemaVersion !== 1 ||
    pack.manifest.snapshotInputHash !== snapshot.manifest.inputHash ||
    pack.manifest.workspaceId !== snapshot.manifest.workspaceId
  )
    throw new RangeError("evidence pack and snapshot disagree");
  const context = snapshot.contexts.find(
    (item) => item.contextId === pack.manifest.selectedContextId,
  );
  if (!context)
    throw new RangeError("evidence pack context is outside snapshot");
  const entries = PACK_SECTIONS.flatMap((section) => pack.sections[section]);
  if (
    entries.length !== pack.manifest.sourceRefs.length ||
    entries.some(
      (entry, index) => !sameRef(entry.ref, pack.manifest.sourceRefs[index]!),
    )
  )
    throw new RangeError(
      "evidence pack manifest sources disagree with sections",
    );
  if (
    pack.manifest.sourceHashes.length !==
    new Set(
      entries.map(
        (entry) => `${entry.ref.captureId}\u0000${entry.ref.captureRevision}`,
      ),
    ).size
  )
    throw new RangeError("evidence pack source hash set disagrees");
  for (const section of PACK_SECTIONS)
    for (const entry of pack.sections[section]) {
      const ref = entry.ref;
      const isQuery =
        section === "question" &&
        ref.unitId === snapshot.query.unitId &&
        ref.unitRevision === snapshot.query.revision;
      if (
        !isQuery &&
        !context.memberUnits.some(
          (member) =>
            member.unitId === ref.unitId &&
            member.revision === ref.unitRevision,
        )
      )
        throw new RangeError("evidence source is outside selected context");
      const unit = [snapshot.query, ...snapshot.units].find(
        (item) =>
          item.unitId === ref.unitId && item.revision === ref.unitRevision,
      );
      const capture = snapshot.captures.find(
        (item) =>
          item.captureId === ref.captureId &&
          item.revision === ref.captureRevision,
      );
      if (!unit || !capture)
        throw new RangeError("evidence source revision is missing");
      parseEvidenceRef(ref, unit, capture);
      const computed = hashText(capture.rawBody);
      const manifest = pack.manifest.sourceHashes.find(
        (item) =>
          item.captureId === capture.captureId &&
          item.revision === capture.revision,
      );
      if (
        !digest(computed) ||
        computed !== entry.captureHash ||
        computed !== manifest?.sha256
      )
        throw new RangeError("evidence source content hash changed");
    }
}

/** Validates model output as data. It never edits a draft, pack or source. */
export function validateDraftClaims(
  pack: EvidencePack,
  snapshot: ValidatedSnapshot,
  allowedSourceIndices: readonly number[],
  currentSources: readonly CurrentSourceState[],
  draft: ModelDraft | null,
  previousMappings: readonly PreviousClaimMapping[],
  hashText: (text: string) => string,
): DraftValidationReport {
  verifyPack(pack, snapshot, hashText);
  if (
    !Array.isArray(allowedSourceIndices) ||
    allowedSourceIndices.some(
      (index) =>
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= pack.manifest.sourceRefs.length,
    ) ||
    new Set(allowedSourceIndices).size !== allowedSourceIndices.length
  )
    throw new RangeError("invalid draft source allowlist");
  if (
    !Array.isArray(currentSources) ||
    !Array.isArray(previousMappings) ||
    new Set(currentSources.map((item) => item.unitId)).size !==
      currentSources.length ||
    new Set(previousMappings.map((item) => item.claimId)).size !==
      previousMappings.length ||
    previousMappings.some(
      (item) =>
        !text(item.claimId) ||
        !digest(item.blockHash) ||
        !digest(item.mappingHash),
    )
  )
    throw new RangeError("invalid current source or mapping state");
  if (draft === null)
    return {
      status: "unavailable",
      draftRevision: null,
      claims: [],
      reviewRequired: true,
      canPublish: false,
    };
  if (
    !Number.isSafeInteger(draft.draftRevision) ||
    draft.draftRevision < 1 ||
    !Array.isArray(draft.blocks) ||
    draft.blocks.length === 0
  )
    throw new RangeError("invalid model draft header");
  const blockIds = new Set<string>();
  const claimIds = new Set<string>();
  const allowed = new Set(allowedSourceIndices);
  const prior = new Map(previousMappings.map((item) => [item.claimId, item]));
  const state = new Map(currentSources.map((item) => [item.unitId, item]));
  const claims: ClaimValidation[] = [];
  for (const block of draft.blocks) {
    if (
      !block ||
      !text(block.blockId) ||
      !text(block.text) ||
      !Array.isArray(block.claims) ||
      block.claims.length === 0 ||
      blockIds.has(block.blockId)
    )
      throw new RangeError("invalid or duplicate draft block");
    blockIds.add(block.blockId);
    const blockHash = hashText(block.text);
    if (!digest(blockHash))
      throw new RangeError("draft hash must be SHA-256 hex");
    for (const claim of block.claims) {
      if (
        !claim ||
        !text(claim.claimId) ||
        !text(claim.text) ||
        claimIds.has(claim.claimId) ||
        !["quote", "paraphrase", "synthesis", "author_added"].includes(
          claim.kind,
        ) ||
        !Array.isArray(claim.sourceIndices)
      )
        throw new RangeError("invalid or duplicate draft claim");
      claimIds.add(claim.claimId);
      const issues: string[] = [];
      if (!block.text.includes(claim.text)) issues.push("CLAIM_NOT_IN_BLOCK");
      if (new Set(claim.sourceIndices).size !== claim.sourceIndices.length)
        issues.push("DUPLICATE_SOURCE_REF");
      const refs: EvidenceRef[] = [];
      for (const index of claim.sourceIndices) {
        if (!Number.isSafeInteger(index) || !allowed.has(index)) {
          issues.push("SOURCE_OUTSIDE_ALLOWLIST");
          continue;
        }
        const ref = pack.manifest.sourceRefs[index]!;
        refs.push(ref);
        const current = state.get(ref.unitId);
        if (
          !current ||
          current.unitRevision !== ref.unitRevision ||
          current.captureId !== ref.captureId ||
          current.captureRevision !== ref.captureRevision ||
          current.captureHash !==
            pack.manifest.sourceHashes.find(
              (item) =>
                item.captureId === ref.captureId &&
                item.revision === ref.captureRevision,
            )?.sha256
        )
          issues.push("STALE_SOURCE_REVISION");
      }
      if (claim.kind === "author_added") {
        if (claim.sourceIndices.length) issues.push("AUTHOR_CLAIM_HAS_SOURCE");
      } else if (!claim.sourceIndices.length) issues.push("SOURCE_REQUIRED");
      if (
        claim.kind === "quote" &&
        (refs.length !== 1 || !refs[0]!.text.includes(claim.text))
      )
        issues.push("QUOTE_NOT_EXACT");
      const families = [...new Set(refs.map((ref) => ref.originKey))].sort();
      if (
        claim.kind === "synthesis" &&
        claim.sourceIndices.length > 1 &&
        families.length < 2
      )
        issues.push("SOURCES_NOT_INDEPENDENT");
      const mappingHash = hashText(
        JSON.stringify([
          claim.claimId,
          claim.text,
          claim.kind,
          claim.sourceIndices.map((index: number) => {
            const ref = pack.manifest.sourceRefs[index];
            return ref
              ? [
                  ref.unitId,
                  ref.unitRevision,
                  ref.captureId,
                  ref.captureRevision,
                  ref.text,
                ]
              : index;
          }),
        ]),
      );
      if (!digest(mappingHash))
        throw new RangeError("draft hash must be SHA-256 hex");
      const old = prior.get(claim.claimId);
      if (
        old &&
        (old.blockHash !== blockHash || old.mappingHash !== mappingHash)
      )
        issues.push("STALE_MAPPING");
      const invalid = issues.some(
        (issue) =>
          issue !== "STALE_MAPPING" && issue !== "SOURCES_NOT_INDEPENDENT",
      );
      const sourceInvalid = issues.some((issue) =>
        [
          "DUPLICATE_SOURCE_REF",
          "SOURCE_OUTSIDE_ALLOWLIST",
          "STALE_SOURCE_REVISION",
          "SOURCE_REQUIRED",
          "AUTHOR_CLAIM_HAS_SOURCE",
          "QUOTE_NOT_EXACT",
        ].includes(issue),
      );
      claims.push({
        claimId: claim.claimId,
        kind: claim.kind,
        blockId: block.blockId,
        blockHash,
        mappingHash,
        sources: refs,
        independentOriginFamilies: families,
        issues: [...new Set(issues)],
        sourceStatus: sourceInvalid
          ? "invalid"
          : claim.kind === "author_added"
            ? "none"
            : "valid",
        semanticStatus: invalid
          ? "invalid"
          : old &&
              (old.blockHash !== blockHash || old.mappingHash !== mappingHash)
            ? "needs_remap"
            : "requires_review",
        authorStatus:
          claim.kind === "author_added"
            ? "needs_author_confirmation"
            : "not_applicable",
      });
    }
  }
  return {
    status: claims.some((item) => item.issues.length)
      ? "invalid"
      : "review_required",
    draftRevision: draft.draftRevision,
    claims,
    reviewRequired: true,
    canPublish: false,
  };
}
