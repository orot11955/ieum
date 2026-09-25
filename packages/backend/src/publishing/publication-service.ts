import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  PublishDocumentRequestSchema,
  ReviewDocumentRequestSchema,
  RevisePublicationRequestSchema,
  WithdrawPublicationRequestSchema,
} from "@ieum/contracts/publishing";
import { CommandCoordinator, CommandError } from "../command-coordinator.js";
import { IdentityService } from "../identity-service.js";
import { buildPublicationManifest } from "./manifest.js";
import type { PublicationManifest } from "./manifest.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type PublicationErrorCode =
  | "PUBLICATION_NOT_FOUND"
  | "REVIEW_NOT_READY"
  | "MANIFEST_STALE"
  | "SLUG_CONFLICT"
  | "ALREADY_PUBLISHED"
  | "ALREADY_WITHDRAWN"
  | "REAUTH_REQUIRED";
export class PublicationError extends Error {
  constructor(readonly code: PublicationErrorCode) {
    super(code);
  }
}
function checkId(id: string) {
  if (!UUID.test(id)) throw new CommandError("INVALID_COMMAND");
}
function checkRevision(value: number) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new CommandError("INVALID_COMMAND");
}
function checkWorkspace(wid: string, actual: string) {
  if (wid !== actual) throw new PublicationError("PUBLICATION_NOT_FOUND");
}
function audit(
  action: string,
  id: string,
  before: number | null,
  after: number | null,
  fields: string[],
  requestId?: string,
) {
  return {
    action,
    targetType: "publication",
    targetId: id,
    beforeVersion: before,
    afterVersion: after,
    changedFieldNames: fields,
    ...(requestId ? { requestId } : {}),
  };
}
function commandResult(
  result: Awaited<ReturnType<CommandCoordinator["execute"]>>,
) {
  return {
    ...result.response,
    commandId: result.commandId,
    replayed: result.replayed,
  };
}

