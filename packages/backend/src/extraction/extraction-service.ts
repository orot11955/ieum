import { createHash, randomUUID } from "node:crypto";
import { prepareExtractCommand, validateExtractProposals } from "@ieum/core";
import type {
  CaptureRevision,
  ExtractProposal,
  RawExtractCandidate,
} from "@ieum/core";
import type { PoolClient } from "pg";
import { insertExtractedEventInTransaction } from "../calendar.js";
import type { EventSchedule } from "../calendar.js";
import { resolveLocalTime, startOfLocalDate } from "../calendar-time.js";
import { CommandCoordinator, CommandError } from "../command-coordinator.js";
import type { CommandOutcome } from "../command-coordinator.js";
import { IdentityService } from "../identity-service.js";
import { insertExtractedTaskInTransaction } from "../tasks.js";
import { LocalExtractionParser } from "./parser.js";
import type { ExtractionParser } from "./parser.js";

export type ExtractionErrorCode =
  | "EXTRACTION_NOT_FOUND"
  | "EXTRACTION_STALE"
  | "EXTRACTION_DUPLICATE"
  | "EXTRACTION_DECIDED"
  | "EXTRACTION_UNRESOLVED"
  | "EXTRACTION_PARSER_UNAVAILABLE";
export class ExtractionError extends Error {
  constructor(public readonly code: ExtractionErrorCode) {
    super(code);
  }
}

const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha = /^[a-f0-9]{64}$/;
interface SourceRow {
  state: string;
  current_revision: number;
  origin_key: string;
  raw_body: string;
  recorded_at: Date;
}
interface CandidateRow {
  id: string;
  capture_id: string;
  capture_revision: number;
  decision_key: string;
  target_kind: string;
  payload: ExtractProposal;
  state: "CANDIDATE" | "ACCEPTED" | "REJECTED";
  target_id: string | null;
}

function validId(value: string, pattern: RegExp): void {
  if (!pattern.test(value)) throw new CommandError("INVALID_COMMAND");
}
function normalizedTitle(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, "").trim();
}
function similarTitle(left: string, right: string): boolean {
  const a = normalizedTitle(left),
    b = normalizedTitle(right);
  return (
    a.length >= 4 &&
    b.length >= 4 &&
    (a === b ||
      (Math.min(a.length, b.length) / Math.max(a.length, b.length) >= 0.7 &&
        (a.includes(b) || b.includes(a))))
  );
}
async function currentSource(
  client: PoolClient,
  workspaceId: string,
  captureId: string,
  lock: boolean,
): Promise<SourceRow> {
  const result = await client.query<SourceRow>(
    `SELECT c.state,c.current_revision,c.origin_key,r.raw_body,r.recorded_at
     FROM business.capture c JOIN business.capture_revision r
       ON r.workspace_id=c.workspace_id AND r.capture_id=c.id
      AND r.revision=c.current_revision
     WHERE c.workspace_id=$1 AND c.id=$2${lock ? " FOR SHARE OF c" : ""}`,
    [workspaceId, captureId],
  );
  const source = result.rows[0];
  if (!source || source.state !== "ACTIVE")
    throw new ExtractionError("EXTRACTION_NOT_FOUND");
  return source;
}
function captureModel(
  workspaceId: string,
  captureId: string,
  row: SourceRow,
): CaptureRevision {
  return {
    workspaceId,
    captureId,
    revision: row.current_revision,
    rawBody: row.raw_body,
    originKey: row.origin_key,
    recordedAt: row.recorded_at.getTime(),
    occurredAt: null,
  };
}
async function candidate(
  client: PoolClient,
  workspaceId: string,
  id: string,
  lock: boolean,
): Promise<CandidateRow> {
  const found = await client.query<CandidateRow>(
    `SELECT id,capture_id,capture_revision,decision_key,target_kind,payload,state,target_id
     FROM business.extraction_candidate WHERE workspace_id=$1 AND id=$2${lock ? " FOR UPDATE" : ""}`,
    [workspaceId, id],
  );
  if (!found.rows[0]) throw new ExtractionError("EXTRACTION_NOT_FOUND");
  return found.rows[0];
}

