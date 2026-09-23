import { sliceRawSpan } from "../snapshot.js";
import type { Utf16Span } from "../snapshot.js";
import type {
  CaptureRevision,
  ContextSnapshot,
  EpochMillis,
  EvidenceRef,
  ThoughtUnitRevision,
  UnitContent,
  UnitRevisionRef,
} from "./types.js";

function object(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function nonEmptyRawText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must contain at least one UTF-16 code unit`);
  }
  return value;
}

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function epochMillis(value: unknown, name: string): EpochMillis {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Math.abs(value) > 8_640_000_000_000_000
  ) {
    throw new RangeError(`${name} must be a representable epoch millisecond`);
  }
  return value;
}

function span(value: unknown, rawBody: string): Utf16Span {
  const input = object(value, "sourceSpan");
  const result: Utf16Span = {
    start: input.start as number,
    end: input.end as number,
    encoding: input.encoding as "utf16",
  };
  sliceRawSpan({ captureId: "", revision: 1, rawBody, span: result });
  for (const offset of [result.start, result.end]) {
    if (offset > 0 && offset < rawBody.length) {
      const previous = rawBody.charCodeAt(offset - 1);
      const next = rawBody.charCodeAt(offset);
      if (
        previous >= 0xd800 &&
        previous <= 0xdbff &&
        next >= 0xdc00 &&
        next <= 0xdfff
      ) {
        throw new RangeError("Source span splits a UTF-16 surrogate pair");
      }
    }
  }
  return Object.freeze(result);
}

function content(value: unknown, rawSlice: string): UnitContent {
  const input = object(value, "content");
  if (input.kind !== "quote" && input.kind !== "paraphrase") {
    throw new TypeError("content.kind must be quote or paraphrase");
  }
  const text =
    input.kind === "quote"
      ? nonEmptyRawText(input.text, "content.text")
      : nonEmptyString(input.text, "content.text");
  if (input.kind === "quote" && text !== rawSlice) {
    throw new RangeError("A quote must equal its original source span");
  }
  return Object.freeze({ kind: input.kind, text });
}

export function parseCaptureRevision(value: unknown): CaptureRevision {
  const input = object(value, "CaptureRevision");
  const rawBody = nonEmptyRawText(input.rawBody, "rawBody");
  return Object.freeze({
    workspaceId: nonEmptyString(input.workspaceId, "workspaceId"),
    captureId: nonEmptyString(input.captureId, "captureId"),
    revision: positiveInteger(input.revision, "revision"),
    rawBody,
    originKey: nonEmptyString(input.originKey, "originKey"),
    recordedAt: epochMillis(input.recordedAt, "recordedAt"),
    occurredAt:
      input.occurredAt === null
        ? null
        : epochMillis(input.occurredAt, "occurredAt"),
  });
}

export function parseThoughtUnitRevision(
  value: unknown,
  capture: CaptureRevision,
): ThoughtUnitRevision {
  const input = object(value, "ThoughtUnitRevision");
  const sourceSpan = span(input.sourceSpan, capture.rawBody);
  const result = Object.freeze({
    workspaceId: nonEmptyString(input.workspaceId, "workspaceId"),
    unitId: nonEmptyString(input.unitId, "unitId"),
    revision: positiveInteger(input.revision, "revision"),
    captureId: nonEmptyString(input.captureId, "captureId"),
    captureRevision: positiveInteger(input.captureRevision, "captureRevision"),
    originKey: nonEmptyString(input.originKey, "originKey"),
    sourceSpan,
    content: content(
      input.content,
      capture.rawBody.slice(sourceSpan.start, sourceSpan.end),
    ),
    recordedAt: epochMillis(input.recordedAt, "recordedAt"),
  });
  if (
    result.workspaceId !== capture.workspaceId ||
    result.captureId !== capture.captureId ||
    result.captureRevision !== capture.revision ||
    result.originKey !== capture.originKey ||
    result.recordedAt < capture.recordedAt
  ) {
    throw new RangeError(
      "Unit revision does not match its source Capture revision",
    );
  }
  return result;
}

export function parseUnitRevisionSet(
  value: unknown,
  capture: CaptureRevision,
): readonly ThoughtUnitRevision[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("Unit revision set must be a non-empty array");
  }
  const units = value.map((item) => parseThoughtUnitRevision(item, capture));
  if (new Set(units.map((unit) => unit.unitId)).size !== units.length) {
    throw new RangeError("Duplicate unit ID in one Capture revision");
  }
  return Object.freeze(units);
}

export function createDefaultUnitRevision(
  capture: CaptureRevision,
  unitId: string,
): ThoughtUnitRevision {
  if (capture.revision !== 1) {
    throw new RangeError(
      "Default Unit creation requires the first Capture revision",
    );
  }
  return parseThoughtUnitRevision(
    {
      workspaceId: capture.workspaceId,
      unitId,
      revision: 1,
      captureId: capture.captureId,
      captureRevision: capture.revision,
      originKey: capture.originKey,
      sourceSpan: {
        start: 0,
        end: capture.rawBody.length,
        encoding: "utf16",
      },
      content: { kind: "quote", text: capture.rawBody },
      recordedAt: capture.recordedAt,
    },
    capture,
  );
}

export function parseContextSnapshot(
  value: unknown,
  units: readonly ThoughtUnitRevision[],
): ContextSnapshot {
  const input = object(value, "ContextSnapshot");
  if (!Array.isArray(input.memberUnits)) {
    throw new TypeError("memberUnits must be an array");
  }
  const memberUnits: UnitRevisionRef[] = input.memberUnits.map((item) => {
    const ref = object(item, "memberUnit");
    return Object.freeze({
      unitId: nonEmptyString(ref.unitId, "memberUnit.unitId"),
      revision: positiveInteger(ref.revision, "memberUnit.revision"),
    });
  });
  const result = Object.freeze({
    workspaceId: nonEmptyString(input.workspaceId, "workspaceId"),
    contextId: nonEmptyString(input.contextId, "contextId"),
    identityRevision: positiveInteger(
      input.identityRevision,
      "identityRevision",
    ),
    membershipRevision: positiveInteger(
      input.membershipRevision,
      "membershipRevision",
    ),
    name: nonEmptyString(input.name, "name"),
    recordedAt: epochMillis(input.recordedAt, "recordedAt"),
    memberUnits: Object.freeze(memberUnits),
  });
  if (
    new Set(memberUnits.map((ref) => ref.unitId)).size !== memberUnits.length
  ) {
    throw new RangeError("Duplicate unit ID in Context snapshot");
  }
  for (const ref of memberUnits) {
    if (
      !units.some(
        (unit) =>
          unit.workspaceId === result.workspaceId &&
          unit.unitId === ref.unitId &&
          unit.revision === ref.revision &&
          unit.recordedAt <= result.recordedAt,
      )
    ) {
      throw new RangeError(
        "Context member has no matching recorded Unit revision",
      );
    }
  }
  return result;
}

export function parseEvidenceRef(
  value: unknown,
  unit: ThoughtUnitRevision,
  capture: CaptureRevision,
): EvidenceRef {
  const validCapture = parseCaptureRevision(capture);
  const validUnit = parseThoughtUnitRevision(unit, validCapture);
  const input = object(value, "EvidenceRef");
  if (input.sourceKind !== "unit") {
    throw new TypeError("Evidence sourceKind must be unit");
  }
  const sourceSpan = span(input.sourceSpan, validCapture.rawBody);
  if (input.transform !== "quote" && input.transform !== "paraphrase") {
    throw new TypeError("Evidence transform must be quote or paraphrase");
  }
  const text =
    input.transform === "quote"
      ? nonEmptyRawText(input.text, "evidence.text")
      : nonEmptyString(input.text, "evidence.text");
  const result = Object.freeze({
    workspaceId: nonEmptyString(input.workspaceId, "workspaceId"),
    sourceKind: "unit" as const,
    unitId: nonEmptyString(input.unitId, "unitId"),
    unitRevision: positiveInteger(input.unitRevision, "unitRevision"),
    captureId: nonEmptyString(input.captureId, "captureId"),
    captureRevision: positiveInteger(input.captureRevision, "captureRevision"),
    originKey: nonEmptyString(input.originKey, "originKey"),
    sourceSpan,
    transform: input.transform,
    text,
  });
  if (
    result.workspaceId !== validCapture.workspaceId ||
    result.workspaceId !== validUnit.workspaceId ||
    result.unitId !== validUnit.unitId ||
    result.unitRevision !== validUnit.revision ||
    result.captureId !== validCapture.captureId ||
    result.captureId !== validUnit.captureId ||
    result.captureRevision !== validCapture.revision ||
    result.captureRevision !== validUnit.captureRevision ||
    result.originKey !== validCapture.originKey ||
    result.originKey !== validUnit.originKey ||
    sourceSpan.start < validUnit.sourceSpan.start ||
    sourceSpan.end > validUnit.sourceSpan.end
  ) {
    throw new RangeError(
      "Evidence does not match its Unit and Capture revisions",
    );
  }
  if (
    result.transform === "quote" &&
    result.text !== validCapture.rawBody.slice(sourceSpan.start, sourceSpan.end)
  ) {
    throw new RangeError(
      "A quoted EvidenceRef must equal its original source span",
    );
  }
  return result;
}
