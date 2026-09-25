import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { renderMarkdown } from "../src/publishing/manifest.js";

describe("BE-19 public renderer allowlist", () => {
  it("escapes raw HTML and Markdown links and excludes private source identifiers", () => {
    const privateId = randomUUID();
    const body = renderMarkdown({
      schemaVersion: 1,
      content: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { blockId: randomUUID(), level: 2 },
            content: [
              { type: "text", text: "Public <script>alert(1)</script>" },
            ],
          },
          {
            type: "paragraph",
            attrs: { blockId: randomUUID() },
            content: [
              { type: "text", text: "[link](javascript:alert(1)) & private" },
              { type: "hardBreak" },
              {
                type: "sourceReference",
                attrs: {
                  label: "출처",
                  ref: {
                    sourceKind: "unit",
                    sourceId: privateId,
                    sourceRevision: 1,
                    originKey: "private-origin",
                    sourceHash: "private-hash",
                  },
                },
              },
            ],
          },
        ],
      },
    });
    expect(body).toContain("&lt;script&gt;");
    expect(body).toContain("\\[link\\]\\(javascript:alert\\(1\\)\\)");
    expect(body).not.toContain("<script>");
    expect(body).not.toContain(privateId);
    expect(body).not.toContain("private-origin");
    expect(body).not.toContain("private-hash");
    expect(body).toContain("출처");
  });
});
