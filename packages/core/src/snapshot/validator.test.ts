import { describe, expect, it } from "vitest";
import { validateSnapshot } from "./validator.js";

const hash = "a".repeat(64);
const at = 1_000;

function capture(
  captureId: string,
  rawBody: string,
  originKey: string,
  recordedAt: number,
  revision = 1,
  occurredAt = recordedAt,
) {
  return {
    workspaceId: "w1",
    captureId,
    revision,
    rawBody,
    originKey,
    recordedAt,
    occurredAt,
  };
}

function unit(
  unitId: string,
  source: ReturnType<typeof capture>,
  revision = 1,
) {
  return {
    workspaceId: "w1",
    unitId,
    revision,
    captureId: source.captureId,
    captureRevision: source.revision,
    originKey: source.originKey,
    sourceSpan: { start: 0, end: source.rawBody.length, encoding: "utf16" },
    content: { kind: "quote", text: source.rawBody },
    recordedAt: source.recordedAt,
  };
}

function fixture() {
  const query = capture("query", "질문", "origin:query", 800);
  const sameOrigin = capture("derived", "질문의 파생", "origin:query", 850);
  const a1 = capture("a", "과거 A", "origin:a", 900, 1, 100);
  const a2 = capture("a", "미래 A", "origin:a", 1_200, 2, 100);
  const b = capture("b", "삭제 B", "origin:b", 900);
  const c = capture("c", "남은 C", "origin:c", 900);
  const late = capture("late", "뒤늦은 옛 사건", "origin:late", 1_200, 1, 100);
  const qUnit = unit("uq", query);
  const aUnit = unit("ua", a1);
  const cUnit = unit("uc", c);
  return {
    workspaceId: "w1",
    asOfRecordedAt: at,
    query: { unitId: "uq", revision: 1 },
    captures: [query, sameOrigin, a1, a2, b, c, late],
    units: [
      qUnit,
      unit("usame", sameOrigin),
      aUnit,
      unit("ua", a2, 2),
      unit("ub", b),
      cUnit,
      unit("ulate", late),
    ],
    contexts: [
      {
        workspaceId: "w1",
        contextId: "ctx",
        identityRevision: 1,
        membershipRevision: 1,
        name: "과거 맥락",
        recordedAt: 950,
        memberUnits: [
          { unitId: "ua", revision: 1 },
          { unitId: "ub", revision: 1 },
          { unitId: "uc", revision: 1 },
          { unitId: "uq", revision: 1 },
        ],
      },
      {
        workspaceId: "w1",
        contextId: "ctx",
        identityRevision: 1,
        membershipRevision: 2,
        name: "과거 맥락",
        recordedAt: 1_200,
        memberUnits: [{ unitId: "ua", revision: 2 }],
      },
    ],
    relations: [
      {
        workspaceId: "w1",
        relationId: "eligible",
        revision: 1,
        from: { unitId: "ua", revision: 1 },
        to: { unitId: "uc", revision: 1 },
        state: "active",
        recordedAt: 950,
      },
      {
        workspaceId: "w1",
        relationId: "eligible",
        revision: 2,
        from: { unitId: "ua", revision: 2 },
        to: { unitId: "uc", revision: 1 },
        state: "deleted",
        recordedAt: 1_200,
      },
      {
        workspaceId: "w1",
        relationId: "stale-endpoint",
        revision: 1,
        from: { unitId: "ua", revision: 1 },
        to: { unitId: "ub", revision: 1 },
        state: "active",
        recordedAt: 950,
      },
    ],
    visibility: [
      {
        workspaceId: "w1",
        kind: "unit",
        resourceId: "ub",
        revision: 1,
        state: "deleted",
        recordedAt: 960,
      },
      {
        workspaceId: "w1",
        kind: "capture",
        resourceId: "c",
        revision: 1,
        state: "deleted",
        recordedAt: 1_200,
      },
    ],
    profileWatermarks: [
      { workspaceId: "w1", revision: 1, value: "profile-old", recordedAt: 950 },
      {
        workspaceId: "w1",
        revision: 2,
        value: "profile-new",
        recordedAt: 1_200,
      },
    ],
  };
}

