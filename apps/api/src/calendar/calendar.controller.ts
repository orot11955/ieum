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
  CreateEventRequestSchema,
  EditEventRequestSchema,
  EventCommandResponseSchema,
  EventDetailSchema,
  EventPeriodSchema,
  SetEventStateRequestSchema,
} from "@ieum/contracts/calendar";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { CALENDAR_RUNTIME } from "./calendar.runtime.js";

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues)
      (fieldErrors[String(issue.path[0] ?? "body")] ??= []).push(issue.message);
    throw new UnprocessableEntityException({ fieldErrors });
  }
  return parsed.data;
}

@Controller("api/v1/workspaces/:wid/events")
export class CalendarController {
  constructor(
    @Inject(CALENDAR_RUNTIME) private readonly runtime: IdentityRuntime,
  ) {}

  private async current(
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
  async create(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true),
      fields = parseBody(CreateEventRequestSchema, body);
    const result = await this.runtime.calendar.create({
      actorId,
      workspaceId,
      idempotencyKey: key ?? "",
      title: fields.title,
      ...(fields.description !== undefined
        ? { description: fields.description }
        : {}),
      schedule: fields.schedule,
      requestId: request.id,
    });
    return EventCommandResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }

  @Get()
  @Header("Cache-Control", "no-store")
  async list(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Query("fromDate") fromDate: string | undefined,
    @Query("toDateExclusive") toDateExclusive: string | undefined,
    @Query("viewTimeZone") viewTimeZone: string | undefined,
    @Query("includeCanceled") includeCanceled: string | undefined,
  ) {
    const actorId = await this.current(request);
    if (
      !fromDate ||
      !toDateExclusive ||
      !viewTimeZone ||
      (includeCanceled !== undefined &&
        includeCanceled !== "true" &&
        includeCanceled !== "false")
    )
      throw new UnprocessableEntityException();
    return EventPeriodSchema.parse(
      await this.runtime.calendar.list(
        actorId,
        workspaceId,
        fromDate,
        toDateExclusive,
        viewTimeZone,
        includeCanceled === "true",
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
    return EventDetailSchema.parse(
      await this.runtime.calendar.get(actorId, workspaceId, id),
    );
  }

  @Post(":id/edit")
  async edit(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true),
      fields = parseBody(EditEventRequestSchema, body);
    const result = await this.runtime.calendar.edit({
      actorId,
      workspaceId,
      id,
      idempotencyKey: key ?? "",
      baseVersion: fields.baseVersion,
      ...(fields.title !== undefined ? { title: fields.title } : {}),
      ...(fields.description !== undefined
        ? { description: fields.description }
        : {}),
      ...(fields.schedule !== undefined ? { schedule: fields.schedule } : {}),
      requestId: request.id,
    });
    return EventCommandResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }

  @Post(":id/state")
  async setState(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true),
      fields = parseBody(SetEventStateRequestSchema, body);
    const result = await this.runtime.calendar.setState({
      actorId,
      workspaceId,
      id,
      idempotencyKey: key ?? "",
      ...fields,
      requestId: request.id,
    });
    return EventCommandResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }
}
