import type { Pool } from "pg";
import type { PgBoss } from "pg-boss";
import { processGenerationJob } from "../../generation/generation-worker.js";
import type { GenerationProvider } from "../../generation/openai-provider.js";
import type { GenerationPolicy } from "../../generation/input.js";
import { GENERATION_QUEUE } from "./outbox.js";
import type { OutboxJobRef } from "./outbox.js";

export async function registerGenerationWorker(
  boss: PgBoss,
  pool: Pool,
  provider: GenerationProvider,
  policy: GenerationPolicy | null,
): Promise<string> {
  return boss.work<OutboxJobRef>(
    GENERATION_QUEUE,
    { batchSize: 1, perJobResults: true, pollingIntervalSeconds: 1 },
    async (jobs) => {
      const results = [];
      for (const job of jobs) {
        const outcome = await processGenerationJob(
          pool,
          job.data,
          provider,
          policy,
          job.signal,
        );
        results.push({
          id: job.id,
          status: "completed" as const,
          output: { state: outcome },
        });
      }
      return results;
    },
  );
}
