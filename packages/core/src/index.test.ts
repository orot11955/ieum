import { describe, expect, it } from "vitest";

describe("@ieum/core package export", () => {
  it("resolves the built Node entry through its package export", async () => {
    const exported = await import("@ieum/core");
    expect(exported.CORE_PACKAGE_ID).toBe("@ieum/core");
  });
});
