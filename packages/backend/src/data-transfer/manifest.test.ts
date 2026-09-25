import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { packTransferArchive, unpackTransferArchive } from "./archive.js";
import { createCaptureBundle, readCaptureBundle } from "./manifest.js";

describe("BE-21 portable capture manifest", () => {
  const workspaceId = randomUUID();
  const captureId = randomUUID();
  const record = {
    id: captureId,
    revision: 3,
    title: "원문",
    rawBody: "첫 줄\n둘째 줄",
  };

  it("round trips source identity, revision, Markdown and verified hashes", () => {
    const result = readCaptureBundle(
      createCaptureBundle(workspaceId, [record]),
    );
    expect(result.manifest.sourceWorkspaceId).toBe(workspaceId);
    expect(result.captures).toMatchObject([record]);
  });

  it("rejects unsupported schema versions and unlisted files", () => {
    const bundle = createCaptureBundle(workspaceId, [record]);
    const files = unpackTransferArchive(bundle);
    const manifest = JSON.parse(files.get("manifest.json")!.toString("utf8"));
    manifest.version = 2;
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          {
            path: "manifest.json",
            bytes: Buffer.from(JSON.stringify(manifest)),
          },
          ...[...files]
            .filter(([path]) => path !== "manifest.json")
            .map(([path, bytes]) => ({ path, bytes })),
        ]),
      ),
    ).toThrow("UNSUPPORTED_SCHEMA");
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          ...[...files].map(([path, bytes]) => ({ path, bytes })),
          { path: "extra.md", bytes: Buffer.from("private") },
        ]),
      ),
    ).toThrow("INVALID_BUNDLE");
  });

  it("rejects missing or altered content and duplicate IDs", () => {
    const files = unpackTransferArchive(
      createCaptureBundle(workspaceId, [record]),
    );
    const manifest = JSON.parse(files.get("manifest.json")!.toString("utf8"));
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          { path: "manifest.json", bytes: files.get("manifest.json")! },
          { path: `captures/${captureId}.md`, bytes: Buffer.from("altered") },
        ]),
      ),
    ).toThrow("INVALID_BUNDLE");
    manifest.captures.push(manifest.captures[0]);
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          {
            path: "manifest.json",
            bytes: Buffer.from(JSON.stringify(manifest)),
          },
          {
            path: `captures/${captureId}.md`,
            bytes: files.get(`captures/${captureId}.md`)!,
          },
        ]),
      ),
    ).toThrow("INVALID_BUNDLE");
  });

  it("rejects bodies that the Capture command cannot store during validation", () => {
    for (const rawBody of [" ", "a\u0000b"]) {
      const bundle = createCaptureBundle(workspaceId, [{ ...record, rawBody }]);
      expect(() => readCaptureBundle(bundle)).toThrow("INVALID_BUNDLE");
    }
  });
});
