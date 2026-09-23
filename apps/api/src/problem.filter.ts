import { Catch, HttpException, HttpStatus } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { IdentityError } from "@ieum/backend/identity-service";
import { CommandError } from "@ieum/backend/command-coordinator";
import { CaptureError } from "@ieum/backend/captures";
import { KnowledgeError } from "@ieum/backend/knowledge";
import { TaskError } from "@ieum/backend/tasks";
import { CalendarError } from "@ieum/backend/calendar";
import { CalendarTimeError } from "@ieum/backend/calendar-time";

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
      exception instanceof CommandError
        ? exception.code === "INVALID_COMMAND"
          ? 422
          : 409
        : exception instanceof TaskError
          ? exception.code === "TASK_NOT_FOUND" ||
            exception.code === "TASK_ORIGIN_INVALID" ||
            exception.code === "TASK_CONTEXT_INVALID"
            ? 404
            : 409
          : exception instanceof CalendarError
            ? exception.code === "EVENT_NOT_FOUND"
              ? 404
              : exception.code === "PERIOD_TOO_LARGE"
                ? 422
                : 409
            : exception instanceof CalendarTimeError
              ? 422
              : exception instanceof KnowledgeError
                ? [
                    "CONTEXT_NOT_FOUND",
                    "UNIT_NOT_FOUND",
                    "RELATION_NOT_FOUND",
                  ].includes(exception.code)
                  ? 404
                  : exception.code === "MEMBERSHIP_DUPLICATE"
                    ? 422
                    : 409
                : exception instanceof CaptureError
                  ? exception.code === "CAPTURE_NOT_FOUND"
                    ? 404
                    : exception.code === "INVALID_SPANS"
                      ? 422
                      : 409
                  : exception instanceof IdentityError
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
      exception instanceof CommandError
        ? exception.code
        : exception instanceof TaskError
          ? exception.code
          : exception instanceof CalendarError
            ? exception.code
            : exception instanceof CalendarTimeError
              ? exception.code
              : exception instanceof KnowledgeError
                ? exception.code
                : exception instanceof CaptureError
                  ? exception.code
                  : exception instanceof IdentityError
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
        ...(exception instanceof CommandError && exception.currentVersion
          ? { currentVersion: exception.currentVersion }
          : {}),
        ...(fieldErrors ? { fieldErrors } : {}),
      });
  }
}
