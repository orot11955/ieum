import {
  TransferManifestSchema,
  type TransferManifest,
} from "@ieum/contracts/data-transfer";
import {
  packTransferArchive,
  transferHash,
  unpackTransferArchive,
} from "./archive.js";
import { validRawBody, validText } from "../captures.js";

export class TransferManifestError extends Error {
  constructor(public readonly code: "UNSUPPORTED_SCHEMA" | "INVALID_BUNDLE") {
    super(code);
  }
}

export function createCaptureBundle(
  sourceWorkspaceId: string,
  records: {
    id: string;
    revision: number;
    title: string;
    rawBody: string;
    originWorkspaceId?: string;
    originCaptureId?: string;
  }[],
): Buffer {
  const files = records.map((record) => ({
    path: `captures/${record.id}.md`,
    bytes: Buffer.from(record.rawBody, "utf8"),
  }));
  const manifest = TransferManifestSchema.parse({
    format: "ieum-personal",
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceWorkspaceId,
    captures: records.map((record, index) => ({
      id: record.id,
      revision: record.revision,
      title: record.title,
      originWorkspaceId: record.originWorkspaceId ?? sourceWorkspaceId,
      originCaptureId: record.originCaptureId ?? record.id,
      path: files[index]!.path,
      sha256: transferHash(files[index]!.bytes),
    })),
  });
  return packTransferArchive([
    { path: "manifest.json", bytes: Buffer.from(JSON.stringify(manifest)) },
    ...files,
  ]);
}

export function readCaptureBundle(packed: Buffer): {
  manifest: TransferManifest;
  captures: (TransferManifest["captures"][number] & { rawBody: string })[];
} {
  const files = unpackTransferArchive(packed);
  const manifestBytes = files.get("manifest.json");
  if (!manifestBytes) throw new TransferManifestError("INVALID_BUNDLE");
  let input: unknown;
  try {
    input = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new TransferManifestError("INVALID_BUNDLE");
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "version" in input &&
    input.version !== 1
  )
    throw new TransferManifestError("UNSUPPORTED_SCHEMA");
  const parsed = TransferManifestSchema.safeParse(input);
  if (!parsed.success) throw new TransferManifestError("INVALID_BUNDLE");
  const manifest = parsed.data;
  const expectedPaths = new Set(["manifest.json"]);
  const ids = new Set<string>();
  const captures = manifest.captures.map((record) => {
    if (
      ids.has(record.id) ||
      record.path !== `captures/${record.id}.md` ||
      expectedPaths.has(record.path)
    )
      throw new TransferManifestError("INVALID_BUNDLE");
    ids.add(record.id);
    expectedPaths.add(record.path);
    const bytes = files.get(record.path);
    if (!bytes || bytes.length < 1 || bytes.length > 200_000)
      throw new TransferManifestError("INVALID_BUNDLE");
    if (transferHash(bytes) !== record.sha256)
      throw new TransferManifestError("INVALID_BUNDLE");
    const rawBody = bytes.toString("utf8");
    if (!Buffer.from(rawBody, "utf8").equals(bytes))
      throw new TransferManifestError("INVALID_BUNDLE");
    if (!validText(record.title, 300) || !validRawBody(rawBody))
      throw new TransferManifestError("INVALID_BUNDLE");
    return { ...record, rawBody };
  });
  if (files.size !== expectedPaths.size)
    throw new TransferManifestError("INVALID_BUNDLE");
  return { manifest, captures };
}
