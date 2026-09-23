import type { CaptureRevision } from "../model/types.js";
import type { Utf16Span } from "../snapshot.js";
import { sliceRawSpan } from "../snapshot.js";

export type ExtractionTargetKind =
  "task" | "event" | "thought_unit" | "context";
export type ExtractProposal = Readonly<{
  proposalId: string;
  decisionKey: string;
  origin: Readonly<{
    workspaceId: string;
    captureId: string;
    revision: number;
    originKey: string;
    sourceSpan: Utf16Span;
    sourceText: string;
  }>;
  targetKind: ExtractionTargetKind;
  suggestedTitle: string;
  suggestedBody: string | null;
  temporal: Readonly<{
    expression: string;
    basisEpochMs: number;
    timeZone: string | null;
    proposedEpochMs: number | null;
    ambiguity: readonly string[];
  }> | null;
  unresolvedFields: readonly (
    "title" | "body" | "time_zone" | "start_time" | "ambiguity"
  )[];
  status: "candidate";
}>;
export type RawExtractCandidate = Readonly<{
  captureId: string;
  captureRevision: number;
  sourceSpan: Utf16Span;
  sourceText: string;
  targetKind: ExtractionTargetKind;
  suggestedTitle: string;
  suggestedBody: string | null;
  temporal: ExtractProposal["temporal"];
}>;
export type ExtractDecision = Readonly<{
  decisionKey: string;
  state: "rejected" | "accepted" | "completed_task";
}>;

