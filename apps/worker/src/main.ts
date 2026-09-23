import "reflect-metadata";
import { GetLiveness } from "@ieum/backend/system";
import { assertApplicationDatabaseRole } from "@ieum/backend/platform/database/scope";
import {
  assertJobRelayDatabaseRole,
  registerContextMembershipWorker,
  relayOutboxOnce,
} from "@ieum/backend/platform/jobs/outbox";
import { registerJudgementWorker } from "@ieum/backend/platform/jobs/judgement";
import { NestFactory } from "@nestjs/core";
import { PgBoss } from "pg-boss";
import { Pool } from "pg";
import { WorkerModule } from "./worker.module.js";

const context = await NestFactory.createApplicationContext(WorkerModule, {
  logger: false,
});
const relayUrl = process.env.JOB_RELAY_DATABASE_URL;
const applicationUrl = process.env.APPLICATION_DATABASE_URL;
if (!relayUrl && !applicationUrl) {
  process.stdout.write(
    `${JSON.stringify(context.get(GetLiveness).execute())}\n`,
  );
  await context.close();
} else {
  if (!relayUrl || !applicationUrl) {
    await context.close();
    throw new Error(
      "JOB_RELAY_DATABASE_URL and APPLICATION_DATABASE_URL must be set together",
    );
  }
  const relayPool = new Pool({ connectionString: relayUrl, max: 3 });
  const applicationPool = new Pool({
    connectionString: applicationUrl,
    max: 3,
  });
  const boss = new PgBoss({
    connectionString: relayUrl,
    migrate: false,
    max: 5,
  });
  try {
    await assertJobRelayDatabaseRole(relayPool);
    await assertApplicationDatabaseRole(applicationPool);
    await boss.start();
    await registerContextMembershipWorker(boss, applicationPool);
    await registerJudgementWorker(boss, applicationPool);
    let relayPass: Promise<void> | undefined;
    const timer = setInterval(() => {
      if (relayPass) return;
      relayPass = relayOutboxOnce(relayPool, boss)
        .then(() => {})
        .catch(() => {
          process.stderr.write("Job outbox relay pass failed\n");
        })
        .finally(() => {
          relayPass = undefined;
        });
    }, 1000);
    let stopping: Promise<void> | undefined;
    const stop = async () => {
      if (!stopping) {
        clearInterval(timer);
        stopping = (async () => {
          await relayPass;
          await boss.stop({ graceful: true });
          await Promise.all([
            relayPool.end(),
            applicationPool.end(),
            context.close(),
          ]);
        })();
      }
      await stopping;
    };
    process.once("SIGTERM", () => {
      void stop();
    });
    process.once("SIGINT", () => {
      void stop();
    });
  } catch (error) {
    await Promise.allSettled([
      boss.stop(),
      relayPool.end(),
      applicationPool.end(),
      context.close(),
    ]);
    throw error;
  }
}
