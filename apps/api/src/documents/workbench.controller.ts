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
  Post,
  Put,
  Req,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import * as z from "zod";
import {
  CreateExternalExcerptRequestSchema,
  ReviseExternalExcerptRequestSchema,
  DeleteExternalExcerptRequestSchema,
  ExternalExcerptCommandResponseSchema,
  ExternalExcerptDetailSchema,
  CreateEvidencePackRequestSchema,
  ReviseEvidencePackRequestSchema,
  EvidencePackCommandResponseSchema,
  EvidencePackDetailSchema,
  SaveDocumentWorkbenchRequestSchema,
  DocumentWorkbenchCommandResponseSchema,
  DocumentWorkbenchDetailSchema,
} from "@ieum/contracts/workbench";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { DOCUMENT_RUNTIME } from "./document.runtime.js";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues)
      (fieldErrors[String(issue.path[0] ?? "body")] ??= []).push(issue.message);
    throw new UnprocessableEntityException({ fieldErrors });
  }
  return result.data;
}
function positive(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new UnprocessableEntityException();
  return Number(value);
}

@Controller("api/v1/workspaces/:wid")
export class WorkbenchController {
  constructor(
    @Inject(DOCUMENT_RUNTIME) private readonly runtime: IdentityRuntime,
  ) {}

  private async actor(
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

  @Post("external-excerpts")
  async createExcerpt(
    @Req() req: FastifyRequest,
    @Param("wid") wid: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.actor(req, true);
    return ExternalExcerptCommandResponseSchema.parse(
      await this.runtime.externalExcerpts.create({
        actorId,
        workspaceId: wid,
        idempotencyKey: key ?? "",
        fields: parse(CreateExternalExcerptRequestSchema, body),
        requestId: req.id,
      }),
    );
  }
  @Put("external-excerpts/:id")
  async reviseExcerpt(
    @Req() req: FastifyRequest,
    @Param("wid") wid: string,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.actor(req, true);
    const fields = parse(ReviseExternalExcerptRequestSchema, body);
    const { baseVersion, ...excerptFields } = fields;
    return ExternalExcerptCommandResponseSchema.parse(
      await this.runtime.externalExcerpts.revise({
        actorId,
        workspaceId: wid,
        id,
        idempotencyKey: key ?? "",
        baseVersion,
        fields: excerptFields,
        requestId: req.id,
      }),
    );
  }
  @Delete("external-excerpts/:id")
  async deleteExcerpt(
    @Req() req: FastifyRequest,
    @Param("wid") wid: string,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.actor(req, true);
    const fields = parse(DeleteExternalExcerptRequestSchema, body);
    return ExternalExcerptCommandResponseSchema.parse(
      await this.runtime.externalExcerpts.retire({
        actorId,
        workspaceId: wid,
        id,
        idempotencyKey: key ?? "",
        baseVersion: fields.baseVersion,
        requestId: req.id,
      }),
    );
  }
  @Get("external-excerpts/:id")
  @Header("Cache-Control", "no-store")
  async getExcerpt(
    @Req() req: FastifyRequest,
    @Param("wid") wid: string,
    @Param("id") id: string,
  ) {
    const actorId = await this.actor(req);
    return ExternalExcerptDetailSchema.parse(
      await this.runtime.externalExcerpts.get(actorId, wid, id),
    );
  }

  @Post("documents/:id/evidence-packs")
  async createPack(
    @Req() req: FastifyRequest,
    @Param("wid") wid: string,
    @Param("id") documentId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.actor(req, true);
    return EvidencePackCommandResponseSchema.parse(
      await this.runtime.evidencePacks.create({
        actorId,
        workspaceId: wid,
        documentId,
        idempotencyKey: key ?? "",
        request: parse(CreateEvidencePackRequestSchema, body),
        requestId: req.id,
      }),
    );
  }
  @Post("documents/:id/evidence-packs/:packId/revisions")
  async revisePack(
    @Req() req: FastifyRequest,
    @Param("wid") wid: string,
    @Param("id") documentId: string,
    @Param("packId") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.actor(req, true);
    const request = parse(ReviseEvidencePackRequestSchema, body);
    const { baseRevision, ...packRequest } = request;
    return EvidencePackCommandResponseSchema.parse(
      await this.runtime.evidencePacks.revise({
        actorId,
        workspaceId: wid,
        documentId,
        id,
        idempotencyKey: key ?? "",
        baseRevision,
        request: packRequest,
        requestId: req.id,
      }),
    );
  }
  @Get("documents/:id/evidence-packs/:packId/revisions/:revision")
  @Header("Cache-Control", "no-store")
  async getPack(
    @Req() req: FastifyRequest,
    @Param("wid") wid: string,
    @Param("id") documentId: string,
    @Param("packId") id: string,
    @Param("revision") revision: string,
  ) {
    const actorId = await this.actor(req);
    return EvidencePackDetailSchema.parse(
      await this.runtime.evidencePacks.get(
        actorId,
        wid,
        documentId,
        id,
        positive(revision),
      ),
    );
  }

  @Put("documents/:id/workbench")
  async saveWorkbench(
    @Req() req: FastifyRequest,
    @Param("wid") wid: string,
    @Param("id") documentId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.actor(req, true);
    return DocumentWorkbenchCommandResponseSchema.parse(
      await this.runtime.workbench.save({
        actorId,
        workspaceId: wid,
        documentId,
        idempotencyKey: key ?? "",
        request: parse(SaveDocumentWorkbenchRequestSchema, body),
        requestId: req.id,
      }),
    );
  }
  @Get("documents/:id/workbench")
  @Header("Cache-Control", "no-store")
  async getWorkbench(
    @Req() req: FastifyRequest,
    @Param("wid") wid: string,
    @Param("id") documentId: string,
  ) {
    const actorId = await this.actor(req);
    return DocumentWorkbenchDetailSchema.parse(
      await this.runtime.workbench.get(actorId, wid, documentId),
    );
  }
}