/** Parser work runs after the authorized snapshot transaction has ended. */
export class ExtractionService {
  constructor(
    private readonly identity: IdentityService,
    private readonly commands: CommandCoordinator,
    private readonly parser: ExtractionParser = new LocalExtractionParser(),
    private readonly parserTimeoutMs = 5_000,
  ) {}

  async generate(input: {
    actorId: string;
    workspaceId: string;
    captureId: string;
    idempotencyKey: string;
  }): Promise<CommandOutcome> {
    validId(input.captureId, uuid);
    const source = await this.identity.withPersonalWorkspace(
      input.actorId,
      async (client, access) => {
        if (access.workspaceId !== input.workspaceId)
          throw new ExtractionError("EXTRACTION_NOT_FOUND");
        return captureModel(
          access.workspaceId,
          input.captureId,
          await currentSource(
            client,
            access.workspaceId,
            input.captureId,
            false,
          ),
        );
      },
    );
    let raw: unknown;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      raw = await Promise.race([
        this.parser.parse(source),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("parser timeout")),
            this.parserTimeoutMs,
          );
        }),
      ]);
      if (typeof raw === "string") raw = JSON.parse(raw) as unknown;
      if (!Array.isArray(raw) || raw.length > 50)
        throw new TypeError("invalid parser response");
    } catch {
      throw new ExtractionError("EXTRACTION_PARSER_UNAVAILABLE");
    } finally {
      if (timer) clearTimeout(timer);
    }
    let proposals: readonly ExtractProposal[];
    try {
      proposals = validateExtractProposals(
        source,
        raw as RawExtractCandidate[],
        [],
        digest,
      ).filter((item) => item.targetKind !== "context");
    } catch {
      throw new ExtractionError("EXTRACTION_PARSER_UNAVAILABLE");
    }
    return this.commands.execute({
      actorId: input.actorId,
      kind: "extraction.generate",
      idempotencyKey: input.idempotencyKey,
      payload: {
        workspaceId: input.workspaceId,
        captureId: input.captureId,
        revision: source.revision,
        proposalIds: proposals.map((item) => item.proposalId),
      },
      apply: async (client, access) => {
        if (access.workspaceId !== input.workspaceId)
          throw new ExtractionError("EXTRACTION_NOT_FOUND");
        const live = await currentSource(
          client,
          access.workspaceId,
          input.captureId,
          true,
        );
        if (live.current_revision !== source.revision)
          throw new ExtractionError("EXTRACTION_STALE");
        const candidateIds: string[] = [];
        for (const item of proposals) {
          await client.query(
            `INSERT INTO business.extraction_candidate
             (id,workspace_id,capture_id,capture_revision,decision_key,target_kind,payload,created_by_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
             ON CONFLICT DO NOTHING`,
            [
              item.proposalId,
              access.workspaceId,
              input.captureId,
              source.revision,
              item.decisionKey,
              item.targetKind,
              JSON.stringify(item),
              input.actorId,
            ],
          );
          const stored = await client.query<{ id: string }>(
            `SELECT id FROM business.extraction_candidate WHERE workspace_id=$1
             AND capture_id=$2 AND capture_revision=$3 AND decision_key=$4`,
            [
              access.workspaceId,
              input.captureId,
              source.revision,
              item.decisionKey,
            ],
          );
          if (stored.rows[0]) candidateIds.push(stored.rows[0].id);
        }
        return {
          response: {
            captureId: input.captureId,
            captureRevision: source.revision,
            candidateIds,
          },
          audit: {
            action: "extraction.generate",
            targetType: "capture",
            targetId: input.captureId,
            beforeVersion: source.revision,
            afterVersion: source.revision,
            changedFieldNames: ["extraction_candidates"],
          },
        };
      },
    });
  }

  async get(actorId: string, workspaceId: string, proposalId: string) {
    validId(proposalId, sha);
    return this.identity.withPersonalWorkspace(
      actorId,
      async (client, access) => {
        if (access.workspaceId !== workspaceId)
          throw new ExtractionError("EXTRACTION_NOT_FOUND");
        const row = await candidate(
          client,
          access.workspaceId,
          proposalId,
          false,
        );
        const live = await currentSource(
          client,
          access.workspaceId,
          row.capture_id,
          false,
        );
        const earlier = await client.query<{
          target_kind: string;
          target_id: string;
          state: string;
          decision_key: string;
          payload: ExtractProposal;
        }>(
          `SELECT ec.target_kind,ec.target_id,ec.decision_key,ec.payload,
                COALESCE(t.state,'') AS state
         FROM business.extraction_candidate ec
         LEFT JOIN business.task t ON t.workspace_id=ec.workspace_id AND t.id=ec.target_id
         WHERE ec.workspace_id=$1 AND ec.capture_id=$2 AND ec.state='ACCEPTED'
           AND ec.id<>$3 ORDER BY ec.created_at DESC LIMIT 50`,
          [access.workspaceId, row.capture_id, row.id],
        );
        return {
          proposalId: row.id,
          state: row.state,
          targetId: row.target_id,
          proposal: row.payload,
          sourceStale: live.current_revision !== row.capture_revision,
          priorTargets: earlier.rows
            .filter(
              (x) =>
                x.decision_key === row.decision_key ||
                similarTitle(
                  x.payload.suggestedTitle,
                  row.payload.suggestedTitle,
                ),
            )
            .slice(0, 3)
            .map((x) => ({
              kind: x.target_kind,
              id: x.target_id,
              state: x.state || null,
              match:
                x.decision_key === row.decision_key
                  ? "EXACT_SOURCE"
                  : "SIMILAR_TITLE",
            })),
        };
      },
    );
  }

  async decide(input: {
    actorId: string;
    workspaceId: string;
    proposalId: string;
    expectedCaptureRevision: number;
    decision: "ACCEPTED" | "REJECTED";
    title?: string;
    body?: string | null;
    schedule?: EventSchedule;
    idempotencyKey: string;
  }): Promise<CommandOutcome> {
    validId(input.proposalId, sha);
    if (
      !Number.isSafeInteger(input.expectedCaptureRevision) ||
      input.expectedCaptureRevision < 1
    )
      throw new CommandError("INVALID_COMMAND");
    return this.commands.execute({
      actorId: input.actorId,
      kind: `extraction.${input.decision.toLowerCase()}`,
      idempotencyKey: input.idempotencyKey,
      payload: input,
      apply: async (client, access) => {
        if (access.workspaceId !== input.workspaceId)
          throw new ExtractionError("EXTRACTION_NOT_FOUND");
        const row = await candidate(
          client,
          access.workspaceId,
          input.proposalId,
          true,
        );
        if (row.state !== "CANDIDATE")
          throw new ExtractionError("EXTRACTION_DECIDED");
        const source = await currentSource(
          client,
          access.workspaceId,
          row.capture_id,
          true,
        );
        if (
          row.capture_revision !== source.current_revision ||
          row.capture_revision !== input.expectedCaptureRevision
        )
          throw new ExtractionError("EXTRACTION_STALE");
        const prior = await client.query<{ target_id: string; state: string }>(
          `SELECT ec.target_id,COALESCE(t.state,'') AS state
           FROM business.extraction_candidate ec
           LEFT JOIN business.task t ON t.workspace_id=ec.workspace_id AND t.id=ec.target_id
           WHERE ec.workspace_id=$1 AND ec.decision_key=$2 AND ec.state='ACCEPTED'
             AND ec.id<>$3 FOR SHARE OF ec`,
          [access.workspaceId, row.decision_key, row.id],
        );
        if (input.decision === "ACCEPTED" && prior.rows.length)
          throw new ExtractionError("EXTRACTION_DUPLICATE");
        if (input.decision === "REJECTED") {
          await client.query(
            "UPDATE business.extraction_candidate SET state='REJECTED',decided_at=now() WHERE workspace_id=$1 AND id=$2",
            [access.workspaceId, row.id],
          );
          return {
            response: { proposalId: row.id, state: "REJECTED", targetId: null },
            audit: {
              action: "extraction.reject",
              targetType: "extraction_candidate",
              targetId: row.id,
              beforeVersion: null,
              afterVersion: null,
              changedFieldNames: ["state"],
            },
          };
        }
        if (!input.title || input.title.trim().length === 0)
          throw new ExtractionError("EXTRACTION_UNRESOLVED");
        const body = input.body ?? null;
        const startEpochMs = input.schedule
          ? Date.parse(
              input.schedule.kind === "TIMED"
                ? resolveLocalTime(
                    input.schedule.startLocal,
                    input.schedule.timeZone,
                    input.schedule.startOffsetMinutes,
                  ).at
                : startOfLocalDate(
                    input.schedule.startDate,
                    input.schedule.timeZone,
                  ),
            )
          : null;
        try {
          prepareExtractCommand(row.payload, {
            proposalId: row.id,
            currentCaptureRevision: source.current_revision,
            authorized: true,
            alreadyCompletedTask: prior.rows.some((x) => x.state === "DONE"),
            title: input.title,
            body,
            startEpochMs,
            timeZone: input.schedule?.timeZone ?? null,
          });
        } catch {
          throw new ExtractionError("EXTRACTION_UNRESOLVED");
        }
        if (row.target_kind === "event" && !input.schedule)
          throw new ExtractionError("EXTRACTION_UNRESOLVED");
        if (row.target_kind !== "event" && input.schedule)
          throw new CommandError("INVALID_COMMAND");
        const unitId = randomUUID();
        const origin = row.payload.origin;
        await client.query(
          `INSERT INTO business.thought_unit
           (id,workspace_id,capture_id,capture_revision,origin_key)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            unitId,
            access.workspaceId,
            origin.captureId,
            origin.revision,
            origin.originKey,
          ],
        );
        await client.query(
          `INSERT INTO business.thought_unit_revision
           (workspace_id,unit_id,revision,capture_id,capture_revision,
            source_start,source_end,content_kind,content_text)
           VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8)`,
          [
            access.workspaceId,
            unitId,
            origin.captureId,
            origin.revision,
            origin.sourceSpan.start,
            origin.sourceSpan.end,
            row.target_kind === "thought_unit" ? "paraphrase" : "quote",
            row.target_kind === "thought_unit"
              ? `${input.title}${body ? `\n${body}` : ""}`
              : origin.sourceText,
          ],
        );
        await client.query(
          "UPDATE business.capture SET unit_set_version=unit_set_version+1,updated_at=now() WHERE workspace_id=$1 AND id=$2",
          [access.workspaceId, origin.captureId],
        );
        let targetId: string = unitId;
        if (row.target_kind === "task") {
          targetId = await insertExtractedTaskInTransaction(client, {
            workspaceId: access.workspaceId,
            actorId: input.actorId,
            title: input.title,
            description: body ?? "",
            originUnitId: unitId,
          });
        } else if (row.target_kind === "event") {
          targetId = await insertExtractedEventInTransaction(client, {
            workspaceId: access.workspaceId,
            actorId: input.actorId,
            title: input.title,
            description: body ?? "",
            schedule: input.schedule!,
          });
        }
        await client.query(
          `UPDATE business.extraction_candidate SET state='ACCEPTED',target_id=$3,decided_at=now()
           WHERE workspace_id=$1 AND id=$2`,
          [access.workspaceId, row.id, targetId],
        );
        return {
          response: {
            proposalId: row.id,
            state: "ACCEPTED",
            targetKind: row.target_kind,
            targetId,
            sourceUnitId: unitId,
          },
          audit: {
            action: "extraction.accept",
            targetType: row.target_kind,
            targetId,
            beforeVersion: null,
            afterVersion: 1,
            changedFieldNames: ["source", "title", "body", "schedule"],
          },
          outbox: [
            {
              eventType: "extraction.accepted",
              payloadRef: {
                workspaceId: access.workspaceId,
                candidateId: row.id,
                targetKind: row.target_kind,
                targetId,
              },
            },
          ],
        };
      },
    });
  }
}
