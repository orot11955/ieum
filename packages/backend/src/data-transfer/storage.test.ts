import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalTransferStorage } from "./storage.js";

describe("BE-21 private transfer staging retention", () => {
  it("removes expired bundle bytes and preserves current bundles", async () => {
    const root = await mkdtemp(join(tmpdir(), "ieum-transfer-storage-"));
    try {
      const storage = await LocalTransferStorage.create(root);
      const expired = randomUUID();
      const current = randomUUID();
      await storage.write(expired, Buffer.from("old private text"));
      await storage.write(current, Buffer.from("current private text"));
      const oldTime = new Date(Date.now() - 26 * 60 * 60 * 1000);
      await utimes(join(root, expired), oldTime, oldTime);
      expect(await storage.pruneExpired()).toBe(1);
      await expect(storage.read(expired)).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(await storage.read(current)).toEqual(
        Buffer.from("current private text"),
      );
      expect((await stat(join(root, current))).mode & 0o777).toBe(0o600);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
