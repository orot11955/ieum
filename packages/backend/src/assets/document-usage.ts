import type { PoolClient } from "pg";
import { ReplaceDocumentAssetsRequestSchema } from "@ieum/contracts/assets";
import { CommandCoordinator, CommandError } from "../command-coordinator.js";
import { IdentityService } from "../identity-service.js";
import { AssetError } from "./asset-service.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class DocumentAssetError extends Error {
  constructor(readonly code: "DOCUMENT_NOT_FOUND" | "DOCUMENT_ARCHIVED") {
    super(code);
  }
}
export async function draftAssetIds(
  client: PoolClient,
  wid: string,
  documentId: string,
) {
  const result = await client.query<{ asset_id: string }>(
    "SELECT asset_id FROM business.document_asset_draft WHERE workspace_id=$1 AND document_id=$2 ORDER BY position",
    [wid, documentId],
  );
  return result.rows.map((row) => row.asset_id);
}
export async function revisionAssetIds(
  client: PoolClient,
  wid: string,
  documentId: string,
  revision: number,
) {
  const result = await client.query<{ asset_id: string }>(
    "SELECT asset_id FROM business.document_asset_revision WHERE workspace_id=$1 AND document_id=$2 AND revision=$3 ORDER BY position",
    [wid, documentId, revision],
  );
  return result.rows.map((row) => row.asset_id);
}
/** Called inside the document revision transaction after draft and document locks. */
export async function sealDraftAssets(
  client: PoolClient,
  wid: string,
  documentId: string,
  revision: number,
) {
  const current = await client.query<{
    asset_id: string;
    position: number;
    state: string;
    content_hash: string | null;
    public_asset_id: string | null;
    derivative_hash: string | null;
    derivative_state: string | null;
  }>(
    `SELECT da.asset_id,da.position,a.state,a.content_hash,p.id AS public_asset_id,
       p.content_hash AS derivative_hash,p.state AS derivative_state
     FROM business.document_asset_draft da JOIN business.asset a
       ON a.workspace_id=da.workspace_id AND a.id=da.asset_id
     JOIN business.public_asset p ON p.workspace_id=a.workspace_id AND p.source_asset_id=a.id
     WHERE da.workspace_id=$1 AND da.document_id=$2 ORDER BY da.position FOR SHARE OF a,p`,
    [wid, documentId],
  );
  if (
    current.rows.length !==
    (await draftAssetIds(client, wid, documentId)).length
  )
    throw new AssetError("ASSET_NOT_VERIFIED");
  for (const row of current.rows) {
    if (
      row.state !== "VERIFIED" ||
      row.derivative_state !== "VERIFIED" ||
      !row.content_hash ||
      !row.public_asset_id ||
      !row.derivative_hash
    )
      throw new AssetError("ASSET_NOT_VERIFIED");
    await client.query(
      `INSERT INTO business.document_asset_revision
      (workspace_id,document_id,revision,asset_id,public_asset_id,position,original_hash,derivative_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        wid,
        documentId,
        revision,
        row.asset_id,
        row.public_asset_id,
        row.position,
        row.content_hash,
        row.derivative_hash,
      ],
    );
  }
}
export async function copyRevisionAssets(
  client: PoolClient,
  wid: string,
  documentId: string,
  sourceRevision: number,
  newRevision: number,
) {
  await client.query(
    `INSERT INTO business.document_asset_revision
    (workspace_id,document_id,revision,asset_id,public_asset_id,position,original_hash,derivative_hash)
    SELECT workspace_id,document_id,$4,asset_id,public_asset_id,position,original_hash,derivative_hash
    FROM business.document_asset_revision WHERE workspace_id=$1 AND document_id=$2 AND revision=$3`,
    [wid, documentId, sourceRevision, newRevision],
  );
}
export class DocumentAssetService {
  constructor(
    private readonly identity: IdentityService,
    private readonly commands: CommandCoordinator,
  ) {}
  async replace(input: {
    actorId: string;
    workspaceId: string;
    documentId: string;
    idempotencyKey: string;
    request: { baseDraftVersion: number; assetIds: string[] };
    requestId?: string;
  }) {
    if (!UUID.test(input.documentId)) throw new CommandError("INVALID_COMMAND");
    const parsed = ReplaceDocumentAssetsRequestSchema.safeParse(input.request);
    if (!parsed.success) throw new CommandError("INVALID_COMMAND");
    const result = await this.commands.execute({
      actorId: input.actorId,
      kind: "document.assets.replace",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        documentId: input.documentId,
        request: parsed.data,
      },
      apply: async (client, access) => {
        if (access.workspaceId !== input.workspaceId)
          throw new DocumentAssetError("DOCUMENT_NOT_FOUND");
        const document = await client.query<{ version: number; state: string }>(
          `SELECT dr.version,d.state FROM business.document_draft dr JOIN business.document d
           ON d.workspace_id=dr.workspace_id AND d.id=dr.document_id
           WHERE dr.workspace_id=$1 AND dr.document_id=$2 FOR UPDATE OF dr,d`,
          [access.workspaceId, input.documentId],
        );
        const current = document.rows[0];
        if (!current) throw new DocumentAssetError("DOCUMENT_NOT_FOUND");
        if (current.state !== "ACTIVE")
          throw new DocumentAssetError("DOCUMENT_ARCHIVED");
        if (current.version !== parsed.data.baseDraftVersion)
          throw new CommandError("VERSION_CONFLICT", current.version);
        for (const assetId of [...parsed.data.assetIds].sort()) {
          const asset = await client.query<{
            state: string;
            derivative_state: string | null;
          }>(
            `SELECT a.state,p.state AS derivative_state FROM business.asset a
             JOIN business.public_asset p ON p.workspace_id=a.workspace_id AND p.source_asset_id=a.id
             WHERE a.workspace_id=$1 AND a.id=$2 FOR SHARE OF a,p`,
            [access.workspaceId, assetId],
          );
          if (
            asset.rows[0]?.state !== "VERIFIED" ||
            asset.rows[0]?.derivative_state !== "VERIFIED"
          )
            throw new AssetError("ASSET_NOT_VERIFIED");
        }
        await client.query(
          "DELETE FROM business.document_asset_draft WHERE workspace_id=$1 AND document_id=$2",
          [access.workspaceId, input.documentId],
        );
        for (const [position, assetId] of parsed.data.assetIds.entries())
          await client.query(
            "INSERT INTO business.document_asset_draft (workspace_id,document_id,asset_id,position) VALUES($1,$2,$3,$4)",
            [access.workspaceId, input.documentId, assetId, position],
          );
        await client.query(
          "UPDATE business.document_draft SET version=version+1,updated_at=now() WHERE workspace_id=$1 AND document_id=$2",
          [access.workspaceId, input.documentId],
        );
        await client.query(
          "UPDATE business.document SET updated_at=now() WHERE workspace_id=$1 AND id=$2",
          [access.workspaceId, input.documentId],
        );
        return {
          response: {
            documentId: input.documentId,
            draftVersion: current.version + 1,
            assetIds: parsed.data.assetIds,
          },
          audit: {
            action: "DOCUMENT_ASSETS_REPLACED",
            targetType: "document",
            targetId: input.documentId,
            beforeVersion: current.version,
            afterVersion: current.version + 1,
            changedFieldNames: ["asset_manifest"],
            ...(input.requestId ? { requestId: input.requestId } : {}),
          },
        };
      },
    });
    return {
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    };
  }
}
