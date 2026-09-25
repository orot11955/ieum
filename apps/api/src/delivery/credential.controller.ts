import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  CreateDeliveryCredentialRequestSchema,
  DeliveryCredentialIssuedSchema,
  DeliveryCredentialListSchema,
  DeliveryCredentialSchema,
  RotateDeliveryCredentialRequestSchema,
} from "@ieum/contracts/delivery-management";
import { PublicationError } from "@ieum/backend/publishing/publication-service";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { DOCUMENT_RUNTIME } from "../documents/document.runtime.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Controller("api/v1/workspaces/:wid/delivery-credentials")
export class DeliveryCredentialController {
  constructor(
    @Inject(DOCUMENT_RUNTIME) private readonly runtime: IdentityRuntime,
  ) {}

  private async current(request: FastifyRequest, mutation: boolean) {
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
    if (mutation) {
      if (
        !(await this.runtime.sessions.touchActivity(
          session.userId,
          session.sessionId,
        ))
      )
        throw new UnauthorizedException();
      const age = Date.now() - session.authenticatedAt.getTime();
      if (!Number.isFinite(age) || age < 0 || age > 5 * 60_000)
        throw new PublicationError("REAUTH_REQUIRED");
    }
    return session.userId;
  }

  @Get()
  async list(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header("Cache-Control", "no-store");
    return DeliveryCredentialListSchema.parse(
      await this.runtime.deliveryCredentials.list(
        await this.current(request, false),
        workspaceId,
      ),
    );
  }

  @Post()
  async create(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header("Cache-Control", "no-store");
    const actorId = await this.current(request, true);
    const parsed = CreateDeliveryCredentialRequestSchema.safeParse(body);
    if (!parsed.success) throw new UnprocessableEntityException();
    return DeliveryCredentialIssuedSchema.parse(
      await this.runtime.deliveryCredentials.create(
        actorId,
        workspaceId,
        parsed.data,
      ),
    );
  }

  @Post(":id/rotate")
  async rotate(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header("Cache-Control", "no-store");
    const actorId = await this.current(request, true);
    if (!UUID.test(id)) throw new UnprocessableEntityException();
    const parsed = RotateDeliveryCredentialRequestSchema.safeParse(body);
    if (!parsed.success) throw new UnprocessableEntityException();
    return DeliveryCredentialIssuedSchema.parse(
      await this.runtime.deliveryCredentials.rotate(
        actorId,
        workspaceId,
        id,
        parsed.data,
      ),
    );
  }

  @Post(":id/revoke")
  async revoke(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header("Cache-Control", "no-store");
    const actorId = await this.current(request, true);
    if (!UUID.test(id)) throw new UnprocessableEntityException();
    return DeliveryCredentialSchema.parse(
      await this.runtime.deliveryCredentials.revoke(actorId, workspaceId, id),
    );
  }
}
