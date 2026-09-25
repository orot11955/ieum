import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface AssetStoragePort {
  putPrivate(bytes: Buffer): Promise<string>;
  putDerivative(bytes: Buffer): Promise<string>;
  readPrivate(key: string): Promise<Buffer>;
  readDerivative(key: string): Promise<Buffer>;
  removePrivate(key: string): Promise<void>;
  removeDerivative(key: string): Promise<void>;
}
export class LocalAssetStorage implements AssetStoragePort {
  private constructor(
    private readonly privateRoot: string,
    private readonly derivativeRoot: string,
  ) {}
  static async create(
    privateRoot: string,
    derivativeRoot: string,
  ): Promise<LocalAssetStorage> {
    if (!isAbsolute(privateRoot) || !isAbsolute(derivativeRoot))
      throw new Error("Asset roots must be absolute");
    await mkdir(privateRoot, { recursive: true, mode: 0o700 });
    await mkdir(derivativeRoot, { recursive: true, mode: 0o700 });
    const a = await realpath(privateRoot),
      b = await realpath(derivativeRoot);
    if (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`))
      throw new Error("Asset roots must be disjoint");
    return new LocalAssetStorage(a, b);
  }
  private path(root: string, key: string) {
    if (!UUID.test(key)) throw new Error("INVALID_STORAGE_KEY");
    return resolve(join(root, key));
  }
  private async put(root: string, bytes: Buffer) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const key = randomUUID(),
        path = this.path(root, key);
      let file;
      try {
        file = await open(
          path,
          constants.O_CREAT |
            constants.O_EXCL |
            constants.O_WRONLY |
            constants.O_NOFOLLOW,
          0o600,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
        throw error;
      }
      try {
        await file.writeFile(bytes);
        await file.sync();
      } catch (error) {
        await file.close();
        await unlink(path).catch(() => {});
        throw error;
      }
      await file.close();
      return key;
    }
    throw new Error("Asset key allocation failed");
  }
  putPrivate(bytes: Buffer) {
    return this.put(this.privateRoot, bytes);
  }
  putDerivative(bytes: Buffer) {
    return this.put(this.derivativeRoot, bytes);
  }
  readPrivate(key: string) {
    return readFile(this.path(this.privateRoot, key));
  }
  readDerivative(key: string) {
    return readFile(this.path(this.derivativeRoot, key));
  }
  async removePrivate(key: string) {
    await unlink(this.path(this.privateRoot, key)).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
  }
  async removeDerivative(key: string) {
    await unlink(this.path(this.derivativeRoot, key)).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
  }
}
