import "reflect-metadata";
import { GetLiveness } from "@ieum/backend/system";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module.js";

// BE-01 only verifies the worker composition root; no job consumer exists yet.
const context = await NestFactory.createApplicationContext(WorkerModule, {
  logger: false,
});
try {
  process.stdout.write(
    `${JSON.stringify(context.get(GetLiveness).execute())}\n`,
  );
} finally {
  await context.close();
}
