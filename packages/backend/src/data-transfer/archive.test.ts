import { gzipSync, gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  MAX_ARCHIVE_BYTES,
  MAX_UNPACKED_BYTES,
  packTransferArchive,
  transferHash,
  unpackTransferArchive,
} from "./archive.js";

describe("BE-21 bounded portable archive", () => {
  it("round trips manifest, Markdown and asset bytes without changing their digest", () => {
    const files = [
      { path: "manifest.json", bytes: Buffer.from('{"version":1}') },
      { path: "content/a.md", bytes: Buffer.from("# 안녕\n본문", "utf8") },
      { path: "assets/a.png", bytes: Buffer.from([0, 1, 2, 3]) },
    ];
    const unpacked = unpackTransferArchive(packTransferArchive(files));
    expect([...unpacked.keys()]).toEqual(files.map((file) => file.path));
    for (const file of files)
      expect(transferHash(unpacked.get(file.path)!)).toBe(
        transferHash(file.bytes),
      );
  });

  it("rejects traversal, absolute paths and duplicate names before packing", () => {
    for (const path of ["../secret", "a/../secret", "/secret", "a\\secret"])
      expect(() =>
        packTransferArchive([{ path, bytes: Buffer.from("x") }]),
      ).toThrow("INVALID_ARCHIVE");
    expect(() =>
      packTransferArchive([
        { path: "a.md", bytes: Buffer.from("x") },
        { path: "a.md", bytes: Buffer.from("y") },
      ]),
    ).toThrow("INVALID_ARCHIVE");
  });

  it("rejects an uploaded symlink and a malformed header", () => {
    const packed = packTransferArchive([
      { path: "manifest.json", bytes: Buffer.from("{}") },
    ]);
    const tar = gunzipSync(packed);
    tar.write("2", 156, "ascii");
    expect(() => unpackTransferArchive(gzipSync(tar))).toThrow(
      "INVALID_ARCHIVE",
    );
    expect(() => unpackTransferArchive(Buffer.from("not gzip"))).toThrow(
      "INVALID_ARCHIVE",
    );
  });

  it("rejects traversal in an uploaded archive with a valid header checksum", () => {
    const tar = gunzipSync(
      packTransferArchive([
        { path: "manifest.json", bytes: Buffer.from("{}") },
      ]),
    );
    tar.fill(0, 0, 100);
    tar.write("../secret", 0, "ascii");
    tar.fill(0x20, 148, 156);
    let checksum = 0;
    for (const byte of tar.subarray(0, 512)) checksum += byte;
    tar.write(`${checksum.toString(8).padStart(6, "0")}\0`, 148, "ascii");
    expect(() => unpackTransferArchive(gzipSync(tar))).toThrow(
      "INVALID_ARCHIVE",
    );
  });

  it("rejects compressed and expanded bundles over their limits", () => {
    expect(() =>
      unpackTransferArchive(Buffer.alloc(MAX_ARCHIVE_BYTES + 1)),
    ).toThrow("ARCHIVE_TOO_LARGE");
    const bomb = gzipSync(Buffer.alloc(MAX_UNPACKED_BYTES + 1));
    expect(() => unpackTransferArchive(bomb)).toThrow("ARCHIVE_TOO_LARGE");
  });
});
