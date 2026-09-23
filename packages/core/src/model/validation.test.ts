import { describe, expect, it } from "vitest";
import {
  createDefaultUnitRevision,
  parseCaptureRevision,
  parseContextSnapshot,
  parseEvidenceRef,
  parseThoughtUnitRevision,
  parseUnitRevisionSet,
} from "./validation.js";

const recordedAt = 1_780_000_000_000;
const captureInput = {
  workspaceId: "w1",
  captureId: "c1",
  revision: 1,
  rawBody: "가😀e\u0301나",
  originKey: "capture:c1",
  recordedAt,
  occurredAt: recordedAt - 86_400_000,
};
const capture = parseCaptureRevision(captureInput);

function unitInput(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: "w1",
    unitId: "u1",
    revision: 1,
    captureId: "c1",
    captureRevision: 1,
    originKey: "capture:c1",
    sourceSpan: { start: 0, end: 3, encoding: "utf16" },
    content: { kind: "quote", text: "가😀" },
    recordedAt,
    ...overrides,
  };
}

describe("Capture and Unit revisions", () => {
  it("keeps the supplied source and times immutable, and creates one default Unit", () => {
    const sourceObject = { ...captureInput };
    const immutableCapture = parseCaptureRevision(sourceObject);
    const defaultUnit = createDefaultUnitRevision(capture, "default-unit");
    expect(defaultUnit.sourceSpan).toEqual({
      start: 0,
      end: capture.rawBody.length,
      encoding: "utf16",
    });
    expect(defaultUnit.content).toEqual({
      kind: "quote",
      text: "가😀e\u0301나",
    });
    expect(defaultUnit.originKey).toBe(capture.originKey);
    expect(capture.occurredAt).toBeLessThan(capture.recordedAt);
    expect(Object.isFrozen(capture)).toBe(true);
    expect(Object.isFrozen(defaultUnit.sourceSpan)).toBe(true);
    sourceObject.rawBody = "변경된 외부 객체";
    expect(immutableCapture.rawBody).toBe("가😀e\u0301나");
    const whitespace = parseCaptureRevision({ ...captureInput, rawBody: "  " });
    expect(createDefaultUnitRevision(whitespace, "spaces").content.text).toBe(
      "  ",
    );
    expect(() =>
      createDefaultUnitRevision(
        parseCaptureRevision({ ...captureInput, revision: 2 }),
        "not-initial",
      ),
    ).toThrow(/first Capture revision/);
  });

  it("accepts distinct manual spans over Hangul, emoji, and a combining character", () => {
    const units = parseUnitRevisionSet(
      [
        unitInput(),
        unitInput({
          unitId: "u2",
          sourceSpan: { start: 3, end: 6, encoding: "utf16" },
          content: { kind: "quote", text: "e\u0301나" },
        }),
      ],
      capture,
    );
    expect(units.map((unit) => unit.content.text)).toEqual([
      "가😀",
      "e\u0301나",
    ]);
    expect(Object.isFrozen(units)).toBe(true);
  });

  it("rejects bad spans, absent revisions, duplicate IDs, and non-finite numbers", () => {
    expect(() =>
      parseThoughtUnitRevision(
        unitInput({ sourceSpan: { start: 0, end: 7, encoding: "utf16" } }),
        capture,
      ),
    ).toThrow(RangeError);
    expect(() =>
      parseThoughtUnitRevision(
        unitInput({ sourceSpan: { start: 0, end: 2, encoding: "utf16" } }),
        capture,
      ),
    ).toThrow(/surrogate pair/);
    expect(() =>
      parseThoughtUnitRevision(unitInput({ captureRevision: 0 }), capture),
    ).toThrow(RangeError);
    expect(() =>
      parseThoughtUnitRevision(unitInput({ captureRevision: 2 }), capture),
    ).toThrow(RangeError);
    expect(() =>
      parseUnitRevisionSet([unitInput(), unitInput()], capture),
    ).toThrow(/Duplicate unit ID/);
    expect(() =>
      parseCaptureRevision({ ...captureInput, revision: Number.NaN }),
    ).toThrow(RangeError);
    expect(() =>
      parseCaptureRevision({ ...captureInput, recordedAt: Infinity }),
    ).toThrow(RangeError);
    expect(() =>
      parseThoughtUnitRevision(
        unitInput({
          sourceSpan: { start: 0, end: Infinity, encoding: "utf16" },
        }),
        capture,
      ),
    ).toThrow(RangeError);
  });

  it("labels rewritten content as paraphrase instead of a quote", () => {
    expect(() =>
      parseThoughtUnitRevision(
        unitInput({ content: { kind: "quote", text: "바꿔 쓴 문장" } }),
        capture,
      ),
    ).toThrow(/quote must equal/);
    expect(
      parseThoughtUnitRevision(
        unitInput({ content: { kind: "paraphrase", text: "바꿔 쓴 문장" } }),
        capture,
      ).content.kind,
    ).toBe("paraphrase");
  });
});

