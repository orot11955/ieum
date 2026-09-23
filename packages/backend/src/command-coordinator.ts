import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { IdentityService, PersonalAccess } from "./identity-service.js";

export type CommandErrorCode =
  "INVALID_COMMAND" | "IDEMPOTENCY_CONFLICT" | "VERSION_CONFLICT";

export class CommandError extends Error {
  constructor(
    public readonly code: CommandErrorCode,
    public readonly currentVersion?: number,
  ) {
    super(code);
  }
}

export interface CommandAudit {
  action: string;
  targetType: string;
  targetId: string;
  beforeVersion: number | null;
  afterVersion: number | null;
  changedFieldNames: string[];
  requestId?: string;
}

export interface CommandOutboxEvent {
  eventType: string;
  payloadRef: Record<string, unknown>;
}

export interface CommandEffect {
  response: Record<string, unknown>;
  audit: CommandAudit;
  outbox?: CommandOutboxEvent[];
}

export interface CommandInput {
  actorId: string;
  kind: string;
  idempotencyKey: string;
  payload: unknown;
  apply: (
    client: PoolClient,
    access: PersonalAccess,
    commandId: string,
  ) => Promise<CommandEffect>;
}

export interface CommandOutcome {
  commandId: string;
  replayed: boolean;
  response: Record<string, unknown>;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (
    typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  ) {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  throw new CommandError("INVALID_COMMAND");
}

function sqlState(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

/** Executes DB-only command effects. Callbacks must not perform external I/O. */
export class CommandCoordinator {
  constructor(private readonly identity: IdentityService) {}

  async execute(input: CommandInput): Promise<CommandOutcome> {
    if (
      !/^[a-z][a-z0-9_.-]{1,99}$/.test(input.kind) ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey)
    ) {
      throw new CommandError("INVALID_COMMAND");
    }
    const canonical = canonicalJson(input.payload);
    if (Buffer.byteLength(canonical) > 262_144)
      throw new CommandError("INVALID_COMMAND");
    const payloadHash = createHash("sha256").update(canonical).digest("hex");

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.identity.withPersonalWorkspace(
          input.actorId,
          async (client, access) => {
            const lockKey = JSON.stringify([
              access.workspaceId,
              input.actorId,
              input.kind,
              input.idempotencyKey,
            ]);
            await client.query(
              "SELECT pg_advisory_xact_lock(hashtextextended($1, 5805))",
              [lockKey],
            );
            const previous = await client.query<{
              command_id: string;
              payload_hash: string;
              response: Record<string, unknown>;
            }>(
              `SELECT command_id, payload_hash, response
               FROM business.command_receipt
               WHERE workspace_id = $1 AND actor_id = $2
                 AND kind = $3 AND idempotency_key = $4`,
              [
                access.workspaceId,
                input.actorId,
                input.kind,
                input.idempotencyKey,
              ],
            );
            if (previous.rows[0]) {
              if (previous.rows[0].payload_hash !== payloadHash)
                throw new CommandError("IDEMPOTENCY_CONFLICT");
              return {
                commandId: previous.rows[0].command_id,
                replayed: true,
                response: previous.rows[0].response,
              };
            }

            const commandId = randomUUID();
            const effect = await input.apply(client, access, commandId);
            // Reject values that cannot be stored as JSON before inserting any
            // receipt/audit rows. The entire transaction rolls back on failure.
            canonicalJson(effect.response);
            for (const event of effect.outbox ?? [])
              canonicalJson(event.payloadRef);
            await client.query(
              `INSERT INTO business.command_receipt
               (workspace_id, actor_id, kind, idempotency_key, command_id, payload_hash, response)
               VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
              [
                access.workspaceId,
                input.actorId,
                input.kind,
                input.idempotencyKey,
                commandId,
                payloadHash,
                JSON.stringify(effect.response),
              ],
            );
            await client.query(
              `INSERT INTO business.command_audit
               (workspace_id, command_id, actor_id, action, target_type, target_id,
                before_version, after_version, changed_field_names, request_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                access.workspaceId,
                commandId,
                input.actorId,
                effect.audit.action,
                effect.audit.targetType,
                effect.audit.targetId,
                effect.audit.beforeVersion,
                effect.audit.afterVersion,
                effect.audit.changedFieldNames,
                effect.audit.requestId ?? null,
              ],
            );
            for (const event of effect.outbox ?? []) {
              await client.query(
                `INSERT INTO business.command_outbox
                 (workspace_id, command_id, event_type, payload_ref)
                 VALUES ($1, $2, $3, $4::jsonb)`,
                [
                  access.workspaceId,
                  commandId,
                  event.eventType,
                  JSON.stringify(event.payloadRef),
                ],
              );
            }
            return { commandId, replayed: false, response: effect.response };
          },
        );
      } catch (error) {
        if (
          attempt === 2 ||
          !["40P01", "40001"].includes(sqlState(error) ?? "")
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
      }
    }
    throw new Error("Command retry loop exhausted");
  }
}
