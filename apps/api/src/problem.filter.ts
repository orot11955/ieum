import { Catch, HttpException, HttpStatus } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { IdentityError } from "@ieum/backend/identity-service";

type FieldErrors = Record<string, string[]>;

function fieldErrorsFor(exception: HttpException): FieldErrors | undefined {
  if (exception.getStatus() !== HttpStatus.UNPROCESSABLE_ENTITY)
    return undefined;
  const response: unknown = exception.getResponse();
  if (
    typeof response !== "object" ||
    response === null ||
    !("fieldErrors" in response)
  ) {
    return undefined;
  }
  const errors = response.fieldErrors;
  if (typeof errors !== "object" || errors === null || Array.isArray(errors))
    return undefined;
  const entries = Object.entries(errors);
  if (
    !entries.every(
      ([field, values]) =>
        field.length > 0 &&
        Array.isArray(values) &&
        values.every((value) => typeof value === "string"),
    )
  )
    return undefined;
  return Object.fromEntries(entries) as FieldErrors;
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<FastifyRequest>();
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const status =
      exception instanceof IdentityError
        ? exception.code === "INVALID_INPUT"
          ? 422
          : exception.code === "INVITATION_INVALID"
            ? 404
            : exception.code === "ACCESS_DENIED"
              ? 403
              : 409
        : exception instanceof HttpException
          ? exception.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
    const title =
      status === 422
        ? "Unprocessable Content"
        : status >= 500
          ? "Internal Server Error"
          : "Request Error";
    const code =
      exception instanceof IdentityError
        ? exception.code
        : status === 422
          ? "VALIDATION_ERROR"
          : status === 404
            ? "NOT_FOUND"
            : status >= 500
              ? "INTERNAL_ERROR"
              : "HTTP_ERROR";
    const fieldErrors =
      exception instanceof HttpException
        ? fieldErrorsFor(exception)
        : undefined;
    reply
      .status(status)
      .type("application/problem+json")
      .send({
        type: "about:blank",
        title,
        status,
        code,
        detail:
          status === 422
            ? "Invalid request input"
            : status >= 500
              ? "Unexpected server error"
              : "Request could not be processed",
        requestId: request.id,
        ...(fieldErrors ? { fieldErrors } : {}),
      });
  }
}
