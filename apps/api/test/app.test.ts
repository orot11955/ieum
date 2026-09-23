import "reflect-metadata";
import { GetLiveness } from "@ieum/backend/system";
import { Controller, Get, Module, UseGuards } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module.js";
import { createApiApp } from "../src/app.js";

const openApps: NestFastifyApplication[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe("BE-01 API composition", () => {
  it("serves liveness through Fastify with generated request ID and plugin header", async () => {
    const app = await createApiApp();
    openApps.push(app);
    const response = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { "request-id": "untrusted" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(response.headers["x-request-id"]).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i,
    );
    expect(response.headers["x-request-id"]).not.toBe("untrusted");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("maps invalid query input to the documented problem shape", async () => {
    const app = await createApiApp();
    openApps.push(app);
    const response = await app.inject({
      method: "GET",
      url: "/health/live?extra=1",
    });
    expect(response.statusCode).toBe(422);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      type: "about:blank",
      status: 422,
      code: "VALIDATION_ERROR",
      fieldErrors: { query: ["Unknown query parameter"] },
      requestId: response.headers["x-request-id"],
    });
  });

  it("returns a request-linked problem for an unknown route", async () => {
    const app = await createApiApp();
    openApps.push(app);
    const response = await app.inject({ method: "GET", url: "/missing" });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: "NOT_FOUND",
      status: 404,
      requestId: response.headers["x-request-id"],
    });
  });

  it("replaces the application provider without changing the controller", async () => {
    const execute = vi.fn(() => ({ status: "ok" as const }));
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GetLiveness)
      .useValue({ execute })
      .compile();
    const app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    openApps.push(app);
    await app.init();
    const response = await app.inject({ method: "GET", url: "/health/live" });
    expect(response.statusCode).toBe(200);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("does not expose an unexpected application error in the HTTP response", async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GetLiveness)
      .useValue({
        execute: () => {
          throw new Error("private fixture text");
        },
      })
      .compile();
    const app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    openApps.push(app);
    await app.init();
    const response = await app.inject({ method: "GET", url: "/health/live" });
    expect(response.statusCode).toBe(500);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      code: "INTERNAL_ERROR",
      status: 500,
    });
    expect(response.body).not.toContain("private fixture text");
  });
});

class DenyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return (
      context.switchToHttp().getRequest<{ method: string }>().method === "POST"
    );
  }
}

@Controller("guard-check")
class GuardCheckController {
  @Get()
  @UseGuards(DenyGuard)
  read(): { status: "ok" } {
    return { status: "ok" };
  }
}

@Module({ controllers: [GuardCheckController], providers: [DenyGuard] })
class GuardCheckModule {}

it("executes a Nest guard on Fastify before the controller", async () => {
  const module = await Test.createTestingModule({
    imports: [GuardCheckModule],
  }).compile();
  const app = module.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );
  openApps.push(app);
  await app.init();
  const response = await app.inject({ method: "GET", url: "/guard-check" });
  expect(response.statusCode).toBe(403);
});
