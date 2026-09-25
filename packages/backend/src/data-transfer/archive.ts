import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

const BLOCK = 512;
export const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
export const MAX_UNPACKED_BYTES = 64 * 1024 * 1024;
export const MAX_ARCHIVE_FILES = 256;

export class TransferArchiveError extends Error {
  constructor(public readonly code: "INVALID_ARCHIVE" | "ARCHIVE_TOO_LARGE") {
    super(code);
  }
}

export interface TransferFile {
  path: string;
  bytes: Buffer;
}

export function transferHash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function validPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 100 &&
    /^[\x21-\x7e]+$/.test(path) &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    path
      .split("/")
      .every((part) => part !== "" && part !== "." && part !== "..")
  );
}

function octal(value: number, width: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TransferArchiveError("INVALID_ARCHIVE");
  }
  const digits = value.toString(8);
  if (digits.length > width - 1)
    throw new TransferArchiveError("ARCHIVE_TOO_LARGE");
  return Buffer.from(`${digits.padStart(width - 1, "0")}\0`, "ascii");
}

function header(path: string, length: number): Buffer {
  const value = Buffer.alloc(BLOCK);
  value.write(path, 0, 100, "ascii");
  octal(0o600, 8).copy(value, 100);
  octal(0, 8).copy(value, 108);
  octal(0, 8).copy(value, 116);
  octal(length, 12).copy(value, 124);
  octal(0, 12).copy(value, 136);
  value.fill(0x20, 148, 156);
  value.write("0", 156, "ascii");
  value.write("ustar\0", 257, "ascii");
  value.write("00", 263, "ascii");
  let sum = 0;
  for (const byte of value) sum += byte;
  octal(sum, 8).copy(value, 148);
  return value;
}

export function packTransferArchive(files: TransferFile[]): Buffer {
  if (files.length < 1 || files.length > MAX_ARCHIVE_FILES)
    throw new TransferArchiveError("ARCHIVE_TOO_LARGE");
  const paths = new Set<string>();
  let total = BLOCK * 2;
  const parts: Buffer[] = [];
  for (const file of files) {
    if (
      !validPath(file.path) ||
      paths.has(file.path) ||
      !Buffer.isBuffer(file.bytes)
    )
      throw new TransferArchiveError("INVALID_ARCHIVE");
    paths.add(file.path);
    total += BLOCK + Math.ceil(file.bytes.length / BLOCK) * BLOCK;
    if (total > MAX_UNPACKED_BYTES)
      throw new TransferArchiveError("ARCHIVE_TOO_LARGE");
    parts.push(header(file.path, file.bytes.length), file.bytes);
    const padding = (BLOCK - (file.bytes.length % BLOCK)) % BLOCK;
    if (padding) parts.push(Buffer.alloc(padding));
  }
  parts.push(Buffer.alloc(BLOCK * 2));
  const packed = gzipSync(Buffer.concat(parts, total), { level: 6 });
  if (packed.length > MAX_ARCHIVE_BYTES)
    throw new TransferArchiveError("ARCHIVE_TOO_LARGE");
  return packed;
}

function readOctal(bytes: Buffer): number {
  const raw = bytes.toString("ascii").replace(/\0.*$/s, "").trim();
  if (!/^[0-7]+$/.test(raw)) throw new TransferArchiveError("INVALID_ARCHIVE");
  const value = Number.parseInt(raw, 8);
  if (!Number.isSafeInteger(value))
    throw new TransferArchiveError("INVALID_ARCHIVE");
  return value;
}

export function unpackTransferArchive(packed: Buffer): Map<string, Buffer> {
  if (!Buffer.isBuffer(packed) || packed.length > MAX_ARCHIVE_BYTES)
    throw new TransferArchiveError("ARCHIVE_TOO_LARGE");
  let body: Buffer;
  try {
    body = gunzipSync(packed, { maxOutputLength: MAX_UNPACKED_BYTES });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ERR_BUFFER_TOO_LARGE"
    )
      throw new TransferArchiveError("ARCHIVE_TOO_LARGE");
    throw new TransferArchiveError("INVALID_ARCHIVE");
  }
  if (body.length % BLOCK !== 0 || body.length < BLOCK * 3)
    throw new TransferArchiveError("INVALID_ARCHIVE");
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset + BLOCK <= body.length) {
    const block = body.subarray(offset, offset + BLOCK);
    if (block.every((byte) => byte === 0)) {
      if (body.subarray(offset).some((byte) => byte !== 0))
        throw new TransferArchiveError("INVALID_ARCHIVE");
      if (body.length - offset < BLOCK * 2 || files.size === 0)
        throw new TransferArchiveError("INVALID_ARCHIVE");
      return files;
    }
    const stored = readOctal(block.subarray(148, 156));
    const check = Buffer.from(block);
    check.fill(0x20, 148, 156);
    let actual = 0;
    for (const byte of check) actual += byte;
    if (actual !== stored || block.toString("ascii", 257, 263) !== "ustar\0")
      throw new TransferArchiveError("INVALID_ARCHIVE");
    const type = block.toString("ascii", 156, 157);
    if (type !== "0" && type !== "\0")
      throw new TransferArchiveError("INVALID_ARCHIVE");
    const path = block.toString("ascii", 0, 100).replace(/\0.*$/s, "");
    if (!validPath(path) || files.has(path) || files.size >= MAX_ARCHIVE_FILES)
      throw new TransferArchiveError("INVALID_ARCHIVE");
    const length = readOctal(block.subarray(124, 136));
    const next = offset + BLOCK + Math.ceil(length / BLOCK) * BLOCK;
    if (next > body.length - BLOCK * 2)
      throw new TransferArchiveError("INVALID_ARCHIVE");
    files.set(
      path,
      Buffer.from(body.subarray(offset + BLOCK, offset + BLOCK + length)),
    );
    offset = next;
  }
  throw new TransferArchiveError("INVALID_ARCHIVE");
}
