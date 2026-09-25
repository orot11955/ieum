import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { PoolClient } from "pg";
import { DOCUMENT_CHECKLISTS } from "@ieum/core";
import {
  EditorEnvelopeSchema,
  canonicalEditorBlock,
} from "@ieum/contracts/editor";
import type { EditorEnvelope } from "@ieum/contracts/editor";
import {
  ClaimMappingSchema,
  OutlineConflictSchema,
  OutlineEntrySchema,
  PackSourceManifestSchema,
  SaveDocumentWorkbenchRequestSchema,
} from "@ieum/contracts/workbench";
import type {
  SaveDocumentWorkbenchRequest,
  PackSourceManifest,
} from "@ieum/contracts/workbench";
import { CommandCoordinator, CommandError } from "../command-coordinator.js";
import { IdentityService } from "../identity-service.js";
import { packRevision } from "./evidence-packs.js";
import { sourceState } from "./source-resolver.js";
import type { SourceState } from "./source-resolver.js";

export class WorkbenchError extends Error {
  constructor(
    public readonly code:
      | "WORKBENCH_NOT_FOUND"
      | "WORKBENCH_INVALID_MAPPING"
      | "DOCUMENT_NOT_FOUND",
  ) {
    super(code);
  }
}
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type Block = NonNullable<EditorEnvelope["content"]["content"]>[number];
function blockText(block: Block): string {
  return (block.content ?? [])
    .map((node) =>
      node.type === "text"
        ? node.text
        : node.type === "hardBreak"
          ? "\n"
          : node.attrs.label,
    )
    .join("");
}
async function draft(
  client: PoolClient,
  workspaceId: string,
  documentId: string,
  lock = false,
) {
  const found = await client.query<{
    version: number;
    content: unknown;
    state: string;
  }>(
    `SELECT dr.version,dr.content,d.state FROM business.document_draft dr
     JOIN business.document d ON d.workspace_id=dr.workspace_id AND d.id=dr.document_id
     WHERE dr.workspace_id=$1 AND dr.document_id=$2 ${lock ? "FOR UPDATE OF dr,d" : ""}`,
    [workspaceId, documentId],
  );
  const row = found.rows[0];
  if (!row) throw new WorkbenchError("DOCUMENT_NOT_FOUND");
  const parsed = EditorEnvelopeSchema.safeParse(row.content);
  if (!parsed.success) throw new WorkbenchError("WORKBENCH_INVALID_MAPPING");
  return { version: row.version, content: parsed.data, state: row.state };
}
function validText(value: unknown): boolean {
  if (typeof value === "string") {
    if (value.includes("\u0000")) return false;
    for (const character of value) {
      const point = character.codePointAt(0)!;
      if (point >= 0xd800 && point <= 0xdfff) return false;
    }
  } else if (Array.isArray(value)) return value.every(validText);
  else if (value && typeof value === "object")
    return Object.values(value).every(validText);
  return true;
}
function validateMapping(
  input: SaveDocumentWorkbenchRequest,
  sourceManifest: PackSourceManifest[],
  content: EditorEnvelope,
) {
  const checklist = DOCUMENT_CHECKLISTS[input.purpose];
  const ids = new Set<string>();
  for (const entry of input.outline) {
    if (!checklist.some((id) => id === entry.itemId) || ids.has(entry.itemId))
      throw new WorkbenchError("WORKBENCH_INVALID_MAPPING");
    ids.add(entry.itemId);
    if (
      entry.citations.some((citation) => !sourceManifest[citation.sourceIndex])
    )
      throw new WorkbenchError("WORKBENCH_INVALID_MAPPING");
  }
  for (const conflict of input.conflicts)
    if (
      conflict.leftSourceIndex === conflict.rightSourceIndex ||
      !sourceManifest[conflict.leftSourceIndex] ||
      !sourceManifest[conflict.rightSourceIndex]
    )
      throw new WorkbenchError("WORKBENCH_INVALID_MAPPING");
  const blocks = new Map(
    (content.content.content ?? []).map((block) => [
      block.attrs.blockId,
      block,
    ]),
  );
  const claims = new Set<string>();
  for (const claim of input.claims) {
    const block = blocks.get(claim.blockId);
    if (
      !block ||
      claims.has(claim.claimId) ||
      digest(blockText(block)) !== claim.textHash ||
      digest(canonicalEditorBlock(block)) !== claim.blockHash ||
      new Set(claim.sourceIndices).size !== claim.sourceIndices.length ||
      claim.sourceIndices.some((index) => !sourceManifest[index])
    )
      throw new WorkbenchError("WORKBENCH_INVALID_MAPPING");
    claims.add(claim.claimId);
    if (
      (claim.transform === "author_added") !==
      (claim.sourceIndices.length === 0)
    )
      throw new WorkbenchError("WORKBENCH_INVALID_MAPPING");
    if (
      claim.transform === "quote" &&
      !claim.sourceIndices.some((index) =>
        blockText(block).includes(sourceManifest[index]!.text),
      )
    )
      throw new WorkbenchError("WORKBENCH_INVALID_MAPPING");
  }
}
function readiness(
  purpose: SaveDocumentWorkbenchRequest["purpose"],
  outline: SaveDocumentWorkbenchRequest["outline"],
  conflicts: SaveDocumentWorkbenchRequest["conflicts"],
  manifest: PackSourceManifest[],
  states: string[],
) {
  const missingItems: string[] = [],
    authorDraftItems: string[] = [];
  for (const item of DOCUMENT_CHECKLISTS[purpose]) {
    const entry = outline.find((entry) => entry.itemId === item);
    if (!entry) missingItems.push(item);
    else if (
      !entry.citations.some(
        (citation) => states[citation.sourceIndex] === "fresh",
      )
    ) {
      if (entry.authorInterpretation) authorDraftItems.push(item);
      else missingItems.push(item);
    }
  }
  const cited = outline.flatMap((entry) => entry.citations);
  const missingCounterargument =
    purpose === "comparison" &&
    !cited.some(
      (citation) =>
        citation.role === "counterargument" &&
        states[citation.sourceIndex] === "fresh",
    );
  const independentOriginFamilies = [
    ...new Set(
      cited
        .filter((citation) => states[citation.sourceIndex] === "fresh")
        .map((citation) => manifest[citation.sourceIndex]!.originKey),
    ),
  ];
  return {
    status:
      missingItems.length || missingCounterargument
        ? ("needs_material" as const)
        : ("needs_author_review" as const),
    missingItems,
    authorDraftItems,
    missingCounterargument,
    independentOriginFamilies,
    unresolvedConflicts: conflicts,
    reviewRequired: true as const,
  };
}

