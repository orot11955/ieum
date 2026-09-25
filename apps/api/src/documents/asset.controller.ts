import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  AssetDetailSchema,
  AssetListSchema,
  CompleteAssetResponseSchema,
  CreateAssetRequestSchema,
  CreateAssetResponseSchema,
  DeleteAssetResponseSchema,
  ReplaceDocumentAssetsRequestSchema,
  ReplaceDocumentAssetsResponseSchema,
} from "@ieum/contracts/assets";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { DOCUMENT_RUNTIME } from "./document.runtime.js";

@Controller("api/v1/workspaces/:wid")
export class AssetController {
  constructor(
    @Inject(DOCUMENT_RUNTIME) private readonly runtime: IdentityRuntime,
  ) {}

  private async current(request: FastifyRequest, mutation = false) {
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

  @Post("assets")
  async create(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true);
    const parsed = CreateAssetRequestSchema.safeParse(body);
    if (!parsed.success) throw new UnprocessableEntityException();
    return CreateAssetResponseSchema.parse(
      await this.runtime.assets.create({
        actorId,
        workspaceId,
        idempotencyKey: key ?? "",
        request: parsed.data,
        requestId: request.id,
      }),
    );
  }

  @Put("assets/:assetId/content")
  async complete(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("assetId") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true);
    if (
      !Buffer.isBuffer(body) ||
      request.headers["content-type"] !== "application/octet-stream"
    )
      throw new UnprocessableEntityException();
    return CompleteAssetResponseSchema.parse(
      await this.runtime.assets.complete({
        actorId,
        workspaceId,
        id,
        idempotencyKey: key ?? "",
        bytes: body,
        requestId: request.id,
      }),
    );
  }

  @Get("assets")
  async list(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
  ) {
    return AssetListSchema.parse(
      await this.runtime.assets.list(await this.current(request), workspaceId),
    );
  }

  @Get("assets/:assetId")
  async get(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("assetId") id: string,
  ) {
    return AssetDetailSchema.parse(
      await this.runtime.assets.get(
        await this.current(request),
        workspaceId,
        id,
      ),
    );
  }

  private async sendBytes(
    request: FastifyRequest,
    reply: FastifyReply,
    workspaceId: string,
    id: string,
    derivative: boolean,
  ) {
    const actorId = await this.current(request);
    const result = await this.runtime.assets.read(
      actorId,
      workspaceId,
      id,
      derivative,
    );
    reply.header("Cache-Control", "private, no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Security-Policy", "sandbox");
    reply.header(
      "Content-Disposition",
      derivative ? "inline" : 'attachment; filename="download"',
    );
    reply.type(result.mime);
    reply.send(result.bytes);
  }

  @Get("assets/:assetId/content")
  async download(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param("wid") workspaceId: string,
    @Param("assetId") id: string,
  ) {
    await this.sendBytes(request, reply, workspaceId, id, false);
  }

  @Get("assets/:assetId/preview")
  async preview(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param("wid") workspaceId: string,
    @Param("assetId") id: string,
  ) {
    await this.sendBytes(request, reply, workspaceId, id, true);
  }

  @Delete("assets/:assetId")
  async delete(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("assetId") id: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return DeleteAssetResponseSchema.parse(
      await this.runtime.assets.delete({
        actorId: await this.current(request, true),
        workspaceId,
        id,
        idempotencyKey: key ?? "",
        requestId: request.id,
      }),
    );
  }

  @Put("documents/:id/assets")
  async replace(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") documentId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true);
    const parsed = ReplaceDocumentAssetsRequestSchema.safeParse(body);
    if (!parsed.success) throw new UnprocessableEntityException();
    return ReplaceDocumentAssetsResponseSchema.parse(
      await this.runtime.documentAssets.replace({
        actorId,
        workspaceId,
        documentId,
        idempotencyKey: key ?? "",
        request: parsed.data,
        requestId: request.id,
      }),
    );
  }
}
