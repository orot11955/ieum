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
  AddTaskResultRequestSchema,
  CreateTaskRequestSchema,
  EditTaskRequestSchema,
  TaskCommandResponseSchema,
  TaskDetailSchema,
  TaskListSchema,
  TaskResultResponseSchema,
  TaskStateSchema,
  TaskTransitionResponseSchema,
  TransitionTaskRequestSchema,
} from "@ieum/contracts/tasks";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { TASK_RUNTIME } from "./task.runtime.js";
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
@Controller("api/v1/workspaces/:wid/tasks")
export class TaskController {
  constructor(
    @Inject(TASK_RUNTIME) private readonly runtime: IdentityRuntime,
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
      fields = parseBody(CreateTaskRequestSchema, body);
    const result = await this.runtime.tasks.create({
      actorId,
      workspaceId,
      idempotencyKey: key ?? "",
      title: fields.title,
      due: fields.due ?? { kind: "NONE" },
      ...(fields.description !== undefined
        ? { description: fields.description }
        : {}),
      ...(fields.contextId !== undefined
        ? { contextId: fields.contextId }
        : {}),
      ...(fields.origin ? { origin: fields.origin } : {}),
      requestId: request.id,
    });
    return TaskCommandResponseSchema.parse({
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
    @Query("state") state: string | undefined,
    @Query("cursor") cursor: string | undefined,
  ) {
    const actorId = await this.current(request);
    const parsedState =
      state === undefined ? undefined : TaskStateSchema.safeParse(state);
    if (parsedState !== undefined && !parsedState.success)
      throw new UnprocessableEntityException();
    return TaskListSchema.parse(
      await this.runtime.tasks.list(
        actorId,
        workspaceId,
        parsedState?.data,
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
    return TaskDetailSchema.parse(
      await this.runtime.tasks.get(actorId, workspaceId, id),
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
      fields = parseBody(EditTaskRequestSchema, body);
    const result = await this.runtime.tasks.edit({
      actorId,
      workspaceId,
      id,
      idempotencyKey: key ?? "",
      baseVersion: fields.baseVersion,
      ...(fields.title !== undefined ? { title: fields.title } : {}),
      ...(fields.description !== undefined
        ? { description: fields.description }
        : {}),
      ...(fields.due !== undefined ? { due: fields.due } : {}),
      ...(fields.contextId !== undefined
        ? { contextId: fields.contextId }
        : {}),
      requestId: request.id,
    });
    return TaskCommandResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }
  @Post(":id/transition")
  async transition(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true),
      fields = parseBody(TransitionTaskRequestSchema, body);
    const result = await this.runtime.tasks.transition({
      actorId,
      workspaceId,
      id,
      idempotencyKey: key ?? "",
      ...fields,
      requestId: request.id,
    });
    return TaskTransitionResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }
  @Post(":id/results")
  async addResult(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true),
      fields = parseBody(AddTaskResultRequestSchema, body);
    const result = await this.runtime.tasks.addResult({
      actorId,
      workspaceId,
      id,
      idempotencyKey: key ?? "",
      ...fields,
      requestId: request.id,
    });
    return TaskResultResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }
}
