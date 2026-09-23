import { randomUUID } from "node:crypto";
import helmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import type { IdentityRuntime } from "./identity/identity.runtime.js";
import type { IeumAuth } from "./auth/auth.js";
import { registerAuthRoutes } from "./auth/fastify.js";

export async function createApiApp(authConfig?: {
  auth: IeumAuth;
  baseUrl: string;
  close?: () => Promise<void>;
  identity?: IdentityRuntime;
  loginAllowed?: (email: string) => Promise<boolean>;
  withAuthMutationLock?: <T>(operation: () => Promise<T>) => Promise<T>;
}): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(authConfig?.identity),
    new FastifyAdapter({
      requestIdHeader: false,
      genReqId: () => randomUUID(),
    }),
    { logger: false },
  );
  await app.register(helmet);
  if (authConfig) {
    const fastify = app.getHttpAdapter().getInstance();
    registerAuthRoutes(
      fastify,
      authConfig.auth,
      authConfig.baseUrl,
      authConfig.loginAllowed,
      authConfig.withAuthMutationLock,
    );
    if (authConfig.close) fastify.addHook("onClose", authConfig.close);
  }
  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onRequest", (request, reply, done) => {
      reply.header("x-request-id", request.id);
      done();
    });
  await app.init();
  return app;
}
