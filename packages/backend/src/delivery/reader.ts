import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { Pool, PoolClient } from "pg";
import {
  PublicPublicationListSchema,
  PublicPublicationSchema,
} from "@ieum/contracts/delivery";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^ieum_dlv_([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sha = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

export class DeliveryReadError extends Error {
  constructor(
    readonly code:
      "UNAUTHORIZED" | "NOT_FOUND" | "BAD_CURSOR" | "ASSET_UNAVAILABLE",
  ) {
    super(code);
  }
}

export async function assertDeliveryDatabaseRole(pool: Pool): Promise<void> {
  const result = await pool.query<{
    rolsuper: boolean;
    rolbypassrls: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolreplication: boolean;
    delivery_member: boolean;
    application_member: boolean;
    migrator_member: boolean;
    auth_member: boolean;
    relay_member: boolean;
    business_usage: boolean;
    auth_usage: boolean;
    business_select: boolean;
    credential_select: boolean;
    credential_write: boolean;
    projection_write: boolean;
    queue_usage: boolean;
    owns_delivery: boolean;
    can_set_dangerous_role: boolean;
  }>(`SELECT r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,
      pg_has_role(current_user,'ieum_delivery','USAGE') AS delivery_member,
      pg_has_role(current_user,'ieum_application','MEMBER') AS application_member,
      pg_has_role(current_user,'ieum_migrator','MEMBER') AS migrator_member,
      pg_has_role(current_user,'ieum_auth_runtime','MEMBER') AS auth_member,
      pg_has_role(current_user,'ieum_job_relay','MEMBER') AS relay_member,
      has_schema_privilege(current_user,'business','USAGE') AS business_usage,
      has_schema_privilege(current_user,'auth','USAGE') AS auth_usage,
      EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='business' AND c.relkind='r'
          AND has_table_privilege(current_user,c.oid,'SELECT')
      ) AS business_select,
      has_table_privilege(current_user,'delivery.client_credential','SELECT') AS credential_select,
      has_table_privilege(current_user,'delivery.client_credential','INSERT,UPDATE,DELETE') AS credential_write,
      EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='delivery'
          AND c.relname IN ('publication','publication_revision','publication_slug','publication_asset')
          AND has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      ) AS projection_write,
      CASE WHEN to_regnamespace('pgboss') IS NULL THEN false
        ELSE has_schema_privilege(current_user,'pgboss','USAGE') END AS queue_usage,
      EXISTS (
        SELECT 1 FROM pg_namespace n
        WHERE n.nspname='delivery' AND n.nspowner=r.oid
      ) OR EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='delivery' AND c.relkind='r' AND c.relowner=r.oid
      ) AS owns_delivery,
      EXISTS (
        SELECT 1 FROM pg_roles target
        WHERE pg_has_role(current_user,target.oid,'SET')
          AND (
            target.rolsuper OR target.rolbypassrls OR target.rolcreatedb
            OR target.rolcreaterole OR target.rolreplication
            OR EXISTS (
              SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname IN ('business','delivery','pgboss')
                AND c.relkind='r' AND c.relowner=target.oid
            )
            OR EXISTS (
              SELECT 1 FROM pg_namespace n
              WHERE n.nspname IN ('business','delivery','pgboss')
                AND n.nspowner=target.oid
            )
          )
      ) AS can_set_dangerous_role
     FROM pg_roles r WHERE r.rolname=current_user`);
  const role = result.rows[0];
  if (
    !role ||
    role.rolsuper ||
    role.rolbypassrls ||
    role.rolcreatedb ||
    role.rolcreaterole ||
    role.rolreplication ||
    !role.delivery_member ||
    role.application_member ||
    role.migrator_member ||
    role.auth_member ||
    role.relay_member ||
    role.business_usage ||
    role.auth_usage ||
    role.business_select ||
    role.credential_select ||
    role.credential_write ||
    role.projection_write ||
    role.queue_usage ||
    role.owns_delivery ||
    role.can_set_dangerous_role
  )
    throw new Error("Delivery database role is not isolated");
}

export class LocalDeliveryAssetReader {
  private constructor(private readonly root: string) {}
  static async create(root: string) {
    if (!isAbsolute(root)) throw new Error("Derivative root must be absolute");
    return new LocalDeliveryAssetReader(await realpath(root));
  }
  async read(key: string) {
    if (!UUID.test(key)) throw new DeliveryReadError("ASSET_UNAVAILABLE");
    const file = await open(
      join(this.root, key),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      if (!(await file.stat()).isFile())
        throw new DeliveryReadError("ASSET_UNAVAILABLE");
      return await file.readFile();
    } finally {
      await file.close();
    }
  }
}

interface Scope {
  workspaceId: string;
  channelId: string;
  token: string;
}
interface PublicationRow {
  id: string;
  current_revision: number;
  access_epoch: number;
  current_slug: string;
  updated_at: Date;
  title: string;
  body: string;
  body_format: "markdown";
  manifest_hash: string;
  published_at: Date;
}
interface AssetRow {
  public_asset_id: string;
  storage_key: string;
  mime: string;
  byte_size: number;
  content_hash: string;
}
interface Cursor {
  createdAt: string;
  id: string;
}
function encodeCursor(cursor: Cursor, token: string) {
  const body = Buffer.from(JSON.stringify(cursor)).toString("base64url");
  const mac = createHmac("sha256", token).update(body).digest("base64url");
  return `${body}.${mac}`;
}
function decodeCursor(value: string, token: string): Cursor {
  if (value.length > 500) throw new DeliveryReadError("BAD_CURSOR");
  const [body, mac, extra] = value.split(".");
  if (!body || !mac || extra) throw new DeliveryReadError("BAD_CURSOR");
  const expected = createHmac("sha256", token).update(body).digest("base64url");
  const actualBytes = Buffer.from(mac);
  const expectedBytes = Buffer.from(expected);
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  )
    throw new DeliveryReadError("BAD_CURSOR");
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    );
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("createdAt" in parsed) ||
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.createdAt)) ||
      !("id" in parsed) ||
      typeof parsed.id !== "string" ||
      !UUID.test(parsed.id)
    )
      throw new Error("invalid");
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    throw new DeliveryReadError("BAD_CURSOR");
  }
}

