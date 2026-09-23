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
import {
  JudgementAcceptedSchema,
  JudgementRequestSchema,
  JudgementStatusSchema,
} from "@ieum/contracts/judgement";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { JUDGEMENT_RUNTIME } from "./judgement.runtime.js";

@Controller("api/v1/workspaces/:wid/judgements")
export class JudgementController {
  constructor(
    @Inject(JUDGEMENT_RUNTIME) private readonly runtime: IdentityRuntime,
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

  @Post()
  @HttpCode(202)
  async request(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true);
    const parsed = JudgementRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new UnprocessableEntityException({
        fieldErrors: Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0] ?? "body"),
            [issue.message],
          ]),
        ),
      });
    const outcome = await this.runtime.judgement.request({
      actorId,
      workspaceId,
      unitId: parsed.data.unitId,
      unitRevision: parsed.data.unitRevision,
      idempotencyKey: key ?? "",
      requestId: request.id,
    });
    return JudgementAcceptedSchema.parse({
      ...outcome.response,
      commandId: outcome.commandId,
      replayed: outcome.replayed,
    });
  }

  @Get(":id")
  @Header("Cache-Control", "no-store")
  async status(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") requestId: string,
  ) {
    const actorId = await this.current(request, false);
    return JudgementStatusSchema.parse(
      await this.runtime.judgement.status(actorId, workspaceId, requestId),
    );
  }
}