async function lockDocument(client: PoolClient, wid: string, id: string) {
  const result = await client.query<{ state: string }>(
    "SELECT state FROM business.document WHERE workspace_id=$1 AND id=$2 FOR UPDATE",
    [wid, id],
  );
  if (result.rows[0]?.state !== "ACTIVE")
    throw new PublicationError("PUBLICATION_NOT_FOUND");
}
async function checkedManifest(
  client: PoolClient,
  wid: string,
  documentId: string,
  revision: number,
  expected: string,
) {
  const manifest = await buildPublicationManifest(
    client,
    wid,
    documentId,
    revision,
  );
  if (manifest.manifestHash !== expected)
    throw new PublicationError("MANIFEST_STALE");
  return manifest;
}
async function readyReview(
  client: PoolClient,
  wid: string,
  documentId: string,
  revision: number,
  reviewId: string,
  manifestHash: string,
) {
  const latest = await client.query<{
    id: string;
    decision: string;
    manifest_hash: string;
  }>(
    `SELECT id,decision,manifest_hash FROM business.document_review WHERE workspace_id=$1 AND document_id=$2 AND revision=$3
     ORDER BY sequence DESC LIMIT 1`,
    [wid, documentId, revision],
  );
  if (
    latest.rows[0]?.id !== reviewId ||
    latest.rows[0]?.decision !== "READY" ||
    latest.rows[0]?.manifest_hash !== manifestHash
  )
    throw new PublicationError("REVIEW_NOT_READY");
}
async function defaultChannel(client: PoolClient, wid: string) {
  await client.query(
    `INSERT INTO business.publication_channel(id,workspace_id,name) VALUES($1,$2,'default')
     ON CONFLICT (workspace_id,name) DO NOTHING`,
    [randomUUID(), wid],
  );
  const found = await client.query<{ id: string; state: string }>(
    "SELECT id,state FROM business.publication_channel WHERE workspace_id=$1 AND name='default'",
    [wid],
  );
  if (!found.rows[0] || found.rows[0].state !== "ACTIVE")
    throw new PublicationError("PUBLICATION_NOT_FOUND");
  return found.rows[0].id;
}
async function reserveSlug(
  client: PoolClient,
  wid: string,
  channelId: string,
  slug: string,
  publicationId: string,
) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 19019))",
    [`${wid}:${channelId}:${slug}`],
  );
  const found = await client.query<{ publication_id: string }>(
    "SELECT publication_id FROM business.publication_slug WHERE workspace_id=$1 AND channel_id=$2 AND slug=$3",
    [wid, channelId, slug],
  );
  if (found.rows[0]) throw new PublicationError("SLUG_CONFLICT");
  await client.query(
    "INSERT INTO business.publication_slug(workspace_id,channel_id,slug,publication_id) VALUES($1,$2,$3,$4)",
    [wid, channelId, slug, publicationId],
  );
  await client.query(
    "INSERT INTO delivery.publication_slug(workspace_id,channel_id,slug,publication_id) VALUES($1,$2,$3,$4)",
    [wid, channelId, slug, publicationId],
  );
}
async function insertRevision(
  client: PoolClient,
  wid: string,
  publicationId: string,
  publicRevision: number,
  documentId: string,
  documentRevision: number,
  reviewId: string,
  actorId: string,
  manifest: PublicationManifest,
) {
  await client.query(
    `INSERT INTO business.publication_revision
    (workspace_id,publication_id,revision,document_id,document_revision,review_id,manifest_hash,created_by_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      wid,
      publicationId,
      publicRevision,
      documentId,
      documentRevision,
      reviewId,
      manifest.manifestHash,
      actorId,
    ],
  );
  await client.query(
    `INSERT INTO delivery.publication_revision
    (workspace_id,publication_id,revision,title,body,body_format,manifest_hash)
    VALUES($1,$2,$3,$4,$5,'markdown',$6)`,
    [
      wid,
      publicationId,
      publicRevision,
      manifest.title,
      manifest.body,
      manifest.manifestHash,
    ],
  );
  for (const asset of manifest.assets) {
    await client.query(
      `INSERT INTO business.publication_asset(workspace_id,publication_id,revision,public_asset_id,position,content_hash)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [
        wid,
        publicationId,
        publicRevision,
        asset.publicAssetId,
        asset.position,
        asset.contentHash,
      ],
    );
    await client.query(
      `INSERT INTO delivery.publication_asset
      (workspace_id,publication_id,revision,public_asset_id,position,storage_key,mime,byte_size,content_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        wid,
        publicationId,
        publicRevision,
        asset.publicAssetId,
        asset.position,
        asset.storageKey,
        asset.mime,
        asset.byteSize,
        asset.contentHash,
      ],
    );
  }
}
async function setPointer(
  client: PoolClient,
  wid: string,
  id: string,
  revision: number,
  slug: string,
) {
  await client.query(
    `UPDATE business.publication SET current_revision=$3,state='PUBLISHED',access_epoch=access_epoch+1,updated_at=now()
     WHERE workspace_id=$1 AND id=$2`,
    [wid, id, revision],
  );
  await client.query(
    `UPDATE delivery.publication SET current_revision=$3,state='PUBLISHED',access_epoch=access_epoch+1,current_slug=$4,updated_at=now()
     WHERE workspace_id=$1 AND id=$2`,
    [wid, id, revision, slug],
  );
}
async function detail(client: PoolClient, wid: string, id: string) {
  const result = await client.query<{
    document_id: string;
    channel_id: string;
    current_revision: number;
    state: "PUBLISHED" | "WITHDRAWN";
    access_epoch: number;
    current_slug: string;
    title: string;
    body: string;
    manifest_hash: string;
    published_at: Date;
  }>(
    `SELECT p.document_id,p.channel_id,p.current_revision,p.state,p.access_epoch,
       dp.current_slug,dr.title,dr.body,dr.manifest_hash,dr.published_at
     FROM business.publication p JOIN delivery.publication dp ON dp.workspace_id=p.workspace_id AND dp.id=p.id
     JOIN delivery.publication_revision dr ON dr.workspace_id=dp.workspace_id AND dr.publication_id=dp.id AND dr.revision=dp.current_revision
     WHERE p.workspace_id=$1 AND p.id=$2`,
    [wid, id],
  );
  const row = result.rows[0];
  if (!row) throw new PublicationError("PUBLICATION_NOT_FOUND");
  const assets = await client.query<{ public_asset_id: string }>(
    `SELECT public_asset_id FROM delivery.publication_asset WHERE workspace_id=$1 AND publication_id=$2 AND revision=$3 ORDER BY position`,
    [wid, id, row.current_revision],
  );
  return {
    publicationId: id,
    documentId: row.document_id,
    channelId: row.channel_id,
    publicRevision: row.current_revision,
    state: row.state,
    slug: row.current_slug,
    accessEpoch: row.access_epoch,
    title: row.title,
    body: row.body,
    manifestHash: row.manifest_hash,
    publicAssetIds: assets.rows.map((asset) => asset.public_asset_id),
    publishedAt: row.published_at.toISOString(),
  };
}

export class PublicationService {
  constructor(
    private readonly identity: IdentityService,
    private readonly commands: CommandCoordinator,
  ) {}
  async preview(
    actorId: string,
    workspaceId: string,
    documentId: string,
    revision: number,
  ) {
    checkId(documentId);
    checkRevision(revision);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        checkWorkspace(workspaceId, access.workspaceId);
        const manifest = await buildPublicationManifest(
          client,
          access.workspaceId,
          documentId,
          revision,
        );
        return {
          documentId,
          documentRevision: revision,
          title: manifest.title,
          bodyFormat: manifest.bodyFormat,
          body: manifest.body,
          publicAssetIds: manifest.assets.map((asset) => asset.publicAssetId),
          sourceCount: manifest.sourceCount,
          bodyHash: manifest.bodyHash,
          sourceHash: manifest.sourceHash,
          assetHash: manifest.assetHash,
          policyHash: manifest.policyHash,
          manifestHash: manifest.manifestHash,
          policyVersion: manifest.policyVersion,
        };
      },
    );
  }
  async review(input: {
    actorId: string;
    workspaceId: string;
    documentId: string;
    revision: number;
    idempotencyKey: string;
    request: { manifestHash: string; decision: "READY" | "CHANGES_REQUIRED" };
    requestId?: string;
  }) {
    checkId(input.documentId);
    checkRevision(input.revision);
    const parsed = ReviewDocumentRequestSchema.safeParse(input.request);
    if (!parsed.success) throw new CommandError("INVALID_COMMAND");
    const result = await this.commands.execute({
      actorId: input.actorId,
      kind: "publication.review",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        documentId: input.documentId,
        revision: input.revision,
        request: parsed.data,
      },
      apply: async (client, access) => {
        checkWorkspace(input.workspaceId, access.workspaceId);
        await lockDocument(client, access.workspaceId, input.documentId);
        const manifest = await checkedManifest(
          client,
          access.workspaceId,
          input.documentId,
          input.revision,
          parsed.data.manifestHash,
        );
        const previous = await client.query<{ sequence: number }>(
          `SELECT sequence FROM business.document_review WHERE workspace_id=$1 AND document_id=$2 AND revision=$3 ORDER BY sequence DESC LIMIT 1`,
          [access.workspaceId, input.documentId, input.revision],
        );
        const reviewId = randomUUID();
        await client.query(
          `INSERT INTO business.document_review
           (id,workspace_id,document_id,revision,sequence,manifest_hash,manifest,decision,reviewer_id)
           VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
          [
            reviewId,
            access.workspaceId,
            input.documentId,
            input.revision,
            (previous.rows[0]?.sequence ?? 0) + 1,
            manifest.manifestHash,
            JSON.stringify({
              bodyHash: manifest.bodyHash,
              sourceHash: manifest.sourceHash,
              assetHash: manifest.assetHash,
              policyHash: manifest.policyHash,
              policyVersion: manifest.policyVersion,
            }),
            parsed.data.decision,
            input.actorId,
          ],
        );
        if (parsed.data.decision === "CHANGES_REQUIRED") {
          const current = await client.query<{ id: string }>(
            `SELECT p.id FROM business.publication p JOIN business.publication_revision pr
             ON pr.workspace_id=p.workspace_id AND pr.publication_id=p.id AND pr.revision=p.current_revision
             WHERE p.workspace_id=$1 AND p.document_id=$2 AND pr.document_revision=$3 AND p.state='PUBLISHED'
             ORDER BY p.id FOR UPDATE OF p`,
            [access.workspaceId, input.documentId, input.revision],
          );
          for (const published of current.rows) {
            await client.query(
              "UPDATE business.publication SET state='WITHDRAWN',access_epoch=access_epoch+1,updated_at=now() WHERE workspace_id=$1 AND id=$2",
              [access.workspaceId, published.id],
            );
            await client.query(
              "UPDATE delivery.publication SET state='WITHDRAWN',access_epoch=access_epoch+1,updated_at=now() WHERE workspace_id=$1 AND id=$2",
              [access.workspaceId, published.id],
            );
          }
        }
        return {
          response: {
            reviewId,
            documentId: input.documentId,
            documentRevision: input.revision,
            decision: parsed.data.decision,
            manifestHash: manifest.manifestHash,
          },
          audit: audit(
            "DOCUMENT_PUBLIC_REVIEWED",
            input.documentId,
            null,
            null,
            ["review", "publication_state"],
            input.requestId,
          ),
        };
      },
    });
    return commandResult(result);
  }
  async publish(input: {
    actorId: string;
    workspaceId: string;
    idempotencyKey: string;
    request: {
      documentId: string;
      documentRevision: number;
      reviewId: string;
      manifestHash: string;
      slug: string;
    };
    requestId?: string;
  }) {
    const parsed = PublishDocumentRequestSchema.safeParse(input.request);
    if (!parsed.success) throw new CommandError("INVALID_COMMAND");
    const result = await this.commands.execute({
      actorId: input.actorId,
      kind: "publication.publish",
      idempotencyKey: input.idempotencyKey,
      payload: { workspaceId: input.workspaceId, request: parsed.data },
      apply: async (client, access) => {
        checkWorkspace(input.workspaceId, access.workspaceId);
        await lockDocument(client, access.workspaceId, parsed.data.documentId);
        const manifest = await checkedManifest(
          client,
          access.workspaceId,
          parsed.data.documentId,
          parsed.data.documentRevision,
          parsed.data.manifestHash,
        );
        await readyReview(
          client,
          access.workspaceId,
          parsed.data.documentId,
          parsed.data.documentRevision,
          parsed.data.reviewId,
          manifest.manifestHash,
        );
        const channelId = await defaultChannel(client, access.workspaceId);
        const existing = await client.query(
          "SELECT 1 FROM business.publication WHERE workspace_id=$1 AND channel_id=$2 AND document_id=$3",
          [access.workspaceId, channelId, parsed.data.documentId],
        );
        if (existing.rowCount) throw new PublicationError("ALREADY_PUBLISHED");
        const publicationId = randomUUID();
        await client.query(
          `INSERT INTO business.publication(id,workspace_id,channel_id,document_id,state,access_epoch)
           VALUES($1,$2,$3,$4,'WITHDRAWN',1)`,
          [
            publicationId,
            access.workspaceId,
            channelId,
            parsed.data.documentId,
          ],
        );
        await client.query(
          `INSERT INTO delivery.publication(id,workspace_id,channel_id,state,access_epoch,current_slug)
           VALUES($1,$2,$3,'WITHDRAWN',1,$4)`,
          [publicationId, access.workspaceId, channelId, parsed.data.slug],
        );
        await insertRevision(
          client,
          access.workspaceId,
          publicationId,
          1,
          parsed.data.documentId,
          parsed.data.documentRevision,
          parsed.data.reviewId,
          input.actorId,
          manifest,
        );
        await reserveSlug(
          client,
          access.workspaceId,
          channelId,
          parsed.data.slug,
          publicationId,
        );
        await setPointer(
          client,
          access.workspaceId,
          publicationId,
          1,
          parsed.data.slug,
        );
        return {
          response: {
            publicationId,
            publicRevision: 1,
            state: "PUBLISHED",
            slug: parsed.data.slug,
            accessEpoch: 2,
          },
          audit: audit(
            "PUBLICATION_PUBLISHED",
            publicationId,
            null,
            1,
            ["current_revision", "state", "slug"],
            input.requestId,
          ),
        };
      },
    });
    return commandResult(result);
  }
  async revise(input: {
    actorId: string;
    workspaceId: string;
    publicationId: string;
    idempotencyKey: string;
    request: {
      basePublicRevision: number;
      baseAccessEpoch: number;
      documentRevision: number;
      reviewId: string;
      manifestHash: string;
      slug: string;
    };
    requestId?: string;
  }) {
    checkId(input.publicationId);
    const parsed = RevisePublicationRequestSchema.safeParse(input.request);
    if (!parsed.success) throw new CommandError("INVALID_COMMAND");
    const result = await this.commands.execute({
      actorId: input.actorId,
      kind: "publication.revise",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        publicationId: input.publicationId,
        request: parsed.data,
      },
      apply: async (client, access) => {
        checkWorkspace(input.workspaceId, access.workspaceId);
        const initial = await client.query<{ document_id: string }>(
          "SELECT document_id FROM business.publication WHERE workspace_id=$1 AND id=$2",
          [access.workspaceId, input.publicationId],
        );
        const documentId = initial.rows[0]?.document_id;
        if (!documentId) throw new PublicationError("PUBLICATION_NOT_FOUND");
        await lockDocument(client, access.workspaceId, documentId);
        const found = await client.query<{
          document_id: string;
          channel_id: string;
          current_revision: number;
          state: string;
          access_epoch: number;
        }>(
          "SELECT document_id,channel_id,current_revision,state,access_epoch FROM business.publication WHERE workspace_id=$1 AND id=$2 FOR UPDATE",
          [access.workspaceId, input.publicationId],
        );
        const current = found.rows[0];
        if (!current || current.document_id !== documentId)
          throw new PublicationError("PUBLICATION_NOT_FOUND");
        if (current.current_revision !== parsed.data.basePublicRevision)
          throw new CommandError("VERSION_CONFLICT", current.current_revision);
        if (current.access_epoch !== parsed.data.baseAccessEpoch)
          throw new CommandError("VERSION_CONFLICT", current.access_epoch);
        const same = await client.query<{ document_revision: number }>(
          "SELECT document_revision FROM business.publication_revision WHERE workspace_id=$1 AND publication_id=$2 AND revision=$3",
          [access.workspaceId, input.publicationId, current.current_revision],
        );
        if (
          same.rows[0]?.document_revision === parsed.data.documentRevision &&
          current.state === "PUBLISHED"
        )
          throw new PublicationError("ALREADY_PUBLISHED");
        const manifest = await checkedManifest(
          client,
          access.workspaceId,
          documentId,
          parsed.data.documentRevision,
          parsed.data.manifestHash,
        );
        await readyReview(
          client,
          access.workspaceId,
          documentId,
          parsed.data.documentRevision,
          parsed.data.reviewId,
          manifest.manifestHash,
        );
        const old = await client.query<{ current_slug: string }>(
          "SELECT current_slug FROM delivery.publication WHERE workspace_id=$1 AND id=$2 FOR UPDATE",
          [access.workspaceId, input.publicationId],
        );
        const oldSlug = old.rows[0]?.current_slug;
        if (!oldSlug) throw new PublicationError("PUBLICATION_NOT_FOUND");
        const publicRevision = current.current_revision + 1;
        await insertRevision(
          client,
          access.workspaceId,
          input.publicationId,
          publicRevision,
          documentId,
          parsed.data.documentRevision,
          parsed.data.reviewId,
          input.actorId,
          manifest,
        );
        if (parsed.data.slug !== oldSlug) {
          await client.query(
            "UPDATE business.publication_slug SET is_current=false WHERE workspace_id=$1 AND publication_id=$2 AND is_current=true",
            [access.workspaceId, input.publicationId],
          );
          await client.query(
            "UPDATE delivery.publication_slug SET is_current=false WHERE workspace_id=$1 AND publication_id=$2 AND is_current=true",
            [access.workspaceId, input.publicationId],
          );
          await reserveSlug(
            client,
            access.workspaceId,
            current.channel_id,
            parsed.data.slug,
            input.publicationId,
          );
        }
        await setPointer(
          client,
          access.workspaceId,
          input.publicationId,
          publicRevision,
          parsed.data.slug,
        );
        return {
          response: {
            publicationId: input.publicationId,
            publicRevision,
            state: "PUBLISHED",
            slug: parsed.data.slug,
            accessEpoch: current.access_epoch + 1,
          },
          audit: audit(
            "PUBLICATION_REVISED",
            input.publicationId,
            current.current_revision,
            publicRevision,
            ["current_revision", "state", "slug"],
            input.requestId,
          ),
        };
      },
    });
    return commandResult(result);
  }
  async withdraw(input: {
    actorId: string;
    workspaceId: string;
    publicationId: string;
    idempotencyKey: string;
    request: { basePublicRevision: number };
    requestId?: string;
  }) {
    checkId(input.publicationId);
    const parsed = WithdrawPublicationRequestSchema.safeParse(input.request);
    if (!parsed.success) throw new CommandError("INVALID_COMMAND");
    const result = await this.commands.execute({
      actorId: input.actorId,
      kind: "publication.withdraw",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        publicationId: input.publicationId,
        request: parsed.data,
      },
      apply: async (client, access) => {
        checkWorkspace(input.workspaceId, access.workspaceId);
        const found = await client.query<{
          current_revision: number;
          state: string;
          access_epoch: number;
        }>(
          "SELECT current_revision,state,access_epoch FROM business.publication WHERE workspace_id=$1 AND id=$2 FOR UPDATE",
          [access.workspaceId, input.publicationId],
        );
        const current = found.rows[0];
        if (!current) throw new PublicationError("PUBLICATION_NOT_FOUND");
        if (current.current_revision !== parsed.data.basePublicRevision)
          throw new CommandError("VERSION_CONFLICT", current.current_revision);
        if (current.state !== "PUBLISHED")
          throw new PublicationError("ALREADY_WITHDRAWN");
        await client.query(
          "UPDATE business.publication SET state='WITHDRAWN',access_epoch=access_epoch+1,updated_at=now() WHERE workspace_id=$1 AND id=$2",
          [access.workspaceId, input.publicationId],
        );
        await client.query(
          "UPDATE delivery.publication SET state='WITHDRAWN',access_epoch=access_epoch+1,updated_at=now() WHERE workspace_id=$1 AND id=$2",
          [access.workspaceId, input.publicationId],
        );
        const slug = await client.query<{ current_slug: string }>(
          "SELECT current_slug FROM delivery.publication WHERE workspace_id=$1 AND id=$2",
          [access.workspaceId, input.publicationId],
        );
        return {
          response: {
            publicationId: input.publicationId,
            publicRevision: current.current_revision,
            state: "WITHDRAWN",
            slug: slug.rows[0]!.current_slug,
            accessEpoch: current.access_epoch + 1,
          },
          audit: audit(
            "PUBLICATION_WITHDRAWN",
            input.publicationId,
            current.current_revision,
            current.current_revision,
            ["state", "access_epoch"],
            input.requestId,
          ),
        };
      },
    });
    return commandResult(result);
  }
  async get(actorId: string, workspaceId: string, id: string) {
    checkId(id);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        checkWorkspace(workspaceId, access.workspaceId);
        return detail(client, access.workspaceId, id);
      },
    );
  }
  async list(actorId: string, workspaceId: string) {
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        checkWorkspace(workspaceId, access.workspaceId);
        const rows = await client.query<{ id: string }>(
          "SELECT id FROM business.publication WHERE workspace_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 100",
          [access.workspaceId],
        );
        return {
          publications: await Promise.all(
            rows.rows.map((row) => detail(client, access.workspaceId, row.id)),
          ),
        };
      },
    );
  }
}
