import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  CreateDeliveryCredentialRequestSchema,
  RotateDeliveryCredentialRequestSchema,
} from "@ieum/contracts/delivery-management";
import type { IdentityService } from "../identity-service.js";

export class DeliveryCredentialError extends Error {
  constructor(readonly code: "CREDENTIAL_NOT_FOUND" | "CHANNEL_NOT_FOUND") {
    super(code);
  }
}

interface CredentialRow {
  id: string;
  channel_id: string;
  name: string;
  state: "ACTIVE" | "REVOKED";
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
function result(row: CredentialRow) {
  return {
    id: row.id,
    channelId: row.channel_id,
    name: row.name,
    state: row.state,
    expiresAt: row.expires_at.toISOString(),
    revokedAt: row.revoked_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}
async function issue(
  client: PoolClient,
  workspaceId: string,
  channelId: string,
  name: string,
  actorId: string,
  expiresInDays: number,
) {
  const id = randomUUID();
  const token = `ieum_dlv_${id}.${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);
  const access = await client.query<{ authz_version: number }>(
    `SELECT authz_version FROM business.user_access
     WHERE user_id=$1 AND personal_workspace_id=$2 AND state='ACTIVE' FOR SHARE`,
    [actorId, workspaceId],
  );
  const authzVersion = access.rows[0]?.authz_version;
  if (!authzVersion) throw new DeliveryCredentialError("CREDENTIAL_NOT_FOUND");
  const inserted = await client.query<CredentialRow>(
    `INSERT INTO delivery.client_credential
     (id,workspace_id,channel_id,name,token_hash,created_by_id,issued_authz_version,expires_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,channel_id,name,state,expires_at,revoked_at,created_at`,
    [
      id,
      workspaceId,
      channelId,
      name,
      sha(token),
      actorId,
      authzVersion,
      expiresAt,
    ],
  );
  return { ...result(inserted.rows[0]!), token };
}

export class DeliveryCredentialService {
  constructor(private readonly identity: IdentityService) {}

  async list(actorId: string, workspaceId: string) {
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new DeliveryCredentialError("CREDENTIAL_NOT_FOUND");
        const rows = await client.query<CredentialRow>(
          `SELECT id,channel_id,name,state,expires_at,revoked_at,created_at
         FROM delivery.client_credential WHERE workspace_id=$1
         ORDER BY created_at DESC,id DESC`,
          [workspaceId],
        );
        return { credentials: rows.rows.map(result) };
      },
    );
  }

  async create(
    actorId: string,
    workspaceId: string,
    input: { name: string; expiresInDays: number },
  ) {
    const parsed = CreateDeliveryCredentialRequestSchema.parse(input);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new DeliveryCredentialError("CHANNEL_NOT_FOUND");
        const channel = await client.query<{ id: string }>(
          `SELECT id FROM business.publication_channel
         WHERE workspace_id=$1 AND name='default' AND state='ACTIVE'`,
          [workspaceId],
        );
        if (!channel.rows[0])
          throw new DeliveryCredentialError("CHANNEL_NOT_FOUND");
        const issued = await issue(
          client,
          workspaceId,
          channel.rows[0].id,
          parsed.name,
          actorId,
          parsed.expiresInDays,
        );
        await client.query(
          `INSERT INTO business.identity_event(actor_id,target_id,kind)
         VALUES($1,$2,'DELIVERY_CREDENTIAL_ISSUED')`,
          [actorId, issued.id],
        );
        return issued;
      },
    );
  }

  async rotate(
    actorId: string,
    workspaceId: string,
    id: string,
    input: { expiresInDays: number },
  ) {
    const parsed = RotateDeliveryCredentialRequestSchema.parse(input);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new DeliveryCredentialError("CREDENTIAL_NOT_FOUND");
        const old = await client.query<CredentialRow>(
          `SELECT id,channel_id,name,state,expires_at,revoked_at,created_at
         FROM delivery.client_credential WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
          [workspaceId, id],
        );
        const current = old.rows[0];
        if (!current || current.state !== "ACTIVE")
          throw new DeliveryCredentialError("CREDENTIAL_NOT_FOUND");
        await client.query(
          `UPDATE delivery.client_credential
         SET state='REVOKED',revoked_at=now() WHERE workspace_id=$1 AND id=$2`,
          [workspaceId, id],
        );
        const issued = await issue(
          client,
          workspaceId,
          current.channel_id,
          current.name,
          actorId,
          parsed.expiresInDays,
        );
        await client.query(
          `INSERT INTO business.identity_event(actor_id,target_id,kind)
         VALUES($1,$2,'DELIVERY_CREDENTIAL_ROTATED')`,
          [actorId, issued.id],
        );
        return issued;
      },
    );
  }

  async revoke(actorId: string, workspaceId: string, id: string) {
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new DeliveryCredentialError("CREDENTIAL_NOT_FOUND");
        const existing = await client.query<CredentialRow>(
          `SELECT id,channel_id,name,state,expires_at,revoked_at,created_at
         FROM delivery.client_credential WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
          [workspaceId, id],
        );
        if (!existing.rows[0])
          throw new DeliveryCredentialError("CREDENTIAL_NOT_FOUND");
        if (existing.rows[0].state === "ACTIVE") {
          const changed = await client.query<CredentialRow>(
            `UPDATE delivery.client_credential SET state='REVOKED',revoked_at=now()
           WHERE workspace_id=$1 AND id=$2
           RETURNING id,channel_id,name,state,expires_at,revoked_at,created_at`,
            [workspaceId, id],
          );
          await client.query(
            `INSERT INTO business.identity_event(actor_id,target_id,kind)
           VALUES($1,$2,'DELIVERY_CREDENTIAL_REVOKED')`,
            [actorId, id],
          );
          return result(changed.rows[0]!);
        }
        return result(existing.rows[0]);
      },
    );
  }
}
