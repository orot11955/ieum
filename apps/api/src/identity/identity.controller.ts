import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import * as z from "zod";
import {
  InvitationAcceptRequestSchema,
  InvitationAcceptResponseSchema,
  InvitationIssueRequestSchema,
  InvitationIssueResponseSchema,
  MeResponseSchema,
  ModelPreferenceRequestSchema,
  PreferenceRequestSchema,
  PreferenceResponseSchema,
  SessionListResponseSchema,
  UserStateRequestSchema,
} from "@ieum/contracts/identity";
import { IDENTITY_RUNTIME } from "./identity.runtime.js";
import type { IdentityRuntime } from "./identity.runtime.js";

function parseRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? "body");
      (fieldErrors[field] ??= []).push(issue.message);
    }
    throw new UnprocessableEntityException({
      fieldErrors,
    });
  }
  return result.data;
}

@Controller("api/v1")
export class IdentityController {
  constructor(
    @Inject(IDENTITY_RUNTIME) private readonly runtime: IdentityRuntime,
  ) {}

  private trustedHost(request: FastifyRequest): void {
    const expected = new URL(this.runtime.origin);
    if (
      request.headers.host !== expected.host ||
      (request.headers["x-forwarded-host"] &&
        request.headers["x-forwarded-host"] !== expected.host) ||
      (request.headers["x-forwarded-proto"] &&
        request.headers["x-forwarded-proto"] !== expected.protocol.slice(0, -1))
    ) {
      throw new ForbiddenException();
    }
  }

  private mutation(request: FastifyRequest): void {
    this.trustedHost(request);
    if (request.headers.origin !== this.runtime.origin)
      throw new ForbiddenException();
  }

  private async current(request: FastifyRequest, recordActivity = false) {
    this.trustedHost(request);
    const session = await this.runtime.authPort.resolveSession(
      request.headers.cookie,
    );
    if (!session) throw new UnauthorizedException();
    const me = await this.runtime.service.getMe(session.userId);
    if (
      recordActivity &&
      !(await this.runtime.sessions.touchActivity(
        session.userId,
        session.sessionId,
      ))
    ) {
      throw new UnauthorizedException();
    }
    return { session, me };
  }

  @Post("me/activity")
  async activity(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.mutation(request);
    await this.current(request, true);
    reply.code(204);
  }

  @Get("me")
  @Header("Cache-Control", "no-store")
  async me(@Req() request: FastifyRequest) {
    const { session, me } = await this.current(request);
    return MeResponseSchema.parse({
      user: { id: session.userId, email: session.email },
      workspace: { id: me.workspaceId, role: "OWNER" as const },
      operator: me.operator,
      preferences: {
        timeZone: me.timeZone,
        externalModelEnabled: me.externalModelEnabled,
        version: me.preferenceVersion,
      },
    });
  }

  @Get("me/sessions")
  @Header("Cache-Control", "no-store")
  async sessions(@Req() request: FastifyRequest) {
    const { session } = await this.current(request);
    const sessions = await this.runtime.sessions.listForUser(session.userId);
    return SessionListResponseSchema.parse({
      sessions: sessions.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        current: row.id === session.sessionId,
      })),
    });
  }

  @Delete("me/sessions/:sessionId")
  async revokeSession(
    @Req() request: FastifyRequest,
    @Param("sessionId") sessionId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.mutation(request);
    const { session } = await this.current(request, true);
    await this.runtime.sessions.revokeById(session.userId, sessionId);
    reply.code(204);
  }

  @Patch("me/preferences")
  async preferences(
    @Req() request: FastifyRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    this.mutation(request);
    const { session } = await this.current(request, true);
    const { timeZone, baseVersion } = parseRequest(
      PreferenceRequestSchema,
      body,
    );
    const outcome = await this.runtime.preferences.setTimeZone({
      actorId: session.userId,
      idempotencyKey: idempotencyKey ?? "",
      baseVersion,
      timeZone,
      requestId: request.id,
    });
    return PreferenceResponseSchema.parse({
      ...outcome.response,
      commandId: outcome.commandId,
      replayed: outcome.replayed,
    });
  }

  @Patch("me/preferences/model")
  async modelPreference(
    @Req() request: FastifyRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    this.mutation(request);
    const { session } = await this.current(request, true);
    const fields = parseRequest(ModelPreferenceRequestSchema, body);
    const outcome = await this.runtime.preferences.setExternalModelEnabled({
      actorId: session.userId,
      idempotencyKey: idempotencyKey ?? "",
      ...fields,
      requestId: request.id,
    });
    return PreferenceResponseSchema.parse({
      ...outcome.response,
      commandId: outcome.commandId,
      replayed: outcome.replayed,
    });
  }

  @Post("ops/invitations")
  @Header("Cache-Control", "no-store")
  async invite(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.mutation(request);
    const { session } = await this.current(request, true);
    const { email } = parseRequest(InvitationIssueRequestSchema, body);
    const invitation = await this.runtime.service.issueInvitation(
      session.userId,
      email,
    );
    return InvitationIssueResponseSchema.parse({
      token: invitation.token,
      expiresAt: invitation.expiresAt.toISOString(),
    });
  }

  @Post("invitations/accept")
  @Header("Cache-Control", "no-store")
  async accept(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.mutation(request);
    const fields = parseRequest(InvitationAcceptRequestSchema, body);
    const access = await this.runtime.service.acceptInvitation({
      token: fields.token,
      name: fields.name,
      password: fields.password,
    });
    return InvitationAcceptResponseSchema.parse({
      workspaceId: access.workspaceId,
    });
  }

  @Patch("ops/users/:userId/state")
  async setUserState(
    @Req() request: FastifyRequest,
    @Param("userId") userId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.mutation(request);
    const fields = parseRequest(UserStateRequestSchema, body);
    const { session } = await this.current(request, true);
    await this.runtime.service.setUserSuspended(
      session.userId,
      userId,
      fields.suspended,
    );
    reply.code(204);
  }
}
