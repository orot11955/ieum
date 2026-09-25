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
  Put,
  Req,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import * as z from "zod";
import {
  CreateDocumentRequestSchema,
  CreateDocumentResponseSchema,
  DocumentDetailSchema,
  DocumentListSchema,
  DocumentRevisionCommandResponseSchema,
  DocumentRevisionDetailSchema,
  ReplaceDocumentLinksRequestSchema,
  ReplaceDocumentLinksResponseSchema,
  RestoreDocumentRequestSchema,
  SaveDocumentDraftRequestSchema,
  SaveDocumentDraftResponseSchema,
  SealDocumentRequestSchema,
} from "@ieum/contracts/documents";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { DOCUMENT_RUNTIME } from "./document.runtime.js";

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
function revisionNumber(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) throw new UnprocessableEntityException();
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new UnprocessableEntityException();
  return number;
}

@Controller("api/v1/workspaces/:wid/documents")
export class DocumentController {
  constructor(
    @Inject(DOCUMENT_RUNTIME) private readonly runtime: IdentityRuntime,
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
    const actorId = await this.current(request, true);
    const fields = parseBody(CreateDocumentRequestSchema, body);
    return CreateDocumentResponseSchema.parse(
      await this.runtime.documents.create({
        actorId,
        workspaceId,
        idempotencyKey: key ?? "",
        ...fields,
        requestId: request.id,
      }),
    );
  }

  @Get()
  @Header("Cache-Control", "no-store")
  async list(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
  ) {
    const actorId = await this.current(request);
    return DocumentListSchema.parse(
      await this.runtime.documents.list(actorId, workspaceId),
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
    return DocumentDetailSchema.parse(
      await this.runtime.documents.get(actorId, workspaceId, id),
    );
  }

  @Put(":id/draft")
  async save(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true);
    const fields = parseBody(SaveDocumentDraftRequestSchema, body);
    return SaveDocumentDraftResponseSchema.parse(
      await this.runtime.documents.save({
        actorId,
        workspaceId,
        id,
        idempotencyKey: key ?? "",
        baseVersion: fields.baseVersion,
        saveSequence: fields.saveSequence,
        content: {
          schemaVersion: fields.schemaVersion,
          content: fields.content,
        },
        requestId: request.id,
      }),
    );
  }

  @Post(":id/revisions")
  async seal(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true);
    const fields = parseBody(SealDocumentRequestSchema, body);
    return DocumentRevisionCommandResponseSchema.parse(
      await this.runtime.documents.seal({
        actorId,
        workspaceId,
        id,
        idempotencyKey: key ?? "",
        ...fields,
        requestId: request.id,
      }),
    );
  }

  @Get(":id/revisions/:revision")
  @Header("Cache-Control", "no-store")
  async revision(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Param("revision") revision: string,
  ) {
    const actorId = await this.current(request);
    return DocumentRevisionDetailSchema.parse(
      await this.runtime.documents.revision(
        actorId,
        workspaceId,
        id,
        revisionNumber(revision),
      ),
    );
  }

  @Post(":id/restore")
  async restore(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true);
    const fields = parseBody(RestoreDocumentRequestSchema, body);
    return DocumentRevisionCommandResponseSchema.parse(
      await this.runtime.documents.restore({
        actorId,
        workspaceId,
        id,
        idempotencyKey: key ?? "",
        ...fields,
        requestId: request.id,
      }),
    );
  }

  @Put(":id/links")
  async replaceLinks(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true);
    const fields = parseBody(ReplaceDocumentLinksRequestSchema, body);
    return ReplaceDocumentLinksResponseSchema.parse(
      await this.runtime.documents.replaceLinks({
        actorId,
        workspaceId,
        id,
        idempotencyKey: key ?? "",
        ...fields,
        requestId: request.id,
      }),
    );
  }
}
