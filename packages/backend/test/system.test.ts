import { describe, expect, it } from "vitest";
import { GetLiveness } from "../src/system.js";

describe("GetLiveness", () => {
  it("runs without an HTTP or Nest context", () => {
    expect(new GetLiveness().execute()).toEqual({ status: "ok" });
  });
});