function validText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function epoch(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    Math.abs(value) <= 8_640_000_000_000_000
  );
}
function digest(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
function boundary(text: string, offset: number): boolean {
  if (offset < 1 || offset >= text.length) return true;
  const left = text.charCodeAt(offset - 1);
  const right = text.charCodeAt(offset);
  return !(
    left >= 0xd800 &&
    left <= 0xdbff &&
    right >= 0xdc00 &&
    right <= 0xdfff
  );
}
function validateTemporal(
  value: RawExtractCandidate["temporal"],
  kind: ExtractionTargetKind,
): void {
  if (value === null) {
    if (kind === "event")
      throw new RangeError("event needs a temporal expression");
    return;
  }
  if (
    !validText(value.expression) ||
    !epoch(value.basisEpochMs) ||
    (value.timeZone !== null &&
      (!validText(value.timeZone) ||
        !/^[A-Za-z_]+\/[A-Za-z_/-]+$/.test(value.timeZone))) ||
    (value.proposedEpochMs !== null && !epoch(value.proposedEpochMs)) ||
    !Array.isArray(value.ambiguity) ||
    value.ambiguity.some((item) => !validText(item))
  )
    throw new RangeError("invalid extraction temporal basis or ambiguity");
  if (
    value.proposedEpochMs !== null &&
    (value.timeZone === null || value.ambiguity.length > 0)
  )
    throw new RangeError("unresolved time cannot have a confirmed instant");
}

/** Validates provider candidates against the immutable capture; never executes a command. */
export function validateExtractProposals(
  capture: CaptureRevision,
  candidates: readonly RawExtractCandidate[],
  previousDecisions: readonly ExtractDecision[],
  hashText: (text: string) => string,
): readonly ExtractProposal[] {
  if (!Array.isArray(candidates) || !Array.isArray(previousDecisions))
    throw new TypeError("extraction inputs must be arrays");
  const decisions = new Map<string, ExtractDecision["state"]>();
  for (const item of previousDecisions) {
    if (
      !digest(item.decisionKey) ||
      !["rejected", "accepted", "completed_task"].includes(item.state) ||
      decisions.has(item.decisionKey)
    )
      throw new RangeError("invalid or duplicate extraction decision");
    decisions.set(item.decisionKey, item.state);
  }
  const seen = new Set<string>();
  const proposals: ExtractProposal[] = [];
  for (const item of candidates) {
    if (
      !item ||
      item.captureId !== capture.captureId ||
      item.captureRevision !== capture.revision ||
      !["task", "event", "thought_unit", "context"].includes(item.targetKind) ||
      !validText(item.suggestedTitle) ||
      (item.suggestedBody !== null && !validText(item.suggestedBody))
    )
      throw new RangeError("invalid extraction candidate");
    const span = item.sourceSpan;
    const sourceText = sliceRawSpan({
      captureId: capture.captureId,
      revision: capture.revision,
      rawBody: capture.rawBody,
      span,
    });
    if (
      sourceText !== item.sourceText ||
      !boundary(capture.rawBody, span.start) ||
      !boundary(capture.rawBody, span.end)
    )
      throw new RangeError("extraction source does not match capture revision");
    validateTemporal(item.temporal, item.targetKind);
    if (
      item.temporal !== null &&
      item.temporal.basisEpochMs !== (capture.occurredAt ?? capture.recordedAt)
    )
      throw new RangeError("temporal basis does not match source capture");
    if (item.temporal && !sourceText.includes(item.temporal.expression))
      throw new RangeError("temporal expression is not in source span");
    const decisionKey = hashText(
      JSON.stringify([
        capture.workspaceId,
        capture.originKey,
        item.targetKind,
        sourceText.trim(),
      ]),
    );
    const proposalId = hashText(
      JSON.stringify([
        capture.captureId,
        capture.revision,
        span.start,
        span.end,
        decisionKey,
        item.suggestedTitle,
        item.suggestedBody,
        item.temporal,
      ]),
    );
    if (!digest(decisionKey) || !digest(proposalId))
      throw new RangeError("extraction hash must be SHA-256 hex");
    if (seen.has(decisionKey) || decisions.has(decisionKey)) continue;
    seen.add(decisionKey);
    const unresolvedFields: ExtractProposal["unresolvedFields"][number][] = [];
    if (item.temporal) {
      if (item.temporal.timeZone === null) unresolvedFields.push("time_zone");
      if (item.temporal.proposedEpochMs === null)
        unresolvedFields.push("start_time");
      if (item.temporal.ambiguity.length) unresolvedFields.push("ambiguity");
    }
    proposals.push({
      proposalId,
      decisionKey,
      origin: {
        workspaceId: capture.workspaceId,
        captureId: capture.captureId,
        revision: capture.revision,
        originKey: capture.originKey,
        sourceSpan: span,
        sourceText,
      },
      targetKind: item.targetKind,
      suggestedTitle: item.suggestedTitle,
      suggestedBody: item.suggestedBody,
      temporal: item.temporal,
      unresolvedFields,
      status: "candidate",
    });
  }
  return proposals;
}

export type ConfirmedExtractCommand = Readonly<{
  targetKind: ExtractionTargetKind;
  title: string;
  body: string | null;
  startEpochMs: number | null;
  timeZone: string | null;
  source: ExtractProposal["origin"];
  proposalId: string;
}>;
/** Produces command input only after live revision, access and user confirmation checks. */
export function prepareExtractCommand(
  proposal: ExtractProposal,
  confirmation: Readonly<{
    proposalId: string;
    currentCaptureRevision: number;
    authorized: boolean;
    alreadyCompletedTask: boolean;
    title: string;
    body: string | null;
    startEpochMs: number | null;
    timeZone: string | null;
  }>,
): ConfirmedExtractCommand {
  if (
    confirmation.proposalId !== proposal.proposalId ||
    confirmation.currentCaptureRevision !== proposal.origin.revision ||
    !confirmation.authorized ||
    (proposal.targetKind === "task" && confirmation.alreadyCompletedTask)
  )
    throw new RangeError(
      "extraction command confirmation is stale or unauthorized",
    );
  if (
    !validText(confirmation.title) ||
    (confirmation.body !== null && !validText(confirmation.body)) ||
    (confirmation.startEpochMs !== null && !epoch(confirmation.startEpochMs)) ||
    (confirmation.timeZone !== null &&
      (!validText(confirmation.timeZone) ||
        !/^[A-Za-z_]+\/[A-Za-z_/-]+$/.test(confirmation.timeZone))) ||
    (proposal.temporal !== null && confirmation.timeZone === null) ||
    (proposal.targetKind === "event" && confirmation.startEpochMs === null)
  )
    throw new RangeError("extraction command needs confirmed fields");
  return {
    targetKind: proposal.targetKind,
    title: confirmation.title,
    body: confirmation.body,
    startEpochMs: confirmation.startEpochMs,
    timeZone: confirmation.timeZone,
    source: proposal.origin,
    proposalId: proposal.proposalId,
  };
}
