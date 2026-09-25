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
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  ApplyTransferRequestSchema,
  ApplyTransferResponseSchema,
  TransferPreviewSchema,
  TransferRunSchema,
} from "@ieum/contracts/data-transfer";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { DATA_TRANSFER_RUNTIME } from "./data-transfer.runtime.js";

@Controller("api/v1/workspaces/:wid/data-transfer")
export class DataTransferController {
  constructor(
    @Inject(DATA_TRANSFER_RUNTIME) private readonly runtime: IdentityRuntime,
  ) {}

  private async current(
    request: FastifyRequest,
    mutation = false,
    reauth = false,
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
    if (reauth) {
      const age = Date.now() - session.authenticatedAt.getTime();
      if (!Number.isFinite(age) || age < 0 || age > 5 * 60_000)
        throw new ForbiddenException("REAUTH_REQUIRED");
    }
    return session.userId;
  }

  @Post("exports")
  async createExport(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header("Cache-Control", "no-store");
    const actorId = await this.current(request, true, true);
    return TransferRunSchema.parse(
      await this.runtime.dataTransfer.createExport(actorId, workspaceId),
    );
  }

  @Get("exports/:id/download")
  async downloadExport(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Res() reply: FastifyReply,
  ) {
    const actorId = await this.current(request);
    const bytes = await this.runtime.dataTransfer.downloadExport(
      actorId,
      workspaceId,
      id,
    );
    reply.header("Cache-Control", "private, no-store");
    reply.header(
      "Content-Disposition",
      `attachment; filename="ieum-personal-${id}.tar.gz"`,
    );
    reply.type("application/vnd.ieum.bundle+gzip");
    return reply.send(bytes);
  }

  @Post("imports")
  async stageImport(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header("Cache-Control", "no-store");
    const actorId = await this.current(request, true);
    if (!Buffer.isBuffer(body)) throw new UnsupportedMediaTypeException();
    return TransferRunSchema.parse(
      await this.runtime.dataTransfer.stageImport(actorId, workspaceId, body),
    );
  }

  @Get("imports/:id/preview")
  async previewImport(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header("Cache-Control", "no-store");
    const actorId = await this.current(request);
    return TransferPreviewSchema.parse(
      await this.runtime.dataTransfer.previewImport(actorId, workspaceId, id),
    );
  }

  @Post("imports/:id/apply")
  async applyImport(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header("Cache-Control", "no-store");
    const actorId = await this.current(request, true, true);
    const parsed = ApplyTransferRequestSchema.safeParse(body);
    if (!parsed.success) throw new UnprocessableEntityException();
    return ApplyTransferResponseSchema.parse(
      await this.runtime.dataTransfer.applyImport(
        actorId,
        workspaceId,
        id,
        parsed.data.previewHash,
      ),
    );
  }
}
