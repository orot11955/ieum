import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import * as z from "zod";
import {
  ApplyGenerationRequestSchema,
  ApplyGenerationResponseSchema,
  GenerationCancelResponseSchema,
  GenerationQueuedSchema,
  GenerationRequestSchema,
  GenerationStatusSchema,
} from "@ieum/contracts/generation";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { DOCUMENT_RUNTIME } from "./document.runtime.js";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues)
      (fieldErrors[String(issue.path[0] ?? "body")] ??= []).push(issue.message);
    throw new UnprocessableEntityException({ fieldErrors });
  }
  return result.data;
}
@Controller("api/v1/workspaces/:wid/documents/:id/generations")
export class GenerationController {
  constructor(
    @Inject(DOCUMENT_RUNTIME) private readonly runtime: IdentityRuntime,
  ) {}
  private async actor(
    request: FastifyRequest,
    mutation = false,
  ): Promise<string> {
    const expected = new URL(this.runtime.origin);
    if (
      request.headers.host !== expected.host ||
      (request.headers["x-forwarded-host"] &&
        request.headers["x-forwarded-host"] !== expected.host) ||
      (request.headers["x-forwarded-proto"] &&
        request.headers["x-forwarded-proto"] !== expected.protocol.slice(0, -1))
    )
      throw new ForbiddenException();
    if (mutation && request.headers.origin !== this.runtime.origin)
      throw new ForbiddenException();
    const session = await this.runtime.authPort.resolveSession(
      request.headers.cookie,
    );
    if (!session) throw new UnauthorizedException();
    await this.runtime.service.getMe(session.userId);
    if (
      mutation &&
      !(await this.runtime.sessions.touchActivity(
        session.userId,
        session.sessionId,
      ))
    )
      throw new UnauthorizedException();
    return session.userId;
  }
  @Post()
  @HttpCode(202)
  async request(
    @Req() req: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") documentId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.actor(req, true);
    return GenerationQueuedSchema.parse(
      await this.runtime.generation.request({
        actorId,
        workspaceId,
        documentId,
        idempotencyKey: idempotencyKey ?? "",
        request: parse(GenerationRequestSchema, body),
        requestId: req.id,
      }),
    );
  }
  @Get(":requestId")
  @Header("Cache-Control", "no-store")
  async get(
    @Req() req: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") documentId: string,
    @Param("requestId") requestId: string,
  ) {
    const actorId = await this.actor(req);
    return GenerationStatusSchema.parse(
      await this.runtime.generation.get(
        actorId,
        workspaceId,
        documentId,
        requestId,
      ),
    );
  }
  @Post(":requestId/cancel")
  @HttpCode(200)
  async cancel(
    @Req() req: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") documentId: string,
    @Param("requestId") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    const actorId = await this.actor(req, true);
    return GenerationCancelResponseSchema.parse(
      await this.runtime.generation.cancel({
        actorId,
        workspaceId,
        documentId,
        id,
        idempotencyKey: idempotencyKey ?? "",
        requestId: req.id,
      }),
    );
  }
  @Post(":requestId/apply")
  @HttpCode(200)
  async apply(
    @Req() req: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") documentId: string,
    @Param("requestId") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.actor(req, true);
    return ApplyGenerationResponseSchema.parse(
      await this.runtime.generation.apply({
        actorId,
        workspaceId,
        documentId,
        id,
        idempotencyKey: idempotencyKey ?? "",
        request: parse(ApplyGenerationRequestSchema, body),
        requestId: req.id,
      }),
    );
  }
}