describe("recorded-time snapshot selection", () => {
  it("keeps exact old revisions and excludes future, deleted, query, and same-origin evidence", () => {
    const snapshot = validateSnapshot(fixture(), hash);
    expect(snapshot.units.map((item) => [item.unitId, item.revision])).toEqual([
      ["ua", 1],
      ["uc", 1],
    ]);
    expect(
      snapshot.captures.map((item) => [item.captureId, item.revision]),
    ).toEqual([
      ["a", 1],
      ["c", 1],
      ["query", 1],
    ]);
    expect(snapshot.contexts[0]?.memberUnits).toEqual([
      { unitId: "ua", revision: 1 },
      { unitId: "uc", revision: 1 },
    ]);
    expect(snapshot.relations.map((item) => item.relationId)).toEqual([
      "eligible",
    ]);
    expect(snapshot.manifest.profileWatermark).toEqual({
      revision: 1,
      value: "profile-old",
    });
    expect(snapshot.manifest.exclusions).toEqual(
      expect.arrayContaining([
        { kind: "unit", id: "usame", revision: 1, reason: "same_origin" },
        { kind: "unit", id: "ub", revision: 1, reason: "deleted" },
        { kind: "unit", id: "ulate", revision: 1, reason: "future_revision" },
        {
          kind: "relation",
          id: "stale-endpoint",
          revision: 1,
          reason: "endpoint_ineligible",
        },
      ]),
    );
    expect(snapshot.manifest.sortRule).toBe("id-then-revision-v1");
  });

  it("produces the same canonical manifest after input order changes", () => {
    const source = fixture();
    const shuffled = {
      ...source,
      captures: [...source.captures].reverse(),
      units: [...source.units].reverse(),
      contexts: source.contexts
        .map((context) => ({
          ...context,
          memberUnits: [...context.memberUnits].reverse(),
        }))
        .reverse(),
      relations: [...source.relations].reverse(),
      visibility: [...source.visibility].reverse(),
      profileWatermarks: [...source.profileWatermarks].reverse(),
    };
    expect(validateSnapshot(shuffled, hash).manifest).toEqual(
      validateSnapshot(source, hash).manifest,
    );
  });

  it("keeps identity membership when a Unit gains a newer revision", () => {
    const source = fixture();
    const snapshot = validateSnapshot(
      {
        ...source,
        asOfRecordedAt: 1_300,
        contexts: source.contexts.slice(0, 1),
      },
      hash,
    );
    expect(snapshot.contexts[0]?.memberUnits).toEqual([
      { unitId: "ua", revision: 2 },
    ]);
    expect(snapshot.contexts[0]?.membershipRevision).toBe(1);
    expect(snapshot.contexts[0]?.recordedAt).toBe(1_300);
    expect(snapshot.relations).toEqual([]);
  });

  it("includes revisions recorded exactly at asOfRecordedAt", () => {
    const source = fixture();
    const snapshot = validateSnapshot(
      { ...source, asOfRecordedAt: 1_200 },
      hash,
    );
    expect(snapshot.units.map((item) => item.unitId)).toContain("ulate");
    expect(snapshot.manifest.profileWatermark).toEqual({
      revision: 2,
      value: "profile-new",
    });
  });

  it("fails closed for another workspace and unavailable query revisions", () => {
    const source = fixture();
    expect(() =>
      validateSnapshot(
        {
          ...source,
          captures: [
            ...source.captures,
            { ...source.captures[0], workspaceId: "w2" },
          ],
        },
        hash,
      ),
    ).toThrow(/another workspace/);
    expect(() =>
      validateSnapshot(
        { ...source, query: { unitId: "ua", revision: 2 } },
        hash,
      ),
    ).toThrow(/unavailable/);
    expect(() =>
      validateSnapshot(
        {
          ...source,
          visibility: [
            ...source.visibility,
            {
              workspaceId: "w1",
              kind: "unit",
              resourceId: "uq",
              revision: 1,
              state: "deleted",
              recordedAt: 950,
            },
          ],
        },
        hash,
      ),
    ).toThrow(/unavailable/);
  });

  it("rejects duplicate, reordered, and invalid history before selection", () => {
    const source = fixture();
    expect(() =>
      validateSnapshot(
        { ...source, captures: [...source.captures, source.captures[0]] },
        hash,
      ),
    ).toThrow(/duplicate or reordered/);
    expect(() =>
      validateSnapshot({ ...source, asOfRecordedAt: Infinity }, hash),
    ).toThrow(RangeError);
    expect(() =>
      validateSnapshot({ ...source, profileWatermarks: [] }, "bad-hash"),
    ).toThrow(/inputHash/);
    expect(() =>
      validateSnapshot(
        {
          ...source,
          captures: source.captures.map((item) =>
            item.captureId === "a" && item.revision === 2
              ? { ...item, originKey: "origin:changed" }
              : item,
          ),
          units: source.units.map((item) =>
            item.unitId === "ua" && item.revision === 2
              ? { ...item, originKey: "origin:changed" }
              : item,
          ),
        },
        hash,
      ),
    ).toThrow(/Capture origin changed/);
    expect(() =>
      validateSnapshot(
        {
          ...source,
          units: source.units.map((item) =>
            item.unitId === "ua" && item.revision === 2
              ? {
                  ...item,
                  captureId: "c",
                  captureRevision: 1,
                  originKey: "origin:c",
                  content: { kind: "quote", text: "남은 C" },
                  sourceSpan: { start: 0, end: 4, encoding: "utf16" },
                  recordedAt: 1_200,
                }
              : item,
          ),
        },
        hash,
      ),
    ).toThrow(/Unit source changed/);
    expect(() =>
      validateSnapshot(
        {
          ...source,
          relations: source.relations.map((item) =>
            item.relationId === "eligible" && item.revision === 2
              ? { ...item, to: { unitId: "ub", revision: 1 } }
              : item,
          ),
        },
        hash,
      ),
    ).toThrow(/Relation endpoints changed/);
  });
});
