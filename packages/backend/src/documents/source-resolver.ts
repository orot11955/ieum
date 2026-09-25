import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { EditorEnvelopeSchema } from "@ieum/contracts/editor";
import type {
  PackSourceManifest,
  PackSourceSelection,
} from "@ieum/contracts/workbench";
import { CommandError } from "../command-coordinator.js";
import { documentText } from "../documents.js";

export type SourceState = "fresh" | "stale" | "unresolved";
export class SourceUnavailableError extends Error {
  constructor() {
    super("SOURCE_UNAVAILABLE");
  }
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Resolved = {
  text: string;
  title: string;
  originKey: string;
  currentRevision: number;
  active: boolean;
  url: string | null;
  author: string | null;
  publishedAt: string | null;
  contentHash?: string;
};

async function resolve(
  client: PoolClient,
  workspaceId: string,
  source: Pick<PackSourceSelection, "kind" | "id" | "revision">,
): Promise<Resolved | null> {
  const { id, kind, revision } = source;
  if (!UUID.test(id) || !Number.isSafeInteger(revision) || revision < 1)
    throw new CommandError("INVALID_COMMAND");
  if (kind === "capture_revision") {
    const found = await client.query<{
      raw_body: string;
      title: string;
      origin_key: string;
      current_revision: number;
      state: string;
    }>(
      `SELECT r.raw_body,r.title,c.origin_key,c.current_revision,c.state
       FROM business.capture_revision r JOIN business.capture c
         ON c.workspace_id=r.workspace_id AND c.id=r.capture_id
       WHERE r.workspace_id=$1 AND r.capture_id=$2 AND r.revision=$3`,
      [workspaceId, id, revision],
    );
    const row = found.rows[0];
    return row
      ? {
          text: row.raw_body,
          title: row.title,
          originKey: row.origin_key,
          currentRevision: row.current_revision,
          active: row.state === "ACTIVE",
          url: null,
          author: null,
          publishedAt: null,
        }
      : null;
  }
  if (kind === "unit") {
    const found = await client.query<{
      content_text: string;
      origin_key: string;
      current_revision: number;
      state: string;
    }>(
      `SELECT r.content_text,u.origin_key,u.current_revision,u.state
       FROM business.thought_unit_revision r JOIN business.thought_unit u
         ON u.workspace_id=r.workspace_id AND u.id=r.unit_id
       WHERE r.workspace_id=$1 AND r.unit_id=$2 AND r.revision=$3`,
      [workspaceId, id, revision],
    );
    const row = found.rows[0];
    return row
      ? {
          text: row.content_text,
          title: "Unit",
          originKey: row.origin_key,
          currentRevision: row.current_revision,
          active: row.state === "ACTIVE",
          url: null,
          author: null,
          publishedAt: null,
        }
      : null;
  }
  if (kind === "document_revision") {
    const found = await client.query<{
      content: unknown;
      content_hash: string;
      title: string;
      latest_revision: number;
      state: string;
    }>(
      `SELECT r.content,r.content_hash,r.title,d.latest_revision,d.state
       FROM business.document_revision r JOIN business.document d
         ON d.workspace_id=r.workspace_id AND d.id=r.document_id
       WHERE r.workspace_id=$1 AND r.document_id=$2 AND r.revision=$3`,
      [workspaceId, id, revision],
    );
    const row = found.rows[0];
    if (!row) return null;
    const content = EditorEnvelopeSchema.safeParse(row.content);
    if (!content.success) return null;
    return {
      text: documentText(content.data),
      title: row.title,
      originKey: `document:${id}`,
      currentRevision: row.latest_revision,
      active: row.state === "ACTIVE",
      url: null,
      author: null,
      publishedAt: null,
      contentHash: row.content_hash,
    };
  }
  if (kind === "task_result") {
    const found = await client.query<{
      raw_body: string;
      title: string;
      origin_key: string;
      completion_version: number;
      state: string;
      capture_revision: number;
    }>(
      `SELECT cr.raw_body,cr.title,c.origin_key,tr.completion_version,c.state,
              c.current_revision AS capture_revision
       FROM business.task_result tr JOIN business.capture c
         ON c.workspace_id=tr.workspace_id AND c.id=tr.capture_id
       JOIN business.capture_revision cr ON cr.workspace_id=c.workspace_id
         AND cr.capture_id=c.id AND cr.revision=1
       WHERE tr.workspace_id=$1 AND tr.id=$2 AND tr.completion_version=$3`,
      [workspaceId, id, revision],
    );
    const row = found.rows[0];
    return row
      ? {
          text: row.raw_body,
          title: row.title,
          originKey: row.origin_key,
          currentRevision:
            row.capture_revision === 1
              ? row.completion_version
              : row.completion_version + 1,
          active: row.state === "ACTIVE",
          url: null,
          author: null,
          publishedAt: null,
        }
      : null;
  }
  const found = await client.query<{
    excerpt: string;
    title: string;
    url: string;
    author: string;
    published_at: string | null;
    content_hash: string;
    current_revision: number;
    state: string;
  }>(
    `SELECT r.excerpt,r.title,r.url,r.author,r.published_at::text AS published_at,r.content_hash,
            e.current_revision,e.state
     FROM business.external_excerpt_revision r JOIN business.external_excerpt e
       ON e.workspace_id=r.workspace_id AND e.id=r.excerpt_id
     WHERE r.workspace_id=$1 AND r.excerpt_id=$2 AND r.revision=$3`,
    [workspaceId, id, revision],
  );
  const row = found.rows[0];
  return row
    ? {
        text: row.excerpt,
        title: row.title,
        originKey: `external_excerpt:${id}`,
        currentRevision: row.current_revision,
        active: row.state === "ACTIVE",
        url: row.url,
        author: row.author,
        publishedAt: row.published_at,
        contentHash: row.content_hash,
      }
    : null;
}

export async function snapshotSource(
  client: PoolClient,
  workspaceId: string,
  source: PackSourceSelection,
): Promise<PackSourceManifest> {
  const row = await resolve(client, workspaceId, source);
  if (!row || !row.active || row.currentRevision !== source.revision)
    throw new SourceUnavailableError();
  const span = source.span ?? null;
  if (span && (span.end > row.text.length || span.start >= span.end))
    throw new CommandError("INVALID_COMMAND");
  const text = span ? row.text.slice(span.start, span.end) : row.text;
  if (!text || text.length > 20_000) throw new CommandError("INVALID_COMMAND");
  return {
    kind: source.kind,
    id: source.id,
    revision: source.revision,
    originKey: row.originKey,
    contentHash: row.contentHash ?? hash(row.text),
    span,
    text,
    title: row.title,
    url: row.url,
    author: row.author,
    publishedAt: row.publishedAt,
  };
}

export async function sourceState(
  client: PoolClient,
  workspaceId: string,
  manifest: PackSourceManifest,
): Promise<SourceState> {
  const row = await resolve(client, workspaceId, manifest);
  if (!row || !row.active) return "unresolved";
  if (
    row.currentRevision !== manifest.revision ||
    (row.contentHash ?? hash(row.text)) !== manifest.contentHash
  )
    return "stale";
  return "fresh";
}
