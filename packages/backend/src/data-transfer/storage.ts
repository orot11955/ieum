import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  opendir,
  readFile,
  realpath,
  unlink,
} from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TransferStoragePort {
  write(key: string, bytes: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export class LocalTransferStorage implements TransferStoragePort {
  private constructor(private readonly root: string) {}

  static async create(root: string): Promise<LocalTransferStorage> {
    if (!isAbsolute(root)) throw new Error("Transfer root must be absolute");
    await mkdir(root, { recursive: true, mode: 0o700 });
    return new LocalTransferStorage(await realpath(root));
  }

  private path(key: string): string {
    if (!UUID.test(key)) throw new Error("INVALID_TRANSFER_KEY");
    return resolve(join(this.root, key));
  }

  async write(key: string, bytes: Buffer): Promise<void> {
    const file = await open(
      this.path(key),
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(bytes);
      await file.sync();
    } catch (error) {
      await file.close();
      await this.remove(key);
      throw error;
    }
    await file.close();
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async remove(key: string): Promise<void> {
    await unlink(this.path(key)).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
  }

  async pruneExpired(now = Date.now()): Promise<number> {
    let removed = 0;
    for await (const entry of await opendir(this.root)) {
      if (!UUID.test(entry.name)) continue;
      const path = this.path(entry.name);
      try {
        const info = await lstat(path);
        if (info.mtimeMs > now - 25 * 60 * 60 * 1000) continue;
        if (!info.isFile() && !info.isSymbolicLink()) continue;
        await unlink(path);
        removed++;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return removed;
  }
}
