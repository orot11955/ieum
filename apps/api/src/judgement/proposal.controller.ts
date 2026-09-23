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
  ProposalDecisionRequestSchema,
  ProposalDecisionResponseSchema,
  ProposalExposureSchema,
  ProposalPreviewSchema,
} from "@ieum/contracts/judgement";
import { ProposalError } from "@ieum/backend/judgement/proposals";
import type { ProposalDecision } from "@ieum/backend/judgement/proposals";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { JUDGEMENT_RUNTIME } from "./judgement.runtime.js";

@Controller("api/v1/workspaces/:wid/proposals")
export class ProposalController {
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

  @Get(":id")
  @Header("Cache-Control", "no-store")
  async preview(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") proposalId: string,
  ) {
    const actorId = await this.current(request, false);
    return ProposalPreviewSchema.parse(
      await this.runtime.proposals.get(actorId, workspaceId, proposalId),
    );
  }

  @Post(":id/expose")
  @HttpCode(200)
  async expose(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") proposalId: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    const actorId = await this.current(request, true);
    const outcome = await this.runtime.proposals.expose({
      actorId,
      workspaceId,
      proposalId,
      idempotencyKey: key ?? "",
      requestId: request.id,
    });
    if (outcome.response.state === "EXPIRED")
      throw new ProposalError("STALE_PROPOSAL");
    return ProposalExposureSchema.parse({
      ...outcome.response,
      commandId: outcome.commandId,
      replayed: outcome.replayed,
    });
  }

  private async decide(
    request: FastifyRequest,
    workspaceId: string,
    proposalId: string,
    key: string | undefined,
    body: unknown,
    decision: ProposalDecision,
  ) {
    const actorId = await this.current(request, true);
    const parsed = ProposalDecisionRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new UnprocessableEntityException({
        fieldErrors: Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0] ?? "body"),
            [issue.message],
          ]),
        ),
      });
    const outcome = await this.runtime.proposals.decide({
      actorId,
      workspaceId,
      proposalId,
      exposureId: parsed.data.exposureId,
      operationsHash: parsed.data.operationsHash,
      decision,
      idempotencyKey: key ?? "",
      requestId: request.id,
    });
    if (
      outcome.response.state === "SUPERSEDED" ||
      outcome.response.state === "EXPIRED"
    )
      throw new ProposalError("STALE_PROPOSAL");
    return ProposalDecisionResponseSchema.parse({
      ...outcome.response,
      commandId: outcome.commandId,
      replayed: outcome.replayed,
    });
  }

  @Post(":id/accept")
  @HttpCode(200)
  accept(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") proposalId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.decide(request, workspaceId, proposalId, key, body, "ACCEPTED");
  }

  @Post(":id/reject")
  @HttpCode(200)
  reject(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") proposalId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.decide(request, workspaceId, proposalId, key, body, "REJECTED");
  }

  @Post(":id/dismiss")
  @HttpCode(200)
  dismiss(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") proposalId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.decide(
      request,
      workspaceId,
      proposalId,
      key,
      body,
      "DISMISSED",
    );
  }
}
