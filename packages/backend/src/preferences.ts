import { CommandCoordinator, CommandError } from "./command-coordinator.js";
import type { CommandOutcome } from "./command-coordinator.js";

export class PreferenceCommands {
  constructor(private readonly commands: CommandCoordinator) {}

  async setTimeZone(input: {
    actorId: string;
    idempotencyKey: string;
    baseVersion: number;
    timeZone: string;
    requestId?: string;
  }): Promise<CommandOutcome> {
    if (
      !Number.isSafeInteger(input.baseVersion) ||
      input.baseVersion < 1 ||
      input.timeZone.length > 100 ||
      !input.timeZone.trim()
    ) {
      throw new CommandError("INVALID_COMMAND");
    }
    try {
      new Intl.DateTimeFormat("en", { timeZone: input.timeZone });
    } catch {
      throw new CommandError("INVALID_COMMAND");
    }
    return this.commands.execute({
      actorId: input.actorId,
      kind: "preference.time_zone.update",
      idempotencyKey: input.idempotencyKey,
      payload: { baseVersion: input.baseVersion, timeZone: input.timeZone },
      apply: async (client) => {
        const current = await client.query<{ version: number }>(
          "SELECT version FROM business.user_preference WHERE user_id = $1 FOR UPDATE",
          [input.actorId],
        );
        if (!current.rows[0]) throw new CommandError("INVALID_COMMAND");
        if (current.rows[0].version !== input.baseVersion) {
          throw new CommandError("VERSION_CONFLICT", current.rows[0].version);
        }
        const updated = await client.query<{
          time_zone: string;
          external_model_enabled: boolean;
          version: number;
        }>(
          `UPDATE business.user_preference
           SET time_zone = $2, version = version + 1, updated_at = now()
           WHERE user_id = $1 AND version = $3
           RETURNING time_zone, external_model_enabled, version`,
          [input.actorId, input.timeZone, input.baseVersion],
        );
        if (!updated.rows[0]) throw new CommandError("VERSION_CONFLICT");
        return {
          response: {
            timeZone: updated.rows[0].time_zone,
            externalModelEnabled: updated.rows[0].external_model_enabled,
            version: updated.rows[0].version,
          },
          audit: {
            action: "preference.time_zone.update",
            targetType: "user_preference",
            targetId: input.actorId,
            beforeVersion: input.baseVersion,
            afterVersion: updated.rows[0].version,
            changedFieldNames: ["time_zone"],
            ...(input.requestId ? { requestId: input.requestId } : {}),
          },
        };
      },
    });
  }

  async setExternalModelEnabled(input: {
    actorId: string;
    idempotencyKey: string;
    baseVersion: number;
    externalModelEnabled: boolean;
    requestId?: string;
  }): Promise<CommandOutcome> {
    if (
      !Number.isSafeInteger(input.baseVersion) ||
      input.baseVersion < 1 ||
      typeof input.externalModelEnabled !== "boolean"
    )
      throw new CommandError("INVALID_COMMAND");
    return this.commands.execute({
      actorId: input.actorId,
      kind: "preference.external_model.update",
      idempotencyKey: input.idempotencyKey,
      payload: {
        baseVersion: input.baseVersion,
        externalModelEnabled: input.externalModelEnabled,
      },
      apply: async (client) => {
        const current = await client.query<{ version: number }>(
          "SELECT version FROM business.user_preference WHERE user_id=$1 FOR UPDATE",
          [input.actorId],
        );
        if (!current.rows[0]) throw new CommandError("INVALID_COMMAND");
        if (current.rows[0].version !== input.baseVersion)
          throw new CommandError("VERSION_CONFLICT", current.rows[0].version);
        const updated = await client.query<{
          time_zone: string;
          external_model_enabled: boolean;
          version: number;
        }>(
          `UPDATE business.user_preference
           SET external_model_enabled=$2,version=version+1,updated_at=now()
           WHERE user_id=$1 AND version=$3
           RETURNING time_zone,external_model_enabled,version`,
          [input.actorId, input.externalModelEnabled, input.baseVersion],
        );
        if (!updated.rows[0]) throw new CommandError("VERSION_CONFLICT");
        return {
          response: {
            timeZone: updated.rows[0].time_zone,
            externalModelEnabled: updated.rows[0].external_model_enabled,
            version: updated.rows[0].version,
          },
          audit: {
            action: "preference.external_model.update",
            targetType: "user_preference",
            targetId: input.actorId,
            beforeVersion: input.baseVersion,
            afterVersion: updated.rows[0].version,
            changedFieldNames: ["external_model_enabled"],
            ...(input.requestId ? { requestId: input.requestId } : {}),
          },
        };
      },
    });
  }
}
