import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import * as z from "zod";
import {
  ArchiveCaptureRequestSchema,
  ArchiveCaptureResponseSchema,
  CaptureDetailSchema,
  CaptureListSchema,
  CreateCaptureRequestSchema,
  CreateCaptureResponseSchema,
  ReviseCaptureRequestSchema,
  ReviseCaptureResponseSchema,
  SplitCaptureRequestSchema,
  SplitCaptureResponseSchema,
} from "@ieum/contracts/management";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { CAPTURE_RUNTIME } from "./capture.runtime.js";

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? "body");
      (fieldErrors[field] ??= []).push(issue.message);
    }
    throw new UnprocessableEntityException({ fieldErrors });
  }
  return result.data;
}

@Controller("api/v1/workspaces/:wid/captures")
export class CaptureController {
  constructor(
    @Inject(CAPTURE_RUNTIME) private readonly runtime: IdentityRuntime,
  ) {}

  private trustedHost(request: FastifyRequest): void {
    const expected = new URL(this.runtime.origin);
    if (
      request.headers.host !== expected.host ||
      (request.headers["x-forwarded-host"] &&
        request.headers["x-forwarded-host"] !== expected.host) ||
      (request.headers["x-forwarded-proto"] &&
        request.headers["x-forwarded-proto"] !== expected.protocol.slice(0, -1))
    )
      throw new ForbiddenException();
  }

  private async current(
    request: FastifyRequest,
    mutation = false,
  ): Promise<string> {
    this.trustedHost(request);
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
  async create(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true);
    const fields = parseBody(CreateCaptureRequestSchema, body);
    const outcome = await this.runtime.captures.create({
      actorId,
      workspaceId,
      idempotencyKey: idempotencyKey ?? "",
      title: fields.title,
      rawBody: fields.rawBody,
      sourceKind: fields.source?.kind ?? "manual",
      ...(fields.source?.key ? { sourceKey: fields.source.key } : {}),
      requestId: request.id,
    });
    return CreateCaptureResponseSchema.parse({
      ...outcome.response,
      commandId: outcome.commandId,
      replayed: outcome.replayed,
    });
  }

  @Get()
  @Header("Cache-Control", "no-store")
  async list(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Query("includeArchived") includeArchived: string | undefined,
    @Query("cursor") cursor: string | undefined,
  ) {
    const actorId = await this.current(request);
    if (
      includeArchived !== undefined &&
      includeArchived !== "true" &&
      includeArchived !== "false"
    )
      throw new UnprocessableEntityException();
    return CaptureListSchema.parse(
      await this.runtime.captures.list(
        actorId,
        workspaceId,
        includeArchived === "true",
        cursor,
      ),
    );
  }

  @Get(":id")
  @Header("Cache-Control", "no-store")
  async get(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
  ) {
    const actorId = await this.current(request);
    return CaptureDetailSchema.parse(
      await this.runtime.captures.get(actorId, workspaceId, id),
    );
  }

  @Get(":id/revisions/:revision")
  @Header("Cache-Control", "no-store")
  async getRevision(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Param("revision") revision: string,
  ) {
    const actorId = await this.current(request);
    if (!/^[1-9][0-9]*$/.test(revision))
      throw new UnprocessableEntityException();
    return CaptureDetailSchema.parse(
      await this.runtime.captures.get(
        actorId,
        workspaceId,
        id,
        Number(revision),
      ),
    );
  }

  @Post(":id/revisions")
  async revise(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true);
    const fields = parseBody(ReviseCaptureRequestSchema, body);
    const outcome = await this.runtime.captures.revise({
      actorId,
      workspaceId,
      id,
      idempotencyKey: idempotencyKey ?? "",
      ...fields,
      requestId: request.id,
    });
    return ReviseCaptureResponseSchema.parse({
      ...outcome.response,
      commandId: outcome.commandId,
      replayed: outcome.replayed,
    });
  }

  @Post(":id/units/split")
  async split(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true);
    const fields = parseBody(SplitCaptureRequestSchema, body);
    const outcome = await this.runtime.captures.split({
      actorId,
      workspaceId,
      id,
      idempotencyKey: idempotencyKey ?? "",
      ...fields,
      requestId: request.id,
    });
    return SplitCaptureResponseSchema.parse({
      ...outcome.response,
      commandId: outcome.commandId,
      replayed: outcome.replayed,
    });
  }

  @Post(":id/archive")
  async archive(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true);
    const fields = parseBody(ArchiveCaptureRequestSchema, body);
    const outcome = await this.runtime.captures.archive({
      actorId,
      workspaceId,
      id,
      idempotencyKey: idempotencyKey ?? "",
      ...fields,
      requestId: request.id,
    });
    return ArchiveCaptureResponseSchema.parse({
      ...outcome.response,
      commandId: outcome.commandId,
      replayed: outcome.replayed,
    });
  }
}