export class DeliveryReader {
  constructor(
    private readonly pool: Pool,
    private readonly assets: LocalDeliveryAssetReader | null,
  ) {}

  private async authorized<T>(
    bearer: string | undefined,
    operation: (client: PoolClient, scope: Scope) => Promise<T>,
  ): Promise<T> {
    const match = bearer?.match(TOKEN);
    if (!match || !UUID.test(match[1]!))
      throw new DeliveryReadError("UNAUTHORIZED");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const resolved = await client.query<{
        workspace_id: string;
        channel_id: string;
      }>(
        "SELECT workspace_id,channel_id FROM delivery.resolve_credential($1,$2)",
        [match[1], sha(bearer!)],
      );
      const row = resolved.rows[0];
      if (!row) throw new DeliveryReadError("UNAUTHORIZED");
      await client.query("SELECT set_config('ieum.workspace_id',$1,true)", [
        row.workspace_id,
      ]);
      const result = await operation(client, {
        workspaceId: row.workspace_id,
        channelId: row.channel_id,
        token: bearer!,
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async current(client: PoolClient, scope: Scope, id: string) {
    if (!UUID.test(id)) throw new DeliveryReadError("NOT_FOUND");
    await client.query("SELECT delivery.lock_publication($1,$2,$3)", [
      scope.workspaceId,
      scope.channelId,
      id,
    ]);
    const found = await client.query<PublicationRow>(
      `SELECT p.id,p.current_revision,p.access_epoch,p.current_slug,p.updated_at,
        r.title,r.body,r.body_format,r.manifest_hash,r.published_at
       FROM delivery.publication p
       JOIN delivery.publication_revision r
         ON r.workspace_id=p.workspace_id AND r.publication_id=p.id
        AND r.revision=p.current_revision
       WHERE p.workspace_id=$1 AND p.channel_id=$2 AND p.id=$3 AND p.state='PUBLISHED'`,
      [scope.workspaceId, scope.channelId, id],
    );
    if (!found.rows[0]) throw new DeliveryReadError("NOT_FOUND");
    return found.rows[0];
  }

  private async detail(client: PoolClient, scope: Scope, id: string) {
    const row = await this.current(client, scope, id);
    const assets = await client.query<AssetRow>(
      `SELECT public_asset_id,storage_key,mime,byte_size,content_hash
       FROM delivery.publication_asset
       WHERE workspace_id=$1 AND publication_id=$2 AND revision=$3 ORDER BY position`,
      [scope.workspaceId, id, row.current_revision],
    );
    const body = PublicPublicationSchema.parse({
      id: row.id,
      publicRevision: row.current_revision,
      title: row.title,
      slug: row.current_slug,
      bodyFormat: row.body_format,
      body: row.body,
      publishedAt: row.published_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      assets: assets.rows.map((asset) => ({
        id: asset.public_asset_id,
        mime: asset.mime,
        byteSize: asset.byte_size,
        url: `/delivery/v1/publications/${id}/assets/${asset.public_asset_id}`,
      })),
    });
    const etag = `"${sha(`${id}:${row.current_revision}:${row.access_epoch}:${row.manifest_hash}`)}"`;
    return { body, etag };
  }

  get(bearer: string | undefined, id: string) {
    return this.authorized(bearer, (client, scope) =>
      this.detail(client, scope, id),
    );
  }

  getRevision(bearer: string | undefined, id: string, revision: number) {
    return this.authorized(bearer, async (client, scope) => {
      const row = await this.current(client, scope, id);
      if (row.current_revision !== revision)
        throw new DeliveryReadError("NOT_FOUND");
      return this.detail(client, scope, id);
    });
  }

  getBySlug(bearer: string | undefined, slug: string) {
    return this.authorized(bearer, async (client, scope) => {
      if (!SLUG.test(slug)) throw new DeliveryReadError("NOT_FOUND");
      const found = await client.query<{ publication_id: string }>(
        `SELECT publication_id FROM delivery.publication_slug
         WHERE workspace_id=$1 AND channel_id=$2 AND slug=$3`,
        [scope.workspaceId, scope.channelId, slug],
      );
      if (!found.rows[0]) throw new DeliveryReadError("NOT_FOUND");
      return this.detail(client, scope, found.rows[0].publication_id);
    });
  }

  list(bearer: string | undefined, limit: number, cursor?: unknown) {
    return this.authorized(bearer, async (client, scope) => {
      if (!Number.isInteger(limit) || limit < 1 || limit > 50)
        throw new DeliveryReadError("BAD_CURSOR");
      if (cursor !== undefined && (typeof cursor !== "string" || !cursor))
        throw new DeliveryReadError("BAD_CURSOR");
      const boundary = cursor ? decodeCursor(cursor, scope.token) : null;
      const rows = await client.query<
        PublicationRow & { created_at_cursor: string }
      >(
        `SELECT p.id,p.current_revision,p.access_epoch,p.current_slug,p.created_at::text AS created_at_cursor,p.updated_at,
          r.title,r.body,r.body_format,r.manifest_hash,r.published_at
         FROM delivery.publication p JOIN delivery.publication_revision r
           ON r.workspace_id=p.workspace_id AND r.publication_id=p.id
          AND r.revision=p.current_revision
         WHERE p.workspace_id=$1 AND p.channel_id=$2 AND p.state='PUBLISHED'
           AND ($3::timestamptz IS NULL OR (p.created_at,p.id)<($3::timestamptz,$4::uuid))
         ORDER BY p.created_at DESC,p.id DESC LIMIT $5`,
        [
          scope.workspaceId,
          scope.channelId,
          boundary?.createdAt ?? null,
          boundary?.id ?? null,
          limit + 1,
        ],
      );
      const visible = rows.rows.slice(0, limit);
      const nextCursor =
        rows.rows.length > limit
          ? encodeCursor(
              {
                createdAt: visible[visible.length - 1]!.created_at_cursor,
                id: visible[visible.length - 1]!.id,
              },
              scope.token,
            )
          : null;
      const body = PublicPublicationListSchema.parse({
        items: visible.map((row) => ({
          id: row.id,
          publicRevision: row.current_revision,
          title: row.title,
          slug: row.current_slug,
          publishedAt: row.published_at.toISOString(),
        })),
        nextCursor,
      });
      return { body, etag: `"${sha(JSON.stringify(body))}"` };
    });
  }

  asset(bearer: string | undefined, id: string, assetId: string) {
    return this.authorized(bearer, async (client, scope) => {
      if (!UUID.test(assetId)) throw new DeliveryReadError("NOT_FOUND");
      const row = await this.current(client, scope, id);
      const found = await client.query<AssetRow>(
        `SELECT public_asset_id,storage_key,mime,byte_size,content_hash
         FROM delivery.publication_asset WHERE workspace_id=$1 AND publication_id=$2
           AND revision=$3 AND public_asset_id=$4`,
        [scope.workspaceId, id, row.current_revision, assetId],
      );
      const asset = found.rows[0];
      if (!asset) throw new DeliveryReadError("NOT_FOUND");
      if (!this.assets) throw new DeliveryReadError("ASSET_UNAVAILABLE");
      let bytes: Buffer;
      try {
        bytes = await this.assets.read(asset.storage_key);
      } catch {
        throw new DeliveryReadError("ASSET_UNAVAILABLE");
      }
      if (bytes.length !== asset.byte_size || sha(bytes) !== asset.content_hash)
        throw new DeliveryReadError("ASSET_UNAVAILABLE");
      const etag = `"${sha(`${id}:${row.current_revision}:${row.access_epoch}:${asset.content_hash}`)}"`;
      return { bytes, mime: asset.mime, etag };
    });
  }
}