describe("Context and Evidence references", () => {
  const unit = parseThoughtUnitRevision(unitInput(), capture);
  const contextInput = {
    workspaceId: "w1",
    contextId: "context-1",
    identityRevision: 1,
    membershipRevision: 1,
    name: "연구",
    recordedAt,
    memberUnits: [{ unitId: "u1", revision: 1 }],
  };
  const evidenceInput = {
    workspaceId: "w1",
    sourceKind: "unit",
    unitId: "u1",
    unitRevision: 1,
    captureId: "c1",
    captureRevision: 1,
    originKey: "capture:c1",
    sourceSpan: { start: 1, end: 3, encoding: "utf16" },
    transform: "quote",
    text: "😀",
  };

  it("requires exact member revisions and separates identity from membership revision", () => {
    const context = parseContextSnapshot(contextInput, [unit]);
    expect(context.identityRevision).toBe(1);
    expect(context.membershipRevision).toBe(1);
    expect(Object.isFrozen(context.memberUnits)).toBe(true);
    expect(() =>
      parseContextSnapshot(
        { ...contextInput, memberUnits: [{ unitId: "u1", revision: 2 }] },
        [unit],
      ),
    ).toThrow(/no matching recorded Unit revision/);
    expect(() =>
      parseContextSnapshot(
        {
          ...contextInput,
          memberUnits: [
            contextInput.memberUnits[0],
            contextInput.memberUnits[0],
          ],
        },
        [unit],
      ),
    ).toThrow(/Duplicate unit ID/);
  });

  it("checks quotation bytes, source bounds, revision and origin before use", () => {
    expect(parseEvidenceRef(evidenceInput, unit, capture).text).toBe("😀");
    expect(() =>
      parseEvidenceRef({ ...evidenceInput, text: "고친 문장" }, unit, capture),
    ).toThrow(/quoted EvidenceRef/);
    expect(
      parseEvidenceRef(
        { ...evidenceInput, transform: "paraphrase", text: "고친 문장" },
        unit,
        capture,
      ).transform,
    ).toBe("paraphrase");
    expect(() =>
      parseEvidenceRef(
        {
          ...evidenceInput,
          sourceSpan: { start: 1, end: 4, encoding: "utf16" },
        },
        unit,
        capture,
      ),
    ).toThrow(/does not match/);
    expect(() =>
      parseEvidenceRef({ ...evidenceInput, unitRevision: 0 }, unit, capture),
    ).toThrow(RangeError);
    expect(() =>
      parseEvidenceRef(
        { ...evidenceInput, originKey: "capture:other" },
        unit,
        capture,
      ),
    ).toThrow(/does not match/);
    expect(() =>
      parseEvidenceRef(
        evidenceInput,
        { ...unit, content: { kind: "quote", text: "위조된 Unit 인용" } },
        capture,
      ),
    ).toThrow(/quote must equal/);
  });
});
