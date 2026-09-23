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
  AddContextRelationRequestSchema,
  AddThoughtRelationRequestSchema,
  ChangeContextRequestSchema,
  ContextCommandResponseSchema,
  ContextDetailSchema,
  ContextListSchema,
  ContextRelationResponseSchema,
  CreateContextRequestSchema,
  EndRelationResponseSchema,
  MembershipCommandResponseSchema,
  SetMembershipsRequestSchema,
  StructureAcceptResponseSchema,
  StructurePreviewRequestSchema,
  StructurePreviewResponseSchema,
  StructureSignatureRequestSchema,
  StructureUndoPreviewSchema,
  StructureUndoResponseSchema,
  ThoughtRelationResponseSchema,
  UnitMembershipsSchema,
  UnitRelationsSchema,
} from "@ieum/contracts/knowledge";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { KNOWLEDGE_RUNTIME } from "./knowledge.runtime.js";

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

@Controller("api/v1/workspaces/:wid")
export class KnowledgeController {
  constructor(
    @Inject(KNOWLEDGE_RUNTIME) private readonly runtime: IdentityRuntime,
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

  @Post("structures/preview")
  async previewStructure(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true);
    const fields = parseBody(StructurePreviewRequestSchema, body);
    const result = await this.runtime.structure.preview({
      actorId,
      workspaceId,
      idempotencyKey: key ?? "",
      ...fields,
    });
    return StructurePreviewResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }

  @Post("structures/proposals/:proposalId/accept")
  async acceptStructure(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("proposalId") proposalId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true);
    const fields = parseBody(StructureSignatureRequestSchema, body);
    const result = await this.runtime.structure.accept({
      actorId,
      workspaceId,
      proposalId,
      idempotencyKey: key ?? "",
      ...fields,
    });
    return StructureAcceptResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }

  @Get("structures/mutations/:mutationId/undo-preview")
  @Header("Cache-Control", "no-store")
  async previewStructureUndo(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("mutationId") mutationId: string,
  ) {
    const actorId = await this.current(request);
    return StructureUndoPreviewSchema.parse(
      await this.runtime.structure.previewUndo(
        actorId,
        workspaceId,
        mutationId,
      ),
    );
  }

  @Post("structures/mutations/:mutationId/undo")
  async undoStructure(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("mutationId") mutationId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true);
    const fields = parseBody(StructureSignatureRequestSchema, body);
    const result = await this.runtime.structure.undo({
      actorId,
      workspaceId,
      mutationId,
      idempotencyKey: key ?? "",
      ...fields,
    });
    return StructureUndoResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }

  @Post("contexts")
  async create(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true),
      fields = parseBody(CreateContextRequestSchema, body);
    const result = await this.runtime.knowledge.create({
      actorId,
      workspaceId,
      idempotencyKey: key ?? "",
      ...fields,
      requestId: request.id,
    });
    return ContextCommandResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }
  @Get("contexts")
  @Header("Cache-Control", "no-store")
  async list(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Query("includeArchived") includeArchived: string | undefined,
    @Query("q") query: string | undefined,
    @Query("cursor") cursor: string | undefined,
  ) {
    const actorId = await this.current(request);
    if (
      includeArchived !== undefined &&
      includeArchived !== "true" &&
      includeArchived !== "false"
    )
      throw new UnprocessableEntityException();
    return ContextListSchema.parse(
      await this.runtime.knowledge.list(
        actorId,
        workspaceId,
        includeArchived === "true",
        query,
        cursor,
      ),
    );
  }
  @Get("contexts/:id")
  @Header("Cache-Control", "no-store")
  async get(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Query("revision") revision: string | undefined,
  ) {
    const actorId = await this.current(request);
    if (revision !== undefined && !/^[1-9][0-9]*$/.test(revision))
      throw new UnprocessableEntityException();
    return ContextDetailSchema.parse(
      await this.runtime.knowledge.get(
        actorId,
        workspaceId,
        id,
        revision === undefined ? undefined : Number(revision),
      ),
    );
  }
  @Post("contexts/:id/identity")
  async changeIdentity(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true),
      fields = parseBody(ChangeContextRequestSchema, body);
    const result = await this.runtime.knowledge.changeIdentity({
      actorId,
      workspaceId,
      id,
      idempotencyKey: key ?? "",
      ...fields,
      requestId: request.id,
    });
    return ContextCommandResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }
  @Get("units/:unitId/memberships")
  @Header("Cache-Control", "no-store")
  async unitMemberships(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("unitId") unitId: string,
  ) {
    const actorId = await this.current(request);
    return UnitMembershipsSchema.parse(
      await this.runtime.knowledge.unitMemberships(
        actorId,
        workspaceId,
        unitId,
      ),
    );
  }
  @Post("units/:unitId/memberships")
  async setMemberships(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("unitId") unitId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true),
      fields = parseBody(SetMembershipsRequestSchema, body);
    const result = await this.runtime.knowledge.setMemberships({
      actorId,
      workspaceId,
      unitId,
      idempotencyKey: key ?? "",
      ...fields,
      requestId: request.id,
    });
    return MembershipCommandResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }
  @Get("units/:unitId/relations")
  @Header("Cache-Control", "no-store")
  async unitRelations(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("unitId") unitId: string,
  ) {
    const actorId = await this.current(request);
    return UnitRelationsSchema.parse(
      await this.runtime.knowledge.unitRelations(actorId, workspaceId, unitId),
    );
  }
  @Post("context-relations")
  async addContextRelation(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true),
      fields = parseBody(AddContextRelationRequestSchema, body);
    const result = await this.runtime.knowledge.addContextRelation({
      actorId,
      workspaceId,
      idempotencyKey: key ?? "",
      ...fields,
      requestId: request.id,
    });
    return ContextRelationResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }
  @Post("thought-relations")
  async addThoughtRelation(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.current(request, true),
      fields = parseBody(AddThoughtRelationRequestSchema, body);
    const result = await this.runtime.knowledge.addThoughtRelation({
      actorId,
      workspaceId,
      idempotencyKey: key ?? "",
      ...fields,
      requestId: request.id,
    });
    return ThoughtRelationResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }
  @Post("context-relations/:id/end")
  async endContextRelation(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    const actorId = await this.current(request, true);
    const result = await this.runtime.knowledge.endContextRelation({
      actorId,
      workspaceId,
      id,
      idempotencyKey: key ?? "",
      requestId: request.id,
    });
    return EndRelationResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }
  @Post("thought-relations/:id/end")
  async endThoughtRelation(
    @Req() request: FastifyRequest,
    @Param("wid") workspaceId: string,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    const actorId = await this.current(request, true);
    const result = await this.runtime.knowledge.endThoughtRelation({
      actorId,
      workspaceId,
      id,
      idempotencyKey: key ?? "",
      requestId: request.id,
    });
    return EndRelationResponseSchema.parse({
      ...result.response,
      commandId: result.commandId,
      replayed: result.replayed,
    });
  }
}
