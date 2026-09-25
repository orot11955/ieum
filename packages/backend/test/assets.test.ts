import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  validateAssetBytes,
  validateAssetMetadata,
  AssetValidationError,
} from "../src/assets/validation.js";

describe("BE-18 private asset validation", () => {
  it("rejects traversal names and active or mismatched content", async () => {
    expect(() =>
      validateAssetMetadata({
        fileName: "../note.txt",
        declaredMime: "text/plain",
        expectedSize: 4,
      }),
    ).toThrow(AssetValidationError);
    expect(() =>
      validateAssetMetadata({
        fileName: "nested/note.txt",
        declaredMime: "text/plain",
        expectedSize: 4,
      }),
    ).toThrow(AssetValidationError);
    const svg = Buffer.from("<svg onload=alert(1)></svg>");
    await expect(
      validateAssetBytes(
        {
          fileName: "image.png",
          declaredMime: "image/png",
          expectedSize: svg.length,
        },
        svg,
      ),
    ).rejects.toMatchObject({ code: "MIME_MISMATCH" });
    const html = Buffer.from("<script>alert(1)</script>");
    await expect(
      validateAssetBytes(
        {
          fileName: "note.md",
          declaredMime: "text/markdown",
          expectedSize: html.length,
        },
        html,
      ),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID" });
  });

  it("limits decoded image pixels and strips image metadata in derivative", async () => {
    const oversized = await sharp({
      create: { width: 5000, height: 5000, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(
      validateAssetBytes(
        {
          fileName: "huge.png",
          declaredMime: "image/png",
          expectedSize: oversized.length,
        },
        oversized,
      ),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID" });
    const original = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "red" },
    })
      .withExif({ IFD0: { Copyright: "private marker" } })
      .jpeg()
      .toBuffer();
    const result = await validateAssetBytes(
      {
        fileName: "photo.jpg",
        declaredMime: "image/jpeg",
        expectedSize: original.length,
      },
      original,
    );
    expect(result.derivativeMime).toBe("image/png");
    const metadata = await sharp(result.derivative).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(result.derivative.includes(Buffer.from("private marker"))).toBe(
      false,
    );
  });
});
