import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { EditorEnvelopeSchema } from "@ieum/contracts/editor";
import { ModelGenerationOutputSchema } from "@ieum/contracts/generation";
import type { GenerationProposal } from "@ieum/contracts/generation";
import { withActivePersonalWorkspace } from "../identity-service.js";
import { packRevision } from "../documents/evidence-packs.js";
import { sourceState } from "../documents/source-resolver.js";
import { withWorkspaceTransaction } from "../platform/database/scope.js";
import type { OutboxJobRef } from "../platform/jobs/outbox.js";
import {
  buildGenerationInput,
  estimateCost,
  PROMPT_REVISION,
} from "./input.js";
import type { GenerationPolicy } from "./input.js";
import { GenerationProviderError } from "./openai-provider.js";
import type { GenerationProvider } from "./openai-provider.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type State =
  "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "STALE";
interface Row {
  id: string;
  actor_id: string;
  document_id: string;
  pack_id: string;
  pack_revision: number;
  draft_version: number;
  mode: "outline" | "refine" | "draft";
  source_indices: number[];
  target_block_ids: string[];
  state: State;
  model_id: string;
  prompt_revision: string;
  input_hash: string;
  max_input_tokens: number;
  max_output_tokens: number;
  max_cost_microusd: number;
  reserved_cost_microusd: number;
}
class Rejected extends Error {
  constructor(
    readonly state: State,
    readonly code: string,
  ) {
    super(code);
  }
}
async function finish(
  pool: Pool,
  wid: string,
  id: string,
  state: State,
  code: string | null,
  cost: number | null = null,
) {
  await withWorkspaceTransaction(pool, wid, async (client) => {
    await client.query(
      `UPDATE business.generation_request SET state=$3,error_code=$4,
      actual_cost_microusd=COALESCE($5,actual_cost_microusd),updated_at=now()
      WHERE workspace_id=$1 AND id=$2 AND state IN ('QUEUED','RUNNING')`,
      [wid, id, state, code, cost],
    );
  });
}
async function active(pool: Pool, row: Row, wid: string, checkDraft = true) {
  return withActivePersonalWorkspace(
    pool,
    row.actor_id,
    async (client, access) => {
      if (access.workspaceId !== wid)
        throw new Rejected("CANCELED", "ACCESS_REVOKED");
      const opt = await client.query<{ external_model_enabled: boolean }>(
        "SELECT external_model_enabled FROM business.user_preference WHERE user_id=$1",
        [row.actor_id],
      );
      if (opt.rows[0]?.external_model_enabled !== true)
        throw new Rejected("CANCELED", "CONSENT_REVOKED");
      const current = await client.query<{ state: State }>(
        "SELECT state FROM business.generation_request WHERE workspace_id=$1 AND id=$2",
        [wid, row.id],
      );
      if (current.rows[0]?.state !== "RUNNING")
        throw new Rejected("CANCELED", "CANCELED");
      const draft = await client.query<{
        version: number;
        content: unknown;
        state: string;
      }>(
        `SELECT dr.version,dr.content,d.state FROM business.document_draft dr JOIN business.document d
       ON d.workspace_id=dr.workspace_id AND d.id=dr.document_id
       WHERE dr.workspace_id=$1 AND dr.document_id=$2`,
        [wid, row.document_id],
      );
      const found = draft.rows[0];
      if (
        !found ||
        found.state !== "ACTIVE" ||
        (checkDraft && found.version !== row.draft_version)
      )
        throw new Rejected("STALE", "DRAFT_CHANGED");
      const parsed = EditorEnvelopeSchema.safeParse(found.content);
      if (!parsed.success) throw new Rejected("STALE", "DRAFT_CHANGED");
      const pack = await packRevision(
        client,
        wid,
        row.document_id,
        row.pack_id,
        row.pack_revision,
      );
      for (const index of row.source_indices) {
        const source = pack.manifest.sources[index];
        if (!source || (await sourceState(client, wid, source)) !== "fresh")
          throw new Rejected("STALE", "SOURCE_CHANGED");
      }
      const prompt = buildGenerationInput(
        {
          mode: row.mode,
          sourceIndices: row.source_indices,
          targetBlockIds: row.target_block_ids,
        },
        parsed.data,
        pack.manifest.sources,
      );
      if (prompt.inputHash !== row.input_hash)
        throw new Rejected("STALE", "INPUT_CHANGED");
      return {
        prompt,
        sources: row.source_indices.map(
          (index) => pack.manifest.sources[index]!,
        ),
      };
    },
  );
}
/** Claims once, releases the transaction, then calls the provider. There is no retry after an attempted call. */
export async function processGenerationJob(
  pool: Pool,
  ref: OutboxJobRef,
  provider: GenerationProvider,
  policy: GenerationPolicy | null,
  signal?: AbortSignal,
): Promise<State> {
  if (!UUID.test(ref.workspaceId) || !UUID.test(ref.outboxId))
    throw new Error("INVALID_JOB_REF");
  const row = await withWorkspaceTransaction(
    pool,
    ref.workspaceId,
    async (client) => {
      const found = await client.query<Row>(
        `SELECT q.* FROM business.command_outbox o
      JOIN business.generation_request q ON q.workspace_id=o.workspace_id
      AND q.id::text=o.payload_ref->>'requestId'
      WHERE o.workspace_id=$1 AND o.id=$2 AND o.event_type='generation.requested'
      FOR UPDATE OF q`,
        [ref.workspaceId, ref.outboxId],
      );
      const request = found.rows[0];
      if (!request || request.state !== "QUEUED") return null;
      await client.query(
        "UPDATE business.generation_request SET state='RUNNING',updated_at=now() WHERE workspace_id=$1 AND id=$2",
        [ref.workspaceId, request.id],
      );
      return request;
    },
  );
  if (!row) return "CANCELED";
  if (
    !policy ||
    row.model_id !== policy.modelId ||
    row.prompt_revision !== PROMPT_REVISION ||
    row.reserved_cost_microusd > policy.maxJobCostMicrousd
  ) {
    await finish(pool, ref.workspaceId, row.id, "FAILED", "POLICY_CHANGED");
    return "FAILED";
  }
  let preflight: Awaited<ReturnType<typeof active>>;
  try {
    preflight = await active(pool, row, ref.workspaceId);
  } catch (error) {
    const rejected =
      error instanceof Rejected
        ? error
        : new Rejected("CANCELED", "ACCESS_REVOKED");
    await finish(pool, ref.workspaceId, row.id, rejected.state, rejected.code);
    return rejected.state;
  }
  if (
    preflight.prompt.inputTokenCeiling > row.max_input_tokens ||
    estimateCost(
      preflight.prompt.inputTokenCeiling,
      row.max_output_tokens,
      policy,
    ) > row.max_cost_microusd
  ) {
    await finish(pool, ref.workspaceId, row.id, "FAILED", "BUDGET_EXCEEDED");
    return "FAILED";
  }
  const abort = new AbortController();
  const onAbort = () => abort.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => abort.abort(), policy.timeoutMs);
  // Poll persisted cancellation/opt-out while the external call is in progress.
  let stopped = false;
  const poll = setInterval(() => {
    if (stopped) return;
    void withWorkspaceTransaction(pool, ref.workspaceId, async (client) => {
      const state = await client.query<{
        state: State;
        external_model_enabled: boolean;
      }>(
        `SELECT q.state,p.external_model_enabled FROM business.generation_request q
         JOIN business.user_preference p ON p.user_id=q.actor_id
         WHERE q.workspace_id=$1 AND q.id=$2`,
        [ref.workspaceId, row.id],
      );
      if (
        state.rows[0]?.state !== "RUNNING" ||
        state.rows[0]?.external_model_enabled !== true
      )
        abort.abort();
    }).catch(() => abort.abort());
  }, 1000);
  let result: Awaited<ReturnType<GenerationProvider["generate"]>>;
  try {
    result = await provider.generate({
      modelId: row.model_id,
      serialized: preflight.prompt.serialized,
      maxOutputTokens: row.max_output_tokens,
      signal: abort.signal,
    });
  } catch (error) {
    const code = abort.signal.aborted
      ? "PROVIDER_TIMEOUT_OR_CANCELED"
      : error instanceof GenerationProviderError
        ? error.code
        : "PROVIDER_UNAVAILABLE";
    await finish(pool, ref.workspaceId, row.id, "FAILED", code);
    return "FAILED";
  } finally {
    stopped = true;
    clearInterval(poll);
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  const cost = estimateCost(result.inputTokens, result.outputTokens, policy);
  if (abort.signal.aborted) {
    await finish(pool, ref.workspaceId, row.id, "CANCELED", "CANCELED", cost);
    return "CANCELED";
  }
  const checked = ModelGenerationOutputSchema.safeParse(result.output);
  const allowed = new Set(row.source_indices);
  if (
    !checked.success ||
    result.inputTokens < 0 ||
    result.outputTokens < 0 ||
    result.outputTokens > row.max_output_tokens ||
    result.inputTokens > row.max_input_tokens ||
    checked.data.items.some(
      (item) =>
        item.sourceIndices.some((index) => !allowed.has(index)) ||
        (row.mode === "refine"
          ? !item.targetBlockId ||
            !row.target_block_ids.includes(item.targetBlockId)
          : item.targetBlockId !== null),
    )
  ) {
    await finish(
      pool,
      ref.workspaceId,
      row.id,
      "FAILED",
      "INVALID_PROVIDER_OUTPUT",
      cost,
    );
    return "FAILED";
  }
  if (cost > row.max_cost_microusd || cost > policy.maxJobCostMicrousd) {
    await finish(
      pool,
      ref.workspaceId,
      row.id,
      "FAILED",
      "BUDGET_EXCEEDED",
      cost,
    );
    return "FAILED";
  }
  let postflight: Awaited<ReturnType<typeof active>>;
  try {
    postflight = await active(pool, row, ref.workspaceId);
  } catch (error) {
    const rejected =
      error instanceof Rejected
        ? error
        : new Rejected("CANCELED", "ACCESS_REVOKED");
    await finish(
      pool,
      ref.workspaceId,
      row.id,
      rejected.state,
      rejected.code,
      cost,
    );
    return rejected.state;
  }
  const proposals: GenerationProposal[] = checked.data.items.map((item) => ({
    id: randomUUID(),
    ...item,
    reviewRequired: true,
  }));
  const diff = proposals.map((item) => ({
    proposalId: item.id,
    targetBlockId: item.targetBlockId,
    beforeText: item.targetBlockId
      ? (postflight.prompt.beforeByBlock.get(item.targetBlockId) ?? null)
      : null,
    afterText: item.text,
  }));
  try {
    await withActivePersonalWorkspace(
      pool,
      row.actor_id,
      async (client, access) => {
        if (access.workspaceId !== ref.workspaceId)
          throw new Rejected("CANCELED", "ACCESS_REVOKED");
        const status = await client.query<{
          state: State;
          external_model_enabled: boolean;
          version: number;
        }>(
          `SELECT q.state,p.external_model_enabled,dr.version FROM business.generation_request q
         JOIN business.user_preference p ON p.user_id=q.actor_id
         JOIN business.document_draft dr ON dr.workspace_id=q.workspace_id AND dr.document_id=q.document_id
         WHERE q.workspace_id=$1 AND q.id=$2 FOR UPDATE OF q,dr`,
          [ref.workspaceId, row.id],
        );
        const latest = status.rows[0];
        if (
          !latest ||
          latest.state !== "RUNNING" ||
          !latest.external_model_enabled
        )
          throw new Rejected("CANCELED", "CANCELED");
        if (latest.version !== row.draft_version)
          throw new Rejected("STALE", "DRAFT_CHANGED");
        let pack;
        try {
          pack = await packRevision(
            client,
            ref.workspaceId,
            row.document_id,
            row.pack_id,
            row.pack_revision,
          );
        } catch {
          throw new Rejected("STALE", "SOURCE_CHANGED");
        }
        for (const index of row.source_indices) {
          const source = pack.manifest.sources[index];
          if (
            !source ||
            (await sourceState(client, ref.workspaceId, source)) !== "fresh"
          )
            throw new Rejected("STALE", "SOURCE_CHANGED");
        }
        await client.query(
          `INSERT INTO business.generation_artifact
        (workspace_id,request_id,output,diff,source_manifest,input_hash,input_tokens,output_tokens,estimated_cost_microusd)
        VALUES($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7,$8,$9)`,
          [
            ref.workspaceId,
            row.id,
            JSON.stringify(proposals),
            JSON.stringify(diff),
            JSON.stringify(postflight.sources),
            row.input_hash,
            result.inputTokens,
            result.outputTokens,
            cost,
          ],
        );
        await client.query(
          "UPDATE business.generation_request SET state='SUCCEEDED',actual_cost_microusd=$3,updated_at=now() WHERE workspace_id=$1 AND id=$2",
          [ref.workspaceId, row.id, cost],
        );
      },
    );
  } catch (error) {
    const rejected =
      error instanceof Rejected
        ? error
        : new Rejected("FAILED", "PERSISTENCE_FAILED");
    await finish(
      pool,
      ref.workspaceId,
      row.id,
      rejected.state,
      rejected.code,
      cost,
    );
    return rejected.state;
  }
  return "SUCCEEDED";
}

/** A crashed worker never retries a possibly billed call; old claims become terminal. */
export async function reconcileAbandonedGeneration(
  pool: Pool,
  afterWorkspaceId: string | null = null,
): Promise<string | null> {
  const workspaces = await pool.query<{ personal_workspace_id: string }>(
    `SELECT personal_workspace_id FROM business.user_access
     WHERE $1::uuid IS NULL OR personal_workspace_id > $1::uuid
     ORDER BY personal_workspace_id LIMIT 200`,
    [afterWorkspaceId],
  );
  for (const row of workspaces.rows) {
    await withWorkspaceTransaction(pool, row.personal_workspace_id, (client) =>
      client.query(
        `UPDATE business.generation_request
         SET state='FAILED',error_code='WORKER_INTERRUPTED',updated_at=now()
         WHERE workspace_id=$1 AND state='RUNNING'
           AND updated_at < now() - interval '5 minutes'`,
        [row.personal_workspace_id],
      ),
    );
  }
  return workspaces.rows.length === 200
    ? workspaces.rows[199]!.personal_workspace_id
    : null;
}
