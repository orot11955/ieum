import { describe, expect, it } from "vitest";
import { sliceRawSpan } from "./snapshot.js";

describe("UTF-16 source span", () => {
  it("extracts the exact original emoji range", () => {
    expect(
      sliceRawSpan({
        captureId: "c1",
        revision: 1,
        rawBody: "A😀B",
        span: { start: 1, end: 3, encoding: "utf16" },
      }),
    ).toBe("😀");
  });

  it("rejects out-of-range offsets", () => {
    expect(() =>
      sliceRawSpan({
        captureId: "c1",
        revision: 1,
        rawBody: "A😀B",
        span: { start: 1, end: 5, encoding: "utf16" },
      }),
    ).toThrow(RangeError);
  });
});
