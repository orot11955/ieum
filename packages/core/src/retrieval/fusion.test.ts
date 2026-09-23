import { describe, expect, it } from "vitest";
import type { ValidatedSnapshot } from "../snapshot/types.js";
import { fuseRankings, rerankFusionWithAuxiliary } from "./fusion.js";

function snapshot(ids: readonly string[]): ValidatedSnapshot {
  return {
    contexts: ids.map((contextId) => ({ contextId })),
    manifest: { inputHash: "a".repeat(64) },
  } as unknown as ValidatedSnapshot;
}

describe("rank fusion", () => {
  it("uses lexical and semantic ranks without treating RRF as absolute confidence", () => {
    const lexical = [
      { contextId: "a", rank: 1 },
      { contextId: "b", rank: 2 },
    ];
    const three = fuseRankings(snapshot(["a", "b", "c"]), lexical, {
      status: "ok",
      hits: [
        { contextId: "b", rank: 1 },
        { contextId: "a", rank: 2 },
        { contextId: "c", rank: 3 },
      ],
    });
    const four = fuseRankings(snapshot(["a", "b", "c", "d"]), lexical, {
      status: "ok",
      hits: [
        { contextId: "b", rank: 1 },
        { contextId: "a", rank: 2 },
        { contextId: "c", rank: 3 },
        { contextId: "d", rank: 4 },
      ],
    });
    expect(three.profileId).toBe("hybrid-v0");
    expect(three.hits.map((hit) => hit.contextId)).toEqual(["a", "b", "c"]);
    expect(four.hits.find((hit) => hit.contextId === "a")?.rrfScore).toBe(
      three.hits.find((hit) => hit.contextId === "a")?.rrfScore,
    );
    expect(three.hits[0]?.rrfScore).toBeLessThan(0.04);
  });

  it("uses one lexical-degraded profile for total semantic failure and rejects partial or foreign sources", () => {
    const input = snapshot(["a", "b"]);
    const lexical = [
      { contextId: "a", rank: 1 },
      { contextId: "b", rank: 2 },
    ];
    const degraded = fuseRankings(input, lexical, {
      status: "error",
      code: "PROVIDER_UNAVAILABLE",
    });
    expect(degraded.profileId).toBe("lexical-degraded-v0");
    expect(degraded.semanticFailureCode).toBe("PROVIDER_UNAVAILABLE");
    expect(degraded.hits.map((hit) => hit.contextId)).toEqual(["a", "b"]);
    expect(() =>
      fuseRankings(input, lexical, {
        status: "ok",
        hits: [{ contextId: "a", rank: 1 }],
      }),
    ).toThrow(/every eligible context/);
    expect(() =>
      fuseRankings(input, lexical, {
        status: "ok",
        hits: [
          { contextId: "a", rank: 1 },
          { contextId: "outside", rank: 2 },
        ],
      }),
    ).toThrow(/ineligible/);
  });

  it("compares B2 with capped graph/session rank ablation without assigning confidence", () => {
    const input = snapshot(["a", "b"]);
    const b2 = fuseRankings(
      input,
      [
        { contextId: "a", rank: 1 },
        { contextId: "b", rank: 2 },
      ],
      {
        status: "ok",
        hits: [
          { contextId: "b", rank: 1 },
          { contextId: "a", rank: 2 },
        ],
      },
    );
    const b3 = rerankFusionWithAuxiliary(b2, [
      { contextId: "a", graph: 0, session: 0 },
      { contextId: "b", graph: 1, session: 1 },
    ]);
    expect(b2.hits[0]?.contextId).toBe("a");
    expect(b3.hits[0]?.contextId).toBe("b");
    expect(b3.hits[0]?.auxiliaryBoost).toBe(0.08);
    expect("matchProbability" in b3.hits[0]!).toBe(false);
    expect(() =>
      rerankFusionWithAuxiliary(b2, [
        { contextId: "a", graph: 1, session: null },
      ]),
    ).toThrow(/cover fused contexts/);
  });

  it("keeps two contexts eligible when they share one member unit", () => {
    const input = {
      ...snapshot(["left", "right"]),
      contexts: [
        { contextId: "left", memberUnits: [{ unitId: "shared", revision: 1 }] },
        {
          contextId: "right",
          memberUnits: [{ unitId: "shared", revision: 1 }],
        },
      ],
    } as unknown as ValidatedSnapshot;
    const result = fuseRankings(
      input,
      [
        { contextId: "left", rank: 1 },
        { contextId: "right", rank: 2 },
      ],
      {
        status: "ok",
        hits: [
          { contextId: "right", rank: 1 },
          { contextId: "left", rank: 2 },
        ],
      },
    );
    expect(result.hits.map((hit) => hit.contextId)).toEqual(["left", "right"]);
  });
});
