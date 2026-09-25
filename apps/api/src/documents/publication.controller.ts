import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  PublicPreviewSchema,
  ReviewDocumentRequestSchema,
  ReviewDocumentResponseSchema,
  PublishDocumentRequestSchema,
  RevisePublicationRequestSchema,
  WithdrawPublicationRequestSchema,
  PublicationCommandResponseSchema,
  PublicationDetailSchema,
  PublicationListSchema,
} from "@ieum/contracts/publishing";
import { PublicationError } from "@ieum/backend/publishing/publication-service";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { DOCUMENT_RUNTIME } from "./document.runtime.js";

function revisionNumber(value: string) {
  if (!/^[1-9][0-9]*$/.test(value)) throw new UnprocessableEntityException();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 2_147_483_647)
    throw new UnprocessableEntityException();
  return parsed;
}
@Controller("api/v1/workspaces/:wid")
export class PublicationController {
  constructor(
    @Inject(DOCUMENT_RUNTIME) private readonly runtime: IdentityRuntime,
  ) {}
  private async current(
    request: FastifyRequest,
    mutation = false,
    sensitive = false,
  ) {
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
    if (sensitive) {
      const age = Date.now() - session.authenticatedAt.getTime();
      if (!Number.isFinite(age) || age < 0 || age > 5 * 60_000)
        throw new PublicationError("REAUTH_REQUIRED");
    }
    return session.userId;
  }
  @Get("documents/:id/revisions/:revision/public-preview")
  async preview(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") documentId: string,
    @Param("revision") revision: string,
  ) {
    return PublicPreviewSchema.parse(
      await this.runtime.publications.preview(
        await this.current(request),
        workspaceId,
        documentId,
        revisionNumber(revision),
      ),
    );
  }
  @Post("documents/:id/revisions/:revision/reviews")
  async review(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") documentId: string,
    @Param("revision") revision: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true, true);
    const parsed = ReviewDocumentRequestSchema.safeParse(body);
    if (!parsed.success) throw new UnprocessableEntityException();
    return ReviewDocumentResponseSchema.parse(
      await this.runtime.publications.review({
        actorId,
        workspaceId,
        documentId,
        revision: revisionNumber(revision),
        idempotencyKey: key ?? "",
        request: parsed.data,
        requestId: request.id,
      }),
    );
  }
  @Post("publications")
  async publish(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true, true);
    const parsed = PublishDocumentRequestSchema.safeParse(body);
    if (!parsed.success) throw new UnprocessableEntityException();
    return PublicationCommandResponseSchema.parse(
      await this.runtime.publications.publish({
        actorId,
        workspaceId,
        idempotencyKey: key ?? "",
        request: parsed.data,
        requestId: request.id,
      }),
    );
  }
  @Post("publications/:id/revisions")
  async revise(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") publicationId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true, true);
    const parsed = RevisePublicationRequestSchema.safeParse(body);
    if (!parsed.success) throw new UnprocessableEntityException();
    return PublicationCommandResponseSchema.parse(
      await this.runtime.publications.revise({
        actorId,
        workspaceId,
        publicationId,
        idempotencyKey: key ?? "",
        request: parsed.data,
        requestId: request.id,
      }),
    );
  }
  @Post("publications/:id/withdraw")
  async withdraw(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") publicationId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true, true);
    const parsed = WithdrawPublicationRequestSchema.safeParse(body);
    if (!parsed.success) throw new UnprocessableEntityException();
    return PublicationCommandResponseSchema.parse(
      await this.runtime.publications.withdraw({
        actorId,
        workspaceId,
        publicationId,
        idempotencyKey: key ?? "",
        request: parsed.data,
        requestId: request.id,
      }),
    );
  }
  @Get("publications")
  async list(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
  ) {
    return PublicationListSchema.parse(
      await this.runtime.publications.list(
        await this.current(request),
        workspaceId,
      ),
    );
  }
  @Get("publications/:id")
  async get(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
  ) {
    return PublicationDetailSchema.parse(
      await this.runtime.publications.get(
        await this.current(request),
        workspaceId,
        id,
      ),
    );
  }
}
