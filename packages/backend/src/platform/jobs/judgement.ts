import type { Pool } from "pg";
import type { PgBoss } from "pg-boss";
import {
  processJudgementJob,
  recordJudgementFailure,
} from "../../judgement/judgement-worker.js";
import { JUDGEMENT_QUEUE } from "./outbox.js";
import type { OutboxJobRef } from "./outbox.js";

export async function registerJudgementWorker(
  boss: PgBoss,
  applicationPool: Pool,
): Promise<string> {
  return boss.work<OutboxJobRef>(
    JUDGEMENT_QUEUE,
    { batchSize: 1, perJobResults: true, pollingIntervalSeconds: 1 },
    async (jobs) => {
      const results = [];
      for (const job of jobs) {
        const metadata = await boss.getJobById(JUDGEMENT_QUEUE, job.id);
        try {
          const outcome = await processJudgementJob(
            applicationPool,
            job.data,
            metadata?.retryCount ?? 0,
            job.signal,
          );
          results.push({
            id: job.id,
            status: "completed" as const,
            output: outcome,
          });
        } catch (error) {
          await recordJudgementFailure(
            applicationPool,
            job.data,
            metadata?.retryCount ?? 0,
            metadata?.retryLimit ?? 3,
          );
          throw error;
        }
      }
      return results;
    },
  );
}
