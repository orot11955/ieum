import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { CreateAssetRequestSchema } from "@ieum/contracts/assets";
import type { CreateAssetRequest } from "@ieum/contracts/assets";
import { CommandCoordinator, CommandError } from "../command-coordinator.js";
import { IdentityService } from "../identity-service.js";
import type { AssetStoragePort } from "./storage.js";
import {
  AssetValidationError,
  validateAssetBytes,
  validateAssetMetadata,
  TRANSFORM_REVISION,
} from "./validation.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type AssetErrorCode =
  | "ASSET_DISABLED"
  | "ASSET_NOT_FOUND"
  | "ASSET_NOT_PENDING"
  | "ASSET_NOT_VERIFIED"
  | "ASSET_IN_USE"
  | "ASSET_UNAVAILABLE";
export class AssetError extends Error {
  constructor(readonly code: AssetErrorCode) {
    super(code);
  }
}
interface AssetRow {
  id: string;
  workspace_id: string;
  uploader_id: string;
  original_name: string;
  declared_mime: CreateAssetRequest["declaredMime"];
  expected_size: number;
  state: string;
  rejection_code: string | null;
  original_storage_key: string | null;
  detected_mime: string | null;
  byte_size: number | null;
  content_hash: string | null;
  created_at: Date;
  public_asset_id: string | null;
  derivative_mime: string | null;
  derivative_hash: string | null;
  derivative_storage_key: string | null;
}
function checkIds(...values: string[]) {
  if (values.some((value) => !UUID.test(value)))
    throw new CommandError("INVALID_COMMAND");
}
async function row(
  client: PoolClient,
  wid: string,
  id: string,
  lock = false,
): Promise<AssetRow> {
  const result = await client.query<AssetRow>(
    `SELECT a.*,p.id AS public_asset_id,p.mime AS derivative_mime,p.content_hash AS derivative_hash,
       p.storage_key AS derivative_storage_key FROM business.asset a LEFT JOIN business.public_asset p
       ON p.workspace_id=a.workspace_id AND p.source_asset_id=a.id
     WHERE a.workspace_id=$1 AND a.id=$2 ${lock ? "FOR UPDATE OF a" : ""}`,
    [wid, id],
  );
  if (!result.rows[0]) throw new AssetError("ASSET_NOT_FOUND");
  return result.rows[0];
}
export class AssetService {
  constructor(
    private readonly identity: IdentityService,
    private readonly commands: CommandCoordinator,
    private readonly storage: AssetStoragePort | null,
  ) {}
  private enabled(): AssetStoragePort {
    if (!this.storage) throw new AssetError("ASSET_DISABLED");
    return this.storage;
  }
  async create(input: {
    actorId: string;
    workspaceId: string;
    idempotencyKey: string;
    request: CreateAssetRequest;
    requestId?: string;
  }) {
    this.enabled();
    const parsed = CreateAssetRequestSchema.safeParse(input.request);
    if (!parsed.success) throw new CommandError("INVALID_COMMAND");
    validateAssetMetadata(parsed.data);
    const outcome = await this.commands.execute({
      actorId: input.actorId,
      kind: "asset.create",
      idempotencyKey: input.idempotencyKey,
      payload: { workspaceId: input.workspaceId, request: parsed.data },
      apply: async (client, access) => {
        if (access.workspaceId !== input.workspaceId)
          throw new AssetError("ASSET_NOT_FOUND");
        const id = randomUUID();
        await client.query(
          `INSERT INTO business.asset
          (id,workspace_id,uploader_id,original_name,declared_mime,expected_size)
          VALUES($1,$2,$3,$4,$5,$6)`,
          [
            id,
            access.workspaceId,
            input.actorId,
            parsed.data.fileName,
            parsed.data.declaredMime,
            parsed.data.expectedSize,
          ],
        );
        return {
          response: { assetId: id, state: "PENDING" },
          audit: {
            action: "ASSET_CREATED",
            targetType: "asset",
            targetId: id,
            beforeVersion: null,
            afterVersion: null,
            changedFieldNames: ["state"],
            ...(input.requestId ? { requestId: input.requestId } : {}),
          },
        };
      },
    });
    return {
      ...outcome.response,
      commandId: outcome.commandId,
      replayed: outcome.replayed,
    };
  }
  async complete(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    bytes: Buffer;
    requestId?: string;
  }) {
    checkIds(input.id);
    const storage = this.enabled();
    if (
      !Buffer.isBuffer(input.bytes) ||
      input.bytes.length < 1 ||
      input.bytes.length > 20 * 1024 * 1024
    )
      throw new CommandError("INVALID_COMMAND");
    const current = await this.identity.withPersonalWorkspace(
      input.actorId,
      async (client, access) => {
        if (access.workspaceId !== input.workspaceId)
          throw new AssetError("ASSET_NOT_FOUND");
        return row(client, access.workspaceId, input.id);
      },
    );
    if (current.uploader_id !== input.actorId)
      throw new AssetError("ASSET_NOT_FOUND");
    const metadata: CreateAssetRequest = {
      fileName: current.original_name,
      declaredMime: current.declared_mime,
      expectedSize: current.expected_size,
    };
    let validated: Awaited<ReturnType<typeof validateAssetBytes>> | null = null;
    let rejection: string | null = null;
    try {
      validated = await validateAssetBytes(metadata, input.bytes);
    } catch (error) {
      if (error instanceof AssetValidationError) rejection = error.code;
      else throw error;
    }
    const byteHash = createHash("sha256").update(input.bytes).digest("hex");
    let privateKey: string | null = null,
      derivativeKey: string | null = null;
    try {
      if (validated) {
        privateKey = await storage.putPrivate(input.bytes);
        derivativeKey = await storage.putDerivative(validated.derivative);
      }
      const result = await this.commands.execute({
        actorId: input.actorId,
        kind: "asset.upload",
        idempotencyKey: input.idempotencyKey,
        payload: {
          workspaceId: input.workspaceId,
          id: input.id,
          byteHash,
          byteSize: input.bytes.length,
        },
        apply: async (client, access) => {
          if (access.workspaceId !== input.workspaceId)
            throw new AssetError("ASSET_NOT_FOUND");
          const locked = await row(client, access.workspaceId, input.id, true);
          if (locked.uploader_id !== input.actorId)
            throw new AssetError("ASSET_NOT_FOUND");
          if (locked.state !== "PENDING")
            throw new AssetError("ASSET_NOT_PENDING");
          if (rejection) {
            await client.query(
              `UPDATE business.asset SET state='REJECTED',rejection_code=$3,updated_at=now()
              WHERE workspace_id=$1 AND id=$2`,
              [access.workspaceId, input.id, rejection],
            );
            return {
              response: {
                assetId: input.id,
                state: "REJECTED",
                rejectionCode: rejection,
                publicAssetId: null,
              },
              audit: {
                action: "ASSET_REJECTED",
                targetType: "asset",
                targetId: input.id,
                beforeVersion: null,
                afterVersion: null,
                changedFieldNames: ["state", "rejection_code"],
                ...(input.requestId ? { requestId: input.requestId } : {}),
              },
            };
          }
          if (!validated || !privateKey || !derivativeKey)
            throw new AssetError("ASSET_UNAVAILABLE");
          const publicAssetId = randomUUID();
          await client.query(
            `INSERT INTO business.public_asset
            (id,workspace_id,source_asset_id,storage_key,mime,byte_size,content_hash,transform_revision,width,height)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              publicAssetId,
              access.workspaceId,
              input.id,
              derivativeKey,
              validated.derivativeMime,
              validated.derivative.length,
              validated.derivativeHash,
              TRANSFORM_REVISION,
              validated.width,
              validated.height,
            ],
          );
          await client.query(
            `UPDATE business.asset SET state='VERIFIED',original_storage_key=$3,
            detected_mime=$4,byte_size=$5,content_hash=$6,updated_at=now()
            WHERE workspace_id=$1 AND id=$2`,
            [
              access.workspaceId,
              input.id,
              privateKey,
              validated.detectedMime,
              input.bytes.length,
              validated.contentHash,
            ],
          );
          return {
            response: {
              assetId: input.id,
              state: "VERIFIED",
              rejectionCode: null,
              publicAssetId,
            },
            audit: {
              action: "ASSET_VERIFIED",
              targetType: "asset",
              targetId: input.id,
              beforeVersion: null,
              afterVersion: null,
              changedFieldNames: ["state", "content_hash", "public_asset"],
              ...(input.requestId ? { requestId: input.requestId } : {}),
            },
          };
        },
      });
      if (result.replayed && privateKey && derivativeKey) {
        await storage.removePrivate(privateKey);
        await storage.removeDerivative(derivativeKey);
      }
      return {
        ...result.response,
        commandId: result.commandId,
        replayed: result.replayed,
      };
    } catch (error) {
      if (privateKey) await storage.removePrivate(privateKey).catch(() => {});
      if (derivativeKey)
        await storage.removeDerivative(derivativeKey).catch(() => {});
      throw error;
    }
  }
  async get(actorId: string, workspaceId: string, id: string) {
    checkIds(id);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new AssetError("ASSET_NOT_FOUND");
        const found = await row(client, access.workspaceId, id);
        const usage = await client.query<{ document_id: string }>(
          `SELECT document_id FROM business.document_asset_draft WHERE workspace_id=$1 AND asset_id=$2
         UNION SELECT document_id FROM business.document_asset_revision WHERE workspace_id=$1 AND asset_id=$2`,
          [access.workspaceId, id],
        );
        return {
          id,
          workspaceId,
          fileName: found.original_name,
          declaredMime: found.declared_mime,
          expectedSize: found.expected_size,
          state: found.state,
          rejectionCode: found.rejection_code,
          detectedMime: found.detected_mime,
          byteSize: found.byte_size,
          contentHash: found.content_hash,
          publicAssetId: found.public_asset_id,
          derivativeMime: found.derivative_mime,
          derivativeHash: found.derivative_hash,
          usedInDocumentIds: usage.rows.map((value) => value.document_id),
          createdAt: found.created_at.toISOString(),
        };
      },
    );
  }
  async list(actorId: string, workspaceId: string) {
    const ids = await this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new AssetError("ASSET_NOT_FOUND");
        const found = await client.query<{ id: string }>(
          "SELECT id FROM business.asset WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100",
          [access.workspaceId],
        );
        return found.rows.map((value) => value.id);
      },
    );
    return {
      assets: await Promise.all(
        ids.map((id) => this.get(actorId, workspaceId, id)),
      ),
    };
  }
  async read(
    actorId: string,
    workspaceId: string,
    id: string,
    derivative = false,
  ) {
    checkIds(id);
    const storage = this.enabled();
    const found = await this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new AssetError("ASSET_NOT_FOUND");
        return row(client, access.workspaceId, id);
      },
    );
    if (
      found.state !== "VERIFIED" ||
      !found.original_storage_key ||
      !found.derivative_storage_key
    )
      throw new AssetError("ASSET_NOT_VERIFIED");
    try {
      const bytes = derivative
        ? await storage.readDerivative(found.derivative_storage_key)
        : await storage.readPrivate(found.original_storage_key);
      const expectedHash = derivative
        ? found.derivative_hash
        : found.content_hash;
      if (createHash("sha256").update(bytes).digest("hex") !== expectedHash)
        throw new AssetError("ASSET_UNAVAILABLE");
      return {
        bytes,
        mime: derivative ? found.derivative_mime! : found.detected_mime!,
        fileName: found.original_name,
      };
    } catch {
      throw new AssetError("ASSET_UNAVAILABLE");
    }
  }
  async delete(input: {
    actorId: string;
    workspaceId: string;
    id: string;
    idempotencyKey: string;
    requestId?: string;
  }) {
    checkIds(input.id);
    const result = await this.commands.execute({
      actorId: input.actorId,
      kind: "asset.delete",
      idempotencyKey: input.idempotencyKey,
      payload: { workspaceId: input.workspaceId, id: input.id },
      apply: async (client, access) => {
        if (access.workspaceId !== input.workspaceId)
          throw new AssetError("ASSET_NOT_FOUND");
        const found = await row(client, access.workspaceId, input.id, true);
        if (found.uploader_id !== input.actorId)
          throw new AssetError("ASSET_NOT_FOUND");
        if (found.state === "DELETED") throw new AssetError("ASSET_NOT_FOUND");
        const used = await client.query(
          `SELECT 1 FROM business.document_asset_draft WHERE workspace_id=$1 AND asset_id=$2
          UNION SELECT 1 FROM business.document_asset_revision WHERE workspace_id=$1 AND asset_id=$2 LIMIT 1`,
          [access.workspaceId, input.id],
        );
        if (used.rowCount) throw new AssetError("ASSET_IN_USE");
        await client.query(
          "UPDATE business.asset SET state='DELETED',updated_at=now() WHERE workspace_id=$1 AND id=$2",
          [access.workspaceId, input.id],
        );
        if (found.public_asset_id)
          await client.query(
            "UPDATE business.public_asset SET state='DISABLED' WHERE workspace_id=$1 AND source_asset_id=$2",
            [access.workspaceId, input.id],
          );
        return {
          response: { assetId: input.id, state: "DELETED" },
          audit: {
            action: "ASSET_DELETED",
            targetType: "asset",
            targetId: input.id,
            beforeVersion: null,
            afterVersion: null,
            changedFieldNames: ["state"],
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
