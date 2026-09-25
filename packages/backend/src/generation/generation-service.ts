import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { EditorEnvelopeSchema } from "@ieum/contracts/editor";
import type { EditorEnvelope } from "@ieum/contracts/editor";
import {
  ApplyGenerationRequestSchema,
  GenerationArtifactSchema,
  GenerationProposalSchema,
  GenerationRequestSchema,
} from "@ieum/contracts/generation";
import type {
  GenerationRequest,
  GenerationProposal,
} from "@ieum/contracts/generation";
import { CommandCoordinator, CommandError } from "../command-coordinator.js";
import { IdentityService } from "../identity-service.js";
import { packRevision } from "../documents/evidence-packs.js";
import {
  lockSourceForFreshness,
  sourceState,
} from "../documents/source-resolver.js";
import {
  buildGenerationInput,
  estimateCost,
  PROMPT_REVISION,
} from "./input.js";
import type { GenerationPolicy } from "./input.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type GenerationErrorCode =
  | "GENERATION_DISABLED"
  | "GENERATION_NOT_FOUND"
  | "GENERATION_SOURCE_UNAVAILABLE"
  | "GENERATION_BUDGET_EXCEEDED"
  | "GENERATION_NOT_READY";
export class GenerationError extends Error {
  constructor(public readonly code: GenerationErrorCode) {
    super(code);
  }
}
interface RequestRow {
  id: string;
  actor_id: string;
  document_id: string;
  pack_id: string;
  pack_revision: number;
  draft_version: number;
  mode: "outline" | "refine" | "draft";
  source_indices: number[];
  target_block_ids: string[];
  state: string;
  retry_count: number;
  error_code: string | null;
  model_id: string;
  prompt_revision: string;
  input_hash: string;
  reserved_cost_microusd: number;
  actual_cost_microusd: number | null;
}
async function currentDraft(
  client: PoolClient,
  wid: string,
  id: string,
  lock = false,
) {
  const { rows } = await client.query<{
    version: number;
    content: unknown;
    state: string;
  }>(
    `SELECT dr.version,dr.content,d.state FROM business.document_draft dr
     JOIN business.document d ON d.workspace_id=dr.workspace_id AND d.id=dr.document_id
     WHERE dr.workspace_id=$1 AND dr.document_id=$2 ${lock ? "FOR UPDATE OF dr,d" : ""}`,
    [wid, id],
  );
  const row = rows[0];
  if (!row) throw new GenerationError("GENERATION_NOT_FOUND");
  const parsed = EditorEnvelopeSchema.safeParse(row.content);
  if (!parsed.success) throw new GenerationError("GENERATION_NOT_READY");
  return { version: row.version, content: parsed.data, state: row.state };
}
async function enabled(client: PoolClient, actorId: string) {
  const result = await client.query<{ external_model_enabled: boolean }>(
    "SELECT external_model_enabled FROM business.user_preference WHERE user_id=$1 FOR SHARE",
    [actorId],
  );
  return result.rows[0]?.external_model_enabled === true;
}
async function requestRow(
  client: PoolClient,
  wid: string,
  id: string,
  documentId: string,
  lock = false,
) {
  const found = await client.query<RequestRow>(
    `SELECT * FROM business.generation_request WHERE workspace_id=$1 AND id=$2 AND document_id=$3 ${lock ? "FOR UPDATE" : ""}`,
    [wid, id, documentId],
  );
  if (!found.rows[0]) throw new GenerationError("GENERATION_NOT_FOUND");
  return found.rows[0];
}
function checkIds(...ids: string[]) {
  if (ids.some((id) => !UUID.test(id)))
    throw new CommandError("INVALID_COMMAND");
}
export class GenerationService {
  constructor(
    private readonly identity: IdentityService,
    private readonly commands: CommandCoordinator,
    private readonly policy: GenerationPolicy | null,
  ) {}
  async request(input: {
    actorId: string;
    workspaceId: string;
    documentId: string;
    idempotencyKey: string;
    request: GenerationRequest;
    requestId?: string;
  }) {
    checkIds(input.documentId);
    const parsed = GenerationRequestSchema.safeParse(input.request);
    if (!parsed.success) throw new CommandError("INVALID_COMMAND");
    if (!this.policy) throw new GenerationError("GENERATION_DISABLED");
    const policy = this.policy;
    const outcome = await this.commands.execute({
      actorId: input.actorId,
      kind: "generation.request",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        documentId: input.documentId,
        request: parsed.data,
      },
      apply: async (client, access) => {
        if (access.workspaceId !== input.workspaceId)
          throw new GenerationError("GENERATION_NOT_FOUND");
        if (!(await enabled(client, input.actorId)))
          throw new GenerationError("GENERATION_DISABLED");
        const draft = await currentDraft(
          client,
          access.workspaceId,
          input.documentId,
          true,
        );
        if (draft.state !== "ACTIVE")
          throw new GenerationError("GENERATION_NOT_READY");
        if (draft.version !== parsed.data.draftVersion)
          throw new CommandError("VERSION_CONFLICT", draft.version);
        const pack = await packRevision(
          client,
          access.workspaceId,
          input.documentId,
          parsed.data.packId,
          parsed.data.packRevision,
        );
        for (const index of parsed.data.sourceIndices) {
          const source = pack.manifest.sources[index];
          if (
            !source ||
            (await sourceState(client, access.workspaceId, source)) !== "fresh"
          )
            throw new GenerationError("GENERATION_SOURCE_UNAVAILABLE");
        }
        let prompt: ReturnType<typeof buildGenerationInput>;
        try {
          prompt = buildGenerationInput(
            parsed.data,
            draft.content,
            pack.manifest.sources,
          );
        } catch {
          throw new CommandError("INVALID_COMMAND");
        }
        const reserved = estimateCost(
          prompt.inputTokenCeiling,
          parsed.data.maxOutputTokens,
          policy,
        );
        if (
          prompt.inputTokenCeiling > parsed.data.maxInputTokens ||
          reserved < 1 ||
          reserved > parsed.data.maxCostMicrousd ||
          reserved > policy.maxJobCostMicrousd
        )
          throw new GenerationError("GENERATION_BUDGET_EXCEEDED");
        const id = randomUUID();
        await client.query(
          `INSERT INTO business.generation_request
          (id,workspace_id,actor_id,document_id,pack_id,pack_revision,draft_version,mode,source_indices,
           target_block_ids,model_id,prompt_revision,input_hash,max_input_tokens,max_output_tokens,
           max_cost_microusd,reserved_cost_microusd)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17)`,
          [
            id,
            access.workspaceId,
            input.actorId,
            input.documentId,
            parsed.data.packId,
            parsed.data.packRevision,
            parsed.data.draftVersion,
            parsed.data.mode,
            JSON.stringify(parsed.data.sourceIndices),
            JSON.stringify(parsed.data.targetBlockIds),
            policy.modelId,
            PROMPT_REVISION,
            prompt.inputHash,
            parsed.data.maxInputTokens,
            parsed.data.maxOutputTokens,
            parsed.data.maxCostMicrousd,
            reserved,
          ],
        );
        return {
          response: { requestId: id, state: "QUEUED" },
          audit: {
            action: "GENERATION_REQUESTED",
            targetType: "generation_request",
            targetId: id,
            beforeVersion: null,
            afterVersion: null,
            changedFieldNames: ["state"],
            ...(input.requestId ? { requestId: input.requestId } : {}),
          },
          outbox: [
            {
              eventType: "generation.requested",
              payloadRef: { requestId: id },
            },
          ],
        };
      },
    });
    return {
      ...outcome.response,
      commandId: outcome.commandId,
      replayed: outcome.replayed,
    };
  }
  async get(
    actorId: string,
    workspaceId: string,
    documentId: string,
    id: string,
  ) {
    checkIds(documentId, id);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new GenerationError("GENERATION_NOT_FOUND");
        const row = await requestRow(
          client,
          access.workspaceId,
          id,
          documentId,
        );
        if (row.actor_id !== actorId)
          throw new GenerationError("GENERATION_NOT_FOUND");
        const result = await client.query<{
          output: unknown;
          diff: unknown;
          input_tokens: number;
          output_tokens: number;
          estimated_cost_microusd: number;
          created_at: Date;
        }>(
          `SELECT output,diff,input_tokens,output_tokens,estimated_cost_microusd,created_at
         FROM business.generation_artifact WHERE workspace_id=$1 AND request_id=$2`,
          [access.workspaceId, id],
        );
        const artifact = result.rows[0];
        return {
          requestId: id,
          documentId,
          state: row.state,
          mode: row.mode,
          packId: row.pack_id,
          packRevision: row.pack_revision,
          draftVersion: row.draft_version,
          sourceIndices: row.source_indices,
          retryCount: row.retry_count,
          errorCode: row.error_code,
          actualCostMicrousd: row.actual_cost_microusd,
          artifact: artifact
            ? GenerationArtifactSchema.parse({
                modelId: row.model_id,
                promptRevision: row.prompt_revision,
                inputHash: row.input_hash,
                packId: row.pack_id,
                packRevision: row.pack_revision,
                draftVersion: row.draft_version,
                proposals: artifact.output,
                diff: artifact.diff,
                inputTokens: artifact.input_tokens,
                outputTokens: artifact.output_tokens,
                estimatedCostMicrousd: artifact.estimated_cost_microusd,
                createdAt: artifact.created_at.toISOString(),
              })
            : null,
        };
      },
    );
  }
  async cancel(input: {
    actorId: string;
    workspaceId: string;
    documentId: string;
    id: string;
    idempotencyKey: string;
    requestId?: string;
  }) {
    checkIds(input.documentId, input.id);
    const outcome = await this.commands.execute({
      actorId: input.actorId,
      kind: "generation.cancel",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        documentId: input.documentId,
        id: input.id,
      },
      apply: async (client, access) => {
        if (access.workspaceId !== input.workspaceId)
          throw new GenerationError("GENERATION_NOT_FOUND");
        const row = await requestRow(
          client,
          access.workspaceId,
          input.id,
          input.documentId,
          true,
        );
        if (row.actor_id !== input.actorId)
          throw new GenerationError("GENERATION_NOT_FOUND");
        const state = ["QUEUED", "RUNNING"].includes(row.state)
          ? "CANCELED"
          : row.state;
        if (state !== row.state)
          await client.query(
            "UPDATE business.generation_request SET state='CANCELED',updated_at=now() WHERE workspace_id=$1 AND id=$2",
            [access.workspaceId, input.id],
          );
        return {
          response: { requestId: input.id, state },
          audit: {
            action: "GENERATION_CANCELED",
            targetType: "generation_request",
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
      ...outcome.response,
      commandId: outcome.commandId,
      replayed: outcome.replayed,
    };
  }
  async apply(input: {
    actorId: string;
    workspaceId: string;
    documentId: string;
    id: string;
    idempotencyKey: string;
    request: { baseDraftVersion: number; proposalIds: string[] };
    requestId?: string;
  }) {
    checkIds(input.documentId, input.id);
    const parsed = ApplyGenerationRequestSchema.safeParse(input.request);
    if (!parsed.success) throw new CommandError("INVALID_COMMAND");
    const outcome = await this.commands.execute({
      actorId: input.actorId,
      kind: "generation.apply",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        documentId: input.documentId,
        id: input.id,
        request: parsed.data,
      },
      apply: async (client, access, commandId) => {
        if (access.workspaceId !== input.workspaceId)
          throw new GenerationError("GENERATION_NOT_FOUND");
        const row = await requestRow(
          client,
          access.workspaceId,
          input.id,
          input.documentId,
          true,
        );
        if (row.actor_id !== input.actorId)
          throw new GenerationError("GENERATION_NOT_FOUND");
        if (row.state !== "SUCCEEDED")
          throw new GenerationError("GENERATION_NOT_READY");
        const prior = await client.query(
          "SELECT 1 FROM business.generation_application WHERE workspace_id=$1 AND request_id=$2 LIMIT 1",
          [access.workspaceId, input.id],
        );
        if (prior.rowCount) throw new GenerationError("GENERATION_NOT_READY");
        const draft = await currentDraft(
          client,
          access.workspaceId,
          input.documentId,
          true,
        );
        if (draft.state !== "ACTIVE")
          throw new GenerationError("GENERATION_NOT_READY");
        if (
          draft.version !== row.draft_version ||
          draft.version !== parsed.data.baseDraftVersion
        )
          throw new CommandError("VERSION_CONFLICT", draft.version);
        const artifact = await client.query<{ output: unknown }>(
          "SELECT output FROM business.generation_artifact WHERE workspace_id=$1 AND request_id=$2",
          [access.workspaceId, input.id],
        );
        const proposals = GenerationProposalSchema.array().safeParse(
          artifact.rows[0]?.output,
        );
        if (!proposals.success)
          throw new GenerationError("GENERATION_NOT_READY");
        const pack = await packRevision(
          client,
          access.workspaceId,
          input.documentId,
          row.pack_id,
          row.pack_revision,
        );
        for (const index of row.source_indices) {
          const source = pack.manifest.sources[index];
          if (!source)
            throw new GenerationError("GENERATION_SOURCE_UNAVAILABLE");
          await lockSourceForFreshness(client, access.workspaceId, source);
          if (
            (await sourceState(client, access.workspaceId, source)) !== "fresh"
          )
            throw new GenerationError("GENERATION_SOURCE_UNAVAILABLE");
        }
        const selected = parsed.data.proposalIds.map((id) =>
          proposals.data.find((item: GenerationProposal) => item.id === id),
        );
        if (selected.some((item) => !item))
          throw new CommandError("INVALID_COMMAND");
        const blocks = [...(draft.content.content.content ?? [])];
        const changed = new Set<string>();
        for (const proposal of selected as GenerationProposal[]) {
          if (proposal.targetBlockId) {
            if (changed.has(proposal.targetBlockId))
              throw new CommandError("INVALID_COMMAND");
            changed.add(proposal.targetBlockId);
            const index = blocks.findIndex(
              (block) => block.attrs.blockId === proposal.targetBlockId,
            );
            if (index < 0) throw new CommandError("INVALID_COMMAND");
            const original = blocks[index]!;
            blocks[index] =
              proposal.kind === "heading"
                ? {
                    type: "heading",
                    attrs: {
                      blockId: proposal.targetBlockId,
                      level:
                        original.type === "heading" ? original.attrs.level : 2,
                    },
                    content: [{ type: "text", text: proposal.text }],
                  }
                : {
                    type: "paragraph",
                    attrs: { blockId: proposal.targetBlockId },
                    content: [{ type: "text", text: proposal.text }],
                  };
          } else {
            const blockId = randomUUID();
            blocks.push(
              proposal.kind === "heading"
                ? {
                    type: "heading",
                    attrs: { blockId, level: 2 },
                    content: [{ type: "text", text: proposal.text }],
                  }
                : {
                    type: "paragraph",
                    attrs: { blockId },
                    content: [{ type: "text", text: proposal.text }],
                  },
            );
            changed.add(blockId);
          }
        }
        const next: EditorEnvelope = EditorEnvelopeSchema.parse({
          schemaVersion: 1,
          content: { type: "doc", content: blocks },
        });
        if (Buffer.byteLength(JSON.stringify(next)) > 200_000)
          throw new CommandError("INVALID_COMMAND");
        await client.query(
          "UPDATE business.document_draft SET version=version+1,content=$3::jsonb,updated_at=now() WHERE workspace_id=$1 AND document_id=$2",
          [access.workspaceId, input.documentId, JSON.stringify(next)],
        );
        await client.query(
          "UPDATE business.document SET updated_at=now() WHERE workspace_id=$1 AND id=$2",
          [access.workspaceId, input.documentId],
        );
        for (const proposal of selected as GenerationProposal[])
          await client.query(
            `INSERT INTO business.generation_application
          (workspace_id,request_id,proposal_id,command_id,document_id,base_draft_version,resulting_draft_version)
          VALUES($1,$2,$3,$4,$5,$6,$7)`,
            [
              access.workspaceId,
              input.id,
              proposal.id,
              commandId,
              input.documentId,
              draft.version,
              draft.version + 1,
            ],
          );
        return {
          response: {
            documentId: input.documentId,
            draftVersion: draft.version + 1,
            appliedProposalIds: parsed.data.proposalIds,
            recheckBlockIds: [...changed],
          },
          audit: {
            action: "GENERATION_APPLIED",
            targetType: "document",
            targetId: input.documentId,
            beforeVersion: draft.version,
            afterVersion: draft.version + 1,
            changedFieldNames: ["content"],
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
}
