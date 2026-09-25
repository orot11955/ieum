import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { EditorEnvelopeSchema } from "@ieum/contracts/editor";
import type { EditorEnvelope, EditorSourceRef } from "@ieum/contracts/editor";
import {
  snapshotSource,
  lockSourceForFreshness,
} from "../documents/source-resolver.js";

export const PUBLIC_POLICY_VERSION = "be19-public-v1" as const;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const policyHash = sha(
  "be19-public-v1:markdown-escaped:source-label-only:verified-derivative",
);

export class PublicationManifestError extends Error {
  constructor(
    readonly code:
      | "DOCUMENT_NOT_FOUND"
      | "SOURCE_STALE"
      | "ASSET_STALE"
      | "DOCUMENT_INVALID",
  ) {
    super(code);
  }
}
function escapeMarkdown(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_{}\[\]()#+.!|~-])/g, "\\$1");
}
export function renderMarkdown(content: EditorEnvelope) {
  return (content.content.content ?? [])
    .map((block) => {
      const inline = (block.content ?? [])
        .map((node) => {
          if (node.type === "hardBreak") return "  \n";
          if (node.type === "sourceReference")
            return escapeMarkdown(node.attrs.label);
          let text = escapeMarkdown(node.text);
          for (const mark of node.marks ?? [])
            text = mark.type === "bold" ? `**${text}**` : `*${text}*`;
          return text;
        })
        .join("");
      return block.type === "heading"
        ? `${"#".repeat(block.attrs.level)} ${inline}`
        : inline;
    })
    .join("\n\n");
}
function references(content: EditorEnvelope): EditorSourceRef[] {
  return (content.content.content ?? []).flatMap((block) =>
    (block.content ?? []).flatMap((node) =>
      node.type === "sourceReference" ? [node.attrs.ref] : [],
    ),
  );
}
export interface PublicAssetSnapshot {
  publicAssetId: string;
  position: number;
  storageKey: string;
  mime: string;
  byteSize: number;
  contentHash: string;
}
export interface PublicationManifest {
  documentId: string;
  documentRevision: number;
  title: string;
  bodyFormat: "markdown";
  body: string;
  assets: PublicAssetSnapshot[];
  sourceCount: number;
  bodyHash: string;
  sourceHash: string;
  assetHash: string;
  policyHash: string;
  manifestHash: string;
  policyVersion: typeof PUBLIC_POLICY_VERSION;
}
export async function buildPublicationManifest(
  client: PoolClient,
  workspaceId: string,
  documentId: string,
  revision: number,
): Promise<PublicationManifest> {
  const revisionResult = await client.query<{
    title: string;
    content: unknown;
    content_hash: string;
    state: string;
  }>(
    `SELECT r.title,r.content,r.content_hash,d.state FROM business.document_revision r
     JOIN business.document d ON d.workspace_id=r.workspace_id AND d.id=r.document_id
     WHERE r.workspace_id=$1 AND r.document_id=$2 AND r.revision=$3`,
    [workspaceId, documentId, revision],
  );
  const row = revisionResult.rows[0];
  if (!row || row.state !== "ACTIVE")
    throw new PublicationManifestError("DOCUMENT_NOT_FOUND");
  const parsed = EditorEnvelopeSchema.safeParse(row.content);
  if (!parsed.success || sha(JSON.stringify(parsed.data)) !== row.content_hash)
    throw new PublicationManifestError("DOCUMENT_INVALID");
  const content = parsed.data;
  const body = renderMarkdown(content);
  const refs = references(content);
  const unique = [
    ...new Map(
      refs.map((ref) => [
        `${ref.sourceKind}:${ref.sourceId}:${ref.sourceRevision}`,
        ref,
      ]),
    ).values(),
  ].sort((a, b) =>
    `${a.sourceKind}:${a.sourceId}`.localeCompare(
      `${b.sourceKind}:${b.sourceId}`,
    ),
  );
  for (const ref of unique) {
    try {
      const selection = {
        kind: ref.sourceKind,
        id: ref.sourceId,
        revision: ref.sourceRevision,
        ...(ref.span ? { span: ref.span } : {}),
      };
      const first = await snapshotSource(client, workspaceId, selection);
      await lockSourceForFreshness(client, workspaceId, first);
      const fresh = await snapshotSource(client, workspaceId, selection);
      if (
        fresh.contentHash !== ref.sourceHash ||
        fresh.originKey !== ref.originKey
      )
        throw new PublicationManifestError("SOURCE_STALE");
    } catch {
      throw new PublicationManifestError("SOURCE_STALE");
    }
  }
  const assetRows = await client.query<{
    public_asset_id: string;
    position: number;
    storage_key: string;
    mime: string;
    byte_size: number;
    content_hash: string;
    source_hash: string;
    asset_state: string;
    derivative_state: string;
  }>(
    `SELECT dar.public_asset_id,dar.position,p.storage_key,p.mime,p.byte_size,p.content_hash,
      dar.derivative_hash AS source_hash,a.state AS asset_state,p.state AS derivative_state
     FROM business.document_asset_revision dar
     JOIN business.public_asset p ON p.workspace_id=dar.workspace_id AND p.id=dar.public_asset_id
     JOIN business.asset a ON a.workspace_id=dar.workspace_id AND a.id=dar.asset_id
     WHERE dar.workspace_id=$1 AND dar.document_id=$2 AND dar.revision=$3
     ORDER BY dar.position FOR SHARE OF a,p`,
    [workspaceId, documentId, revision],
  );
  const assetCount = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM business.document_asset_revision WHERE workspace_id=$1 AND document_id=$2 AND revision=$3`,
    [workspaceId, documentId, revision],
  );
  if (
    assetRows.rows.length !== Number(assetCount.rows[0]?.count ?? 0) ||
    assetRows.rows.some(
      (asset) =>
        asset.asset_state !== "VERIFIED" ||
        asset.derivative_state !== "VERIFIED" ||
        asset.content_hash !== asset.source_hash,
    )
  )
    throw new PublicationManifestError("ASSET_STALE");
  const assets = assetRows.rows.map((asset) => ({
    publicAssetId: asset.public_asset_id,
    position: asset.position,
    storageKey: asset.storage_key,
    mime: asset.mime,
    byteSize: asset.byte_size,
    contentHash: asset.content_hash,
  }));
  const bodyHash = sha(`${row.title}\u0000${body}`);
  const sourceHash = sha(
    JSON.stringify(
      refs.map((ref) => ({
        kind: ref.sourceKind,
        id: ref.sourceId,
        revision: ref.sourceRevision,
        originKey: ref.originKey,
        contentHash: ref.sourceHash,
        span: ref.span ?? null,
      })),
    ),
  );
  const assetHash = sha(
    JSON.stringify(
      assets.map((asset) => ({
        id: asset.publicAssetId,
        position: asset.position,
        hash: asset.contentHash,
        mime: asset.mime,
      })),
    ),
  );
  const manifestHash = sha(
    JSON.stringify({
      documentId,
      revision,
      bodyHash,
      sourceHash,
      assetHash,
      policyHash,
    }),
  );
  return {
    documentId,
    documentRevision: revision,
    title: row.title,
    bodyFormat: "markdown",
    body,
    assets,
    sourceCount: refs.length,
    bodyHash,
    sourceHash,
    assetHash,
    policyHash,
    manifestHash,
    policyVersion: PUBLIC_POLICY_VERSION,
  };
}
