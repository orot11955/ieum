import { createHash } from "node:crypto";
import sharp from "sharp";
import type { CreateAssetRequest } from "@ieum/contracts/assets";

export const MAX_ASSET_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 20_000_000;
export const TRANSFORM_REVISION = "be18-png-1";
export type AssetValidationCode =
  | "FILE_NAME_INVALID"
  | "MIME_MISMATCH"
  | "SIZE_MISMATCH"
  | "CONTENT_INVALID"
  | "IMAGE_TOO_LARGE";
export class AssetValidationError extends Error {
  constructor(readonly code: AssetValidationCode) {
    super(code);
  }
}
const extension: Record<CreateAssetRequest["declaredMime"], string[]> = {
  "text/plain": [".txt"],
  "text/markdown": [".md", ".markdown"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};
export function validateAssetMetadata(input: CreateAssetRequest) {
  const name = input.fileName;
  if (
    name !== name.trim() ||
    name.startsWith(".") ||
    name.includes("..") ||
    /[\\/\u0000-\u001f\u007f]/u.test(name) ||
    !extension[input.declaredMime].some((ext) =>
      name.toLowerCase().endsWith(ext),
    )
  )
    throw new AssetValidationError("FILE_NAME_INVALID");
}
function matchesMagic(mime: CreateAssetRequest["declaredMime"], bytes: Buffer) {
  if (mime === "image/png")
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/jpeg")
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  if (mime === "image/webp")
    return (
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  return true;
}
export async function validateAssetBytes(
  input: CreateAssetRequest,
  bytes: Buffer,
) {
  if (
    bytes.length !== input.expectedSize ||
    bytes.length < 1 ||
    bytes.length > MAX_ASSET_BYTES
  )
    throw new AssetValidationError("SIZE_MISMATCH");
  if (!matchesMagic(input.declaredMime, bytes))
    throw new AssetValidationError("MIME_MISMATCH");
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  if (input.declaredMime.startsWith("text/")) {
    let value: string;
    try {
      value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new AssetValidationError("CONTENT_INVALID");
    }
    if (
      value.includes("\u0000") ||
      /[\u0001-\u0008\u000b\u000c\u000e-\u001f]/u.test(value) ||
      /<\s*(?:script|iframe|svg|object|embed|html)\b/i.test(value) ||
      /^\s*<!doctype\s+html/i.test(value)
    )
      throw new AssetValidationError("CONTENT_INVALID");
    const derivative = Buffer.from(value, "utf8");
    return {
      detectedMime: input.declaredMime,
      contentHash,
      derivative,
      derivativeMime: "text/plain",
      derivativeHash: createHash("sha256").update(derivative).digest("hex"),
      width: null,
      height: null,
    };
  }
  try {
    const decoder = sharp(bytes, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: "error",
    });
    const metadata = await decoder.metadata();
    const expected = {
      "image/png": "png",
      "image/jpeg": "jpeg",
      "image/webp": "webp",
    }[input.declaredMime as "image/png" | "image/jpeg" | "image/webp"];
    if (metadata.format !== expected)
      throw new AssetValidationError("MIME_MISMATCH");
    if (
      !metadata.width ||
      !metadata.height ||
      (metadata.pages && metadata.pages !== 1) ||
      metadata.width * metadata.height > MAX_IMAGE_PIXELS
    )
      throw new AssetValidationError("IMAGE_TOO_LARGE");
    const { data, info } = await sharp(bytes, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: "error",
    })
      .rotate()
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
    if (
      data.length < 1 ||
      data.length > MAX_ASSET_BYTES ||
      info.width * info.height > MAX_IMAGE_PIXELS
    )
      throw new AssetValidationError("IMAGE_TOO_LARGE");
    return {
      detectedMime: input.declaredMime,
      contentHash,
      derivative: data,
      derivativeMime: "image/png",
      derivativeHash: createHash("sha256").update(data).digest("hex"),
      width: info.width,
      height: info.height,
    };
  } catch (error) {
    if (error instanceof AssetValidationError) throw error;
    throw new AssetValidationError("CONTENT_INVALID");
  }
}