export class DocumentWorkbenchService {
  constructor(
    private readonly identity: IdentityService,
    private readonly commands: CommandCoordinator,
  ) {}

  async save(input: {
    actorId: string;
    workspaceId: string;
    documentId: string;
    idempotencyKey: string;
    request: SaveDocumentWorkbenchRequest;
    requestId?: string;
  }) {
    if (!UUID.test(input.documentId)) throw new CommandError("INVALID_COMMAND");
    const parsed = SaveDocumentWorkbenchRequestSchema.safeParse(input.request);
    if (!parsed.success || !validText(parsed.data))
      throw new CommandError("INVALID_COMMAND");
    const request = parsed.data;
    const result = await this.commands.execute({
      actorId: input.actorId,
      kind: "workbench.save",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        documentId: input.documentId,
        request,
      },
      apply: async (client, access) => {
        if (input.workspaceId !== access.workspaceId)
          throw new WorkbenchError("DOCUMENT_NOT_FOUND");
        const current = await draft(
          client,
          access.workspaceId,
          input.documentId,
          true,
        );
        if (current.state !== "ACTIVE")
          throw new WorkbenchError("WORKBENCH_INVALID_MAPPING");
        if (current.version !== request.draftVersion)
          throw new CommandError("VERSION_CONFLICT", current.version);
        const pack = await packRevision(
          client,
          access.workspaceId,
          input.documentId,
          request.packId,
          request.packRevision,
        );
        validateMapping(request, pack.manifest.sources, current.content);
        await client.query(
          `INSERT INTO business.document_workbench (workspace_id,document_id)
          VALUES ($1,$2) ON CONFLICT (workspace_id,document_id) DO NOTHING`,
          [access.workspaceId, input.documentId],
        );
        const found = await client.query<{ current_revision: number }>(
          `SELECT current_revision FROM business.document_workbench
           WHERE workspace_id=$1 AND document_id=$2 FOR UPDATE`,
          [access.workspaceId, input.documentId],
        );
        const version = found.rows[0]!.current_revision;
        if (version !== request.baseVersion)
          throw new CommandError("VERSION_CONFLICT", version);
        const next = version + 1;
        await client.query(
          `INSERT INTO business.document_workbench_revision
          (workspace_id,document_id,revision,pack_id,pack_revision,draft_version,purpose,audience,
           outline,claims,source_manifest,created_by_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12)`,
          [
            access.workspaceId,
            input.documentId,
            next,
            request.packId,
            request.packRevision,
            request.draftVersion,
            request.purpose,
            request.audience,
            JSON.stringify({
              entries: request.outline,
              conflicts: request.conflicts,
            }),
            JSON.stringify(request.claims),
            JSON.stringify(pack.manifest.sources),
            input.actorId,
          ],
        );
        await client.query(
          `UPDATE business.document_workbench SET current_revision=$3,updated_at=now()
          WHERE workspace_id=$1 AND document_id=$2`,
          [access.workspaceId, input.documentId, next],
        );
        return {
          response: {
            documentId: input.documentId,
            version: next,
            draftVersion: request.draftVersion,
            packId: request.packId,
            packRevision: request.packRevision,
          },
          audit: {
            action: "WORKBENCH_SAVED",
            targetType: "document_workbench",
            targetId: input.documentId,
            beforeVersion: version,
            afterVersion: next,
            changedFieldNames: ["outline", "claims", "source_manifest"],
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

  async get(actorId: string, workspaceId: string, documentId: string) {
    if (!UUID.test(documentId)) throw new CommandError("INVALID_COMMAND");
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (workspaceId !== access.workspaceId)
          throw new WorkbenchError("DOCUMENT_NOT_FOUND");
        const current = await draft(client, access.workspaceId, documentId);
        const found = await client.query<{
          revision: number;
          pack_id: string;
          pack_revision: number;
          draft_version: number;
          purpose: SaveDocumentWorkbenchRequest["purpose"];
          audience: string;
          outline: unknown;
          claims: unknown;
          source_manifest: unknown;
          created_at: Date;
        }>(
          `SELECT r.revision,r.pack_id,r.pack_revision,r.draft_version,r.purpose,r.audience,
                r.outline,r.claims,r.source_manifest,r.created_at
         FROM business.document_workbench w JOIN business.document_workbench_revision r
           ON r.workspace_id=w.workspace_id AND r.document_id=w.document_id
             AND r.revision=w.current_revision
         WHERE w.workspace_id=$1 AND w.document_id=$2`,
          [access.workspaceId, documentId],
        );
        const row = found.rows[0];
        if (!row) throw new WorkbenchError("WORKBENCH_NOT_FOUND");
        const outline =
          typeof row.outline === "object" &&
          row.outline !== null &&
          "entries" in row.outline &&
          "conflicts" in row.outline
            ? {
                entries: OutlineEntrySchema.array().parse(row.outline.entries),
                conflicts: OutlineConflictSchema.array().parse(
                  row.outline.conflicts,
                ),
              }
            : { entries: [], conflicts: [] };
        const claims = ClaimMappingSchema.array().parse(row.claims);
        const pack = await packRevision(
          client,
          access.workspaceId,
          documentId,
          row.pack_id,
          row.pack_revision,
        );
        const sourceManifest = PackSourceManifestSchema.array().parse(
          row.source_manifest,
        );
        if (!isDeepStrictEqual(sourceManifest, pack.manifest.sources))
          throw new WorkbenchError("WORKBENCH_INVALID_MAPPING");
        const sourceStates: SourceState[] = [];
        for (const source of sourceManifest)
          sourceStates.push(
            await sourceState(client, access.workspaceId, source),
          );
        const blocks = new Map(
          (current.content.content.content ?? []).map((block) => [
            block.attrs.blockId,
            block,
          ]),
        );
        const claimStates = claims.map((claim) => {
          const block = blocks.get(claim.blockId);
          let state = "current";
          if (
            !block ||
            digest(blockText(block)) !== claim.textHash ||
            digest(canonicalEditorBlock(block)) !== claim.blockHash
          )
            state = "needs_remap";
          else if (
            claim.sourceIndices.some(
              (index) => sourceStates[index] === "unresolved",
            )
          )
            state = "source_unresolved";
          else if (
            claim.sourceIndices.some((index) => sourceStates[index] === "stale")
          )
            state = "source_stale";
          return { claimId: claim.claimId, state };
        });
        return {
          documentId,
          version: row.revision,
          draftVersion: row.draft_version,
          currentDraftVersion: current.version,
          packId: row.pack_id,
          packRevision: row.pack_revision,
          purpose: row.purpose,
          audience: row.audience,
          outline: outline.entries,
          conflicts: outline.conflicts,
          claims,
          claimStates,
          sourceStates,
          sourceManifest,
          readiness: readiness(
            row.purpose,
            outline.entries,
            outline.conflicts,
            sourceManifest,
            sourceStates,
          ),
          createdAt: row.created_at.toISOString(),
        };
      },
    );
  }
}
