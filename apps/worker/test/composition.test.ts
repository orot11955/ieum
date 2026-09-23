import "reflect-metadata";
import { GetLiveness } from "@ieum/backend/system";
import { NestFactory } from "@nestjs/core";
import { expect, it } from "vitest";
import { WorkerModule } from "../src/worker.module.js";

it("composes the shared application use case without HTTP", async () => {
  const context = await NestFactory.createApplicationContext(WorkerModule, {
    logger: false,
  });
  try {
    expect(context.get(GetLiveness).execute()).toEqual({ status: "ok" });
  } finally {
    await context.close();
  }
});
