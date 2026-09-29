import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type * as z from "zod";
import {
  ArchiveCaptureResponseSchema,
  CaptureDetailSchema,
  CaptureListSchema,
  CreateCaptureResponseSchema,
  ReviseCaptureResponseSchema,
  SplitCaptureResponseSchema,
} from "@ieum/contracts/management";
import { ApiError, request } from "../../shared/api/http";

export type CaptureDetail = z.infer<typeof CaptureDetailSchema>;
export type CaptureSummary = z.infer<
  typeof CaptureListSchema
>["captures"][number];
export type CaptureSpan = { start: number; end: number; encoding: "utf16" };

/** Account-scoped keys: a different account can never read these rows. */
export const captureKeys = {
  all: (userId: string) => ["user", userId, "captures"] as const,
  list: (userId: string, includeArchived: boolean) =>
    ["user", userId, "captures", "list", includeArchived] as const,
  detail: (userId: string, id: string, revision: number | "current") =>
    ["user", userId, "captures", "detail", id, revision] as const,
};

const base = (workspaceId: string) =>
  `/api/v1/workspaces/${workspaceId}/captures`;

export function useCaptureList(
  userId: string,
  workspaceId: string,
  includeArchived: boolean,
) {
  return useInfiniteQuery({
    queryKey: captureKeys.list(userId, includeArchived),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const query = new URLSearchParams({
        includeArchived: String(includeArchived),
      });
      if (pageParam) query.set("cursor", pageParam);
      return CaptureListSchema.parse(
        await request(`${base(workspaceId)}?${query}`),
      );
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function useCapture(
  userId: string,
  workspaceId: string,
  id: string,
  revision?: number,
) {
  return useQuery({
    queryKey: captureKeys.detail(userId, id, revision ?? "current"),
    queryFn: async () =>
      CaptureDetailSchema.parse(
        await request(
          revision === undefined
            ? `${base(workspaceId)}/${id}`
            : `${base(workspaceId)}/${id}/revisions/${revision}`,
        ),
      ),
    // A missing or foreign capture will not appear on retry.
    retry: (count, error) =>
      !(error instanceof ApiError && error.status < 500) && count < 2,
  });
}

export async function createCapture(
  workspaceId: string,
  input: { title: string; rawBody: string },
  idempotencyKey: string,
) {
  return CreateCaptureResponseSchema.parse(
    await request(base(workspaceId), {
      method: "POST",
      body: input,
      idempotencyKey,
    }),
  );
}

export async function reviseCapture(
  workspaceId: string,
  id: string,
  input: { baseVersion: number; title: string; rawBody: string },
  idempotencyKey: string,
) {
  return ReviseCaptureResponseSchema.parse(
    await request(`${base(workspaceId)}/${id}/revisions`, {
      method: "POST",
      body: input,
      idempotencyKey,
    }),
  );
}

export async function splitCapture(
  workspaceId: string,
  id: string,
  input: {
    baseVersion: number;
    captureRevision: number;
    spans: CaptureSpan[];
  },
  idempotencyKey: string,
) {
  return SplitCaptureResponseSchema.parse(
    await request(`${base(workspaceId)}/${id}/units/split`, {
      method: "POST",
      body: input,
      idempotencyKey,
    }),
  );
}

export async function archiveCapture(
  workspaceId: string,
  id: string,
  input: { baseVersion: number },
  idempotencyKey: string,
) {
  return ArchiveCaptureResponseSchema.parse(
    await request(`${base(workspaceId)}/${id}/archive`, {
      method: "POST",
      body: input,
      idempotencyKey,
    }),
  );
}

export function invalidateCaptures(queryClient: QueryClient, userId: string) {
  return queryClient.invalidateQueries({ queryKey: captureKeys.all(userId) });
}

export type CaptureFailure =
  "conflict" | "archived" | "not-found" | "invalid" | "retry";

export function classifyCaptureError(error: unknown): CaptureFailure {
  if (error instanceof ApiError) {
    if (error.code === "VERSION_CONFLICT") return "conflict";
    if (error.code === "CAPTURE_ARCHIVED") return "archived";
    if (error.status === 404) return "not-found";
    if (error.status === 422 || error.code === "INVALID_SPANS")
      return "invalid";
  }
  return "retry";
}

export const captureFailureMessage: Record<CaptureFailure, string> = {
  conflict: "다른 곳에서 먼저 바뀌었습니다.",
  archived: "보관된 기록은 바꿀 수 없습니다.",
  "not-found": "기록을 찾을 수 없습니다.",
  invalid: "입력을 다시 확인해 주세요.",
  retry:
    "지금은 저장할 수 없습니다. 입력은 그대로 두었으니 다시 시도해 주세요.",
};
