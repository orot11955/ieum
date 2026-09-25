import { randomUUID } from "node:crypto";
import helmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { DeliveryReader } from "@ieum/backend/delivery/reader";
import { DeliveryModule } from "./delivery.module.js";

export async function createDeliveryApp(
  reader: DeliveryReader,
  close?: () => Promise<void>,
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    DeliveryModule.register(reader),
    new FastifyAdapter({
      requestIdHeader: false,
      genReqId: () => randomUUID(),
    }),
    { logger: false },
  );
  await app.register(helmet);
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook("onRequest", (request, reply, done) => {
    reply.header("x-request-id", request.id);
    done();
  });
  if (close) fastify.addHook("onClose", close);
  await app.init();
  return app;
}
