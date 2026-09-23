import * as z from "zod";
import type { CoreCaptureSnapshot, Utf16Span } from "@ieum/core";
import { identityOpenApiPaths } from "./identity.js";

export const createCapturePath = "/api/v1/workspaces/{wid}/captures" as const;

export const CreateCaptureRequestSchema = z.strictObject({
  title: z.string().min(1),
  rawBody: z.string().min(1),
});

export const CreateCaptureResponseSchema = z.strictObject({
  id: z.uuid(),
  revision: z.int().positive(),
});

export type CreateCaptureRequest = z.infer<typeof CreateCaptureRequestSchema>;
export type CreateCaptureResponse = z.infer<typeof CreateCaptureResponseSchema>;

export type CaptureActorContext = Readonly<{
  accountId: string;
  workspaceId: string;
  idempotencyKey: string;
}>;

export type CreateCaptureCommand = Readonly<
  CaptureActorContext & CreateCaptureRequest
>;

export type CapturePersistenceInput = Readonly<{
  workspaceId: string;
  createdByAccountId: string;
  title: string;
  rawBody: string;
}>;

export function toCreateCaptureCommand(
  request: CreateCaptureRequest,
  context: CaptureActorContext,
): CreateCaptureCommand {
  return { ...CreateCaptureRequestSchema.parse(request), ...context };
}

export function toCapturePersistenceInput(
  command: CreateCaptureCommand,
): CapturePersistenceInput {
  return {
    workspaceId: command.workspaceId,
    createdByAccountId: command.accountId,
    title: command.title,
    rawBody: command.rawBody,
  };
}

export function toCoreCaptureSnapshot(
  record: Readonly<{ id: string; revision: number; rawBody: string }>,
  span: Utf16Span,
): CoreCaptureSnapshot {
  return {
    captureId: record.id,
    revision: record.revision,
    rawBody: record.rawBody,
    span,
  };
}

export const managementOpenApi = {
  openapi: "3.0.3",
  info: { title: "IEUM management contract example", version: "0.1.0" },
  paths: {
    ...identityOpenApiPaths,
    [createCapturePath]: {
      post: {
        operationId: "createCapture",
        parameters: [
          {
            name: "wid",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: z.toJSONSchema(CreateCaptureRequestSchema, {
                target: "openapi-3.0",
              }),
            },
          },
        },
        responses: {
          "201": {
            description: "Capture created",
            content: {
              "application/json": {
                schema: z.toJSONSchema(CreateCaptureResponseSchema, {
                  target: "openapi-3.0",
                }),
              },
            },
          },
        },
      },
    },
  },
} as const;
