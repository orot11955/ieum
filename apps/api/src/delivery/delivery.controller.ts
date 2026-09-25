import {
  Catch,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Query,
  Res,
} from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import {
  DeliveryReadError,
  DeliveryReader,
} from "@ieum/backend/delivery/reader";

export const DELIVERY_READER = Symbol("DELIVERY_READER");

function bearer(header: unknown) {
  if (typeof header !== "string") return undefined;
  return /^Bearer (.+)$/i.exec(header)?.[1];
}
function sendJson(
  reply: FastifyReply,
  value: { body: unknown; etag: string },
  conditional: string | undefined,
) {
  reply.header("Cache-Control", "private, no-cache, must-revalidate");
  reply.header("Vary", "Authorization");
  reply.header("ETag", value.etag);
  if (conditional === value.etag) return reply.code(304).send();
  return reply.send(value.body);
}

@Catch()
export class DeliveryErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    reply.header("Cache-Control", "no-store");
    reply.header("Vary", "Authorization");
    if (error instanceof DeliveryReadError) {
      const status = {
        UNAUTHORIZED: 401,
        NOT_FOUND: 404,
        BAD_CURSOR: 400,
        ASSET_UNAVAILABLE: 503,
      }[error.code];
      return reply.code(status).send({ code: error.code });
    }
    return reply.code(500).send({ code: "INTERNAL_ERROR" });
  }
}

@Controller("delivery/v1/publications")
export class DeliveryController {
  constructor(
    @Inject(DELIVERY_READER) private readonly reader: DeliveryReader,
  ) {}

  @Get()
  async list(
    @Headers("authorization") authorization: string | undefined,
    @Headers("if-none-match") conditional: string | undefined,
    @Query("limit") limit: unknown,
    @Query("cursor") cursor: unknown,
    @Res() reply: FastifyReply,
  ) {
    const parsedLimit =
      limit === undefined
        ? 20
        : typeof limit === "string" && /^[1-9][0-9]*$/.test(limit)
          ? Number(limit)
          : Number.NaN;
    const value = await this.reader.list(
      bearer(authorization),
      parsedLimit,
      cursor,
    );
    return sendJson(reply, value, conditional);
  }

  @Get("by-slug/:slug")
  async bySlug(
    @Headers("authorization") authorization: string | undefined,
    @Headers("if-none-match") conditional: string | undefined,
    @Param("slug") slug: string,
    @Res() reply: FastifyReply,
  ) {
    const value = await this.reader.getBySlug(bearer(authorization), slug);
    return sendJson(reply, value, conditional);
  }

  @Get(":id/revisions/:revision")
  async revision(
    @Headers("authorization") authorization: string | undefined,
    @Headers("if-none-match") conditional: string | undefined,
    @Param("id") id: string,
    @Param("revision") revision: string,
    @Res() reply: FastifyReply,
  ) {
    const parsed = Number(revision);
    if (
      !/^[1-9][0-9]*$/.test(revision) ||
      !Number.isInteger(parsed) ||
      parsed > 2_147_483_647
    )
      throw new DeliveryReadError("NOT_FOUND");
    const value = await this.reader.getRevision(
      bearer(authorization),
      id,
      parsed,
    );
    return sendJson(reply, value, conditional);
  }

  @Get(":id/assets/:assetId")
  async asset(
    @Headers("authorization") authorization: string | undefined,
    @Headers("if-none-match") conditional: string | undefined,
    @Param("id") id: string,
    @Param("assetId") assetId: string,
    @Res() reply: FastifyReply,
  ) {
    const value = await this.reader.asset(bearer(authorization), id, assetId);
    reply.header("Cache-Control", "private, no-cache, must-revalidate");
    reply.header("Vary", "Authorization");
    reply.header("ETag", value.etag);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Security-Policy", "sandbox");
    reply.type(value.mime);
    if (conditional === value.etag) return reply.code(304).send();
    return reply.send(value.bytes);
  }

  @Get(":id")
  async detail(
    @Headers("authorization") authorization: string | undefined,
    @Headers("if-none-match") conditional: string | undefined,
    @Param("id") id: string,
    @Res() reply: FastifyReply,
  ) {
    const value = await this.reader.get(bearer(authorization), id);
    return sendJson(reply, value, conditional);
  }
}
