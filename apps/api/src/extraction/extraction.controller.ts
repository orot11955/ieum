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
  ExtractionAcceptRequestSchema,
  ExtractionDecisionResponseSchema,
  ExtractionPreviewSchema,
  ExtractionRejectRequestSchema,
  GenerateExtractionResponseSchema,
} from "@ieum/contracts/extraction";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { EXTRACTION_RUNTIME } from "./extraction.runtime.js";

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues)
    (fieldErrors[String(issue.path[0] ?? "body")] ??= []).push(issue.message);
  throw new UnprocessableEntityException({ fieldErrors });
}

@Controller("api/v1/workspaces/:wid")
export class ExtractionController {
  constructor(
    @Inject(EXTRACTION_RUNTIME) private readonly runtime: IdentityRuntime,
  ) {}

  private async current(
    request: FastifyRequest,
    mutation: boolean,
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

  @Post("captures/:id/extractions")
  async generate(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") captureId: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    const actorId = await this.current(request, true);
    const result = await this.runtime.extraction.generate({
      actorId,
      workspaceId,
      captureId,
      idempotencyKey: key ?? "",
    });
    return GenerateExtractionResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }

  @Get("extractions/:id")
  @Header("Cache-Control", "no-store")
  async preview(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") proposalId: string,
  ) {
    const actorId = await this.current(request, false);
    return ExtractionPreviewSchema.parse(
      await this.runtime.extraction.get(actorId, workspaceId, proposalId),
    );
  }

  @Post("extractions/:id/accept")
  @HttpCode(200)
  async accept(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") proposalId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true);
    const fields = parseBody(ExtractionAcceptRequestSchema, body);
    const result = await this.runtime.extraction.decide({
      actorId,
      workspaceId,
      proposalId,
      expectedCaptureRevision: fields.expectedCaptureRevision,
      decision: "ACCEPTED",
      title: fields.title,
      ...(fields.body !== undefined ? { body: fields.body } : {}),
      ...(fields.schedule !== undefined ? { schedule: fields.schedule } : {}),
      idempotencyKey: key ?? "",
    });
    return ExtractionDecisionResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }

  @Post("extractions/:id/reject")
  @HttpCode(200)
  async reject(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") proposalId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true);
    const fields = parseBody(ExtractionRejectRequestSchema, body);
    const result = await this.runtime.extraction.decide({
      actorId,
      workspaceId,
      proposalId,
      expectedCaptureRevision: fields.expectedCaptureRevision,
      decision: "REJECTED",
      idempotencyKey: key ?? "",
    });
    return ExtractionDecisionResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }
}
