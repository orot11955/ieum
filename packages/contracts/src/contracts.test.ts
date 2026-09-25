import createClient from "openapi-fetch";
import { describe, expect, it } from "vitest";
import { sliceRawSpan } from "@ieum/core";
import type { paths as ManagementPaths } from "../generated/management.js";
import type { paths as DeliveryPaths } from "../generated/delivery.js";
import {
  CreateCaptureRequestSchema,
  CreateCaptureResponseSchema,
  createCapturePath,
  toCapturePersistenceInput,
  toCoreCaptureSnapshot,
  toCreateCaptureCommand,
} from "./management.js";
import { PublicPublicationSchema, publicationPath } from "./delivery.js";
import { EditorEnvelopeSchema, compareEditorBlocks } from "./editor.js";

const captureId = "11111111-1111-4111-8111-111111111111";

describe("management contract round trip", () => {
  it("maps a strict HTTP request to a command, persistence input and Core snapshot", async () => {
    const body = CreateCaptureRequestSchema.parse({
      title: "기록",
      rawBody: "A😀B",
    });
    expect(
      CreateCaptureRequestSchema.safeParse({ ...body, workspaceId: "injected" })
        .success,
    ).toBe(false);

    const command = toCreateCaptureCommand(body, {
      accountId: "a1",
      workspaceId: "w1",
      idempotencyKey: "k1",
    });
    expect(toCapturePersistenceInput(command)).toEqual({
      workspaceId: "w1",
      createdByAccountId: "a1",
      title: "기록",
      rawBody: "A😀B",
    });
    expect(
      sliceRawSpan(
        toCoreCaptureSnapshot(
          { id: captureId, revision: 1, rawBody: body.rawBody },
          { start: 1, end: 3, encoding: "utf16" },
        ),
      ),
    ).toBe("😀");

    const client = createClient<ManagementPaths>({
      baseUrl: "https://example.test",
      fetch: async (request) => {
        expect(request.url).toBe(
          "https://example.test/api/v1/workspaces/w1/captures",
        );
        expect(CreateCaptureRequestSchema.parse(await request.json())).toEqual(
          body,
        );
        return Response.json(
          {
            id: captureId,
            revision: 1,
            version: 1,
            unitId: captureId,
            commandId: captureId,
            replayed: false,
          },
          { status: 201 },
        );
      },
    });
    const result = await client.POST(createCapturePath, {
      params: {
        path: { wid: "w1" },
        header: { "Idempotency-Key": "capture-key-001" },
      },
      body: { title: body.title, rawBody: body.rawBody },
    });
    expect(result.error).toBeUndefined();
    expect(CreateCaptureResponseSchema.parse(result.data)).toEqual({
      id: captureId,
      revision: 1,
      version: 1,
      unitId: captureId,
      commandId: captureId,
      replayed: false,
    });
  });
});

describe("Delivery contract isolation", () => {
  it("rejects a private field and consumes only the generated public response", async () => {
    const publicResponse = {
      id: captureId,
      publicRevision: 1,
      title: "공개 글",
      slug: "public-note",
      bodyFormat: "markdown",
      body: "# 공개",
      publishedAt: "2026-09-23T09:00:00Z",
      updatedAt: "2026-09-23T09:00:00Z",
      assets: [],
    };
    expect(
      PublicPublicationSchema.safeParse({
        ...publicResponse,
        privateRawBody: "secret",
      }).success,
    ).toBe(false);

    const client = createClient<DeliveryPaths>({
      baseUrl: "https://example.test",
      fetch: async (request) => {
        expect(request.url).toBe(
          `https://example.test/delivery/v1/publications/${captureId}`,
        );
        return Response.json(publicResponse);
      },
    });
    const result = await client.GET(publicationPath, {
      params: { path: { id: captureId } },
    });
    expect(result.error).toBeUndefined();
    expect(PublicPublicationSchema.parse(result.data)).toEqual(publicResponse);
  });
});

it("keeps editor schema version separate from the raw source span", () => {
  expect(
    EditorEnvelopeSchema.safeParse({
      schemaVersion: 1,
      content: { type: "doc", content: [] },
    }).success,
  ).toBe(true);
  expect(
    EditorEnvelopeSchema.safeParse({
      schemaVersion: 2,
      content: { type: "doc" },
    }).success,
  ).toBe(false);
});

it("rejects unsupported nodes, duplicate IDs and invalid source anchors", () => {
  const blockId = "11111111-1111-4111-8111-111111111111";
  const paragraph = {
    type: "paragraph",
    attrs: { blockId },
    content: [{ type: "text", text: "기록" }],
  };
  const envelope = {
    schemaVersion: 1,
    content: { type: "doc", content: [paragraph] },
  };
  expect(EditorEnvelopeSchema.safeParse(envelope).success).toBe(true);
  expect(
    EditorEnvelopeSchema.safeParse({
      ...envelope,
      content: { type: "doc", content: [paragraph, paragraph] },
    }).success,
  ).toBe(false);
  expect(
    EditorEnvelopeSchema.safeParse({
      ...envelope,
      content: { type: "doc", content: [{ type: "image" }] },
    }).success,
  ).toBe(false);
  expect(
    EditorEnvelopeSchema.safeParse({
      ...envelope,
      content: {
        type: "doc",
        content: [
          {
            ...paragraph,
            content: [
              {
                type: "sourceReference",
                attrs: {
                  label: "원문",
                  ref: {
                    sourceKind: "unit",
                    sourceId: "u1",
                    sourceRevision: 1,
                    originKey: "o1",
                    sourceHash: "h1",
                    span: { start: 2, end: 1, encoding: "utf16" },
                  },
                },
              },
            ],
          },
        ],
      },
    }).success,
  ).toBe(false);
  const changed = EditorEnvelopeSchema.parse({
    ...envelope,
    content: {
      type: "doc",
      content: [{ ...paragraph, content: [{ type: "text", text: "수정" }] }],
    },
  });
  expect(
    compareEditorBlocks(EditorEnvelopeSchema.parse(envelope), changed),
  ).toEqual({ recheckBlockIds: [blockId], removedBlockIds: [] });
  const source = {
    type: "sourceReference",
    attrs: {
      label: "원문",
      ref: {
        sourceKind: "unit",
        sourceId: "u1",
        sourceRevision: 1,
        originKey: "o1",
        sourceHash: "h1",
      },
    },
  };
  const sourced = EditorEnvelopeSchema.parse({
    ...envelope,
    content: { type: "doc", content: [{ ...paragraph, content: [source] }] },
  });
  const reanchored = EditorEnvelopeSchema.parse({
    ...envelope,
    content: {
      type: "doc",
      content: [
        {
          ...paragraph,
          content: [
            {
              ...source,
              attrs: {
                ...source.attrs,
                ref: { ...source.attrs.ref, sourceRevision: 2 },
              },
            },
          ],
        },
      ],
    },
  });
  expect(
    EditorEnvelopeSchema.parse(JSON.parse(JSON.stringify(sourced))),
  ).toEqual(sourced);
  expect(compareEditorBlocks(sourced, reanchored).recheckBlockIds).toEqual([
    blockId,
  ]);
});
