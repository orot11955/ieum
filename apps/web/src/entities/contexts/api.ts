import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type * as z from "zod";
import {
  ContextCommandResponseSchema,
  ContextDetailSchema,
  ContextListSchema,
  ContextRelationResponseSchema,
  EndRelationResponseSchema,
  MembershipCommandResponseSchema,
  UnitMembershipsSchema,
} from "@ieum/contracts/knowledge";
import { ApiError, request } from "../../shared/api/http";

export type ContextDetail = z.infer<typeof ContextDetailSchema>;
export type ContextSummary = z.infer<
  typeof ContextListSchema
>["contexts"][number];
export type UnitMemberships = z.infer<typeof UnitMembershipsSchema>;
export type ContextKind = ContextSummary["kind"];
export type MembershipRole = UnitMemberships["memberships"][number]["role"];
export type RelationType = ContextDetail["relations"][number]["type"];

export const kindLabel: Record<ContextKind, string> = {
  TOPIC: "주제",
  FLOW: "흐름",
  PROJECT: "프로젝트",
  COLLECTION: "모음",
};
export const roleLabel: Record<MembershipRole, string> = {
  PRIMARY: "대표",
  SECONDARY: "보조",
  BACKGROUND: "배경",
};
export const relationLabel: Record<RelationType, string> = {
  PARENT_OF: "상위 맥락",
  RELATED_TO: "관련 맥락",
};

/** Account-scoped keys: a different account can never read these rows. */
export const contextKeys = {
  all: (userId: string) => ["user", userId, "contexts"] as const,
  list: (userId: string, includeArchived: boolean, q: string) =>
    ["user", userId, "contexts", "list", includeArchived, q] as const,
  pickable: (userId: string) =>
    ["user", userId, "contexts", "pickable"] as const,
  detail: (userId: string, id: string) =>
    ["user", userId, "contexts", "detail", id] as const,
  unit: (userId: string, unitId: string) =>
    ["user", userId, "unit-memberships", unitId] as const,
};

const base = (workspaceId: string) => `/api/v1/workspaces/${workspaceId}`;

export function useContextList(
  userId: string,
  workspaceId: string,
  includeArchived: boolean,
  q: string,
) {
  return useInfiniteQuery({
    queryKey: contextKeys.list(userId, includeArchived, q),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const query = new URLSearchParams({
        includeArchived: String(includeArchived),
      });
      if (q) query.set("q", q);
      if (pageParam) query.set("cursor", pageParam);
      return ContextListSchema.parse(
        await request(`${base(workspaceId)}/contexts?${query}`),
      );
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

const PICKER_PAGE_LIMIT = 20;

/**
 * Every active and archived context, for name lookup and linking. Bounded so a
 * runaway list cannot hang the screen; `complete` is false if the bound is hit.
 */
export function useAllContexts(userId: string, workspaceId: string) {
  return useQuery({
    queryKey: contextKeys.pickable(userId),
    queryFn: async () => {
      const contexts: ContextSummary[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < PICKER_PAGE_LIMIT; page++) {
        const query = new URLSearchParams({ includeArchived: "true" });
        if (cursor) query.set("cursor", cursor);
        const result = ContextListSchema.parse(
          await request(`${base(workspaceId)}/contexts?${query}`),
        );
        contexts.push(...result.contexts);
        if (!result.nextCursor) return { contexts, complete: true };
        cursor = result.nextCursor;
      }
      return { contexts, complete: false };
    },
  });
}

export function useContext(userId: string, workspaceId: string, id: string) {
  return useQuery({
    queryKey: contextKeys.detail(userId, id),
    queryFn: async () =>
      ContextDetailSchema.parse(
        await request(`${base(workspaceId)}/contexts/${id}`),
      ),
    retry: (count, error) =>
      !(error instanceof ApiError && error.status < 500) && count < 2,
  });
}

export function useUnitMemberships(
  userId: string,
  workspaceId: string,
  unitId: string,
) {
  return useQuery({
    queryKey: contextKeys.unit(userId, unitId),
    queryFn: async () =>
      UnitMembershipsSchema.parse(
        await request(`${base(workspaceId)}/units/${unitId}/memberships`),
      ),
  });
}

export async function createContext(
  workspaceId: string,
  input: { name: string; purpose: string; scope: string; kind: ContextKind },
  idempotencyKey: string,
) {
  return ContextCommandResponseSchema.parse(
    await request(`${base(workspaceId)}/contexts`, {
      method: "POST",
      body: input,
      idempotencyKey,
    }),
  );
}

export async function changeContext(
  workspaceId: string,
  id: string,
  input: {
    baseRevision: number;
    name?: string;
    purpose?: string;
    scope?: string;
    kind?: ContextKind;
    state?: "ARCHIVED";
  },
  idempotencyKey: string,
) {
  return ContextCommandResponseSchema.parse(
    await request(`${base(workspaceId)}/contexts/${id}/identity`, {
      method: "POST",
      body: input,
      idempotencyKey,
    }),
  );
}

export async function setMemberships(
  workspaceId: string,
  unitId: string,
  input: {
    baseVersion: number;
    memberships: { contextId: string; role: MembershipRole }[];
  },
  idempotencyKey: string,
) {
  return MembershipCommandResponseSchema.parse(
    await request(`${base(workspaceId)}/units/${unitId}/memberships`, {
      method: "POST",
      body: input,
      idempotencyKey,
    }),
  );
}

export async function addContextRelation(
  workspaceId: string,
  input: { fromContextId: string; toContextId: string; type: RelationType },
  idempotencyKey: string,
) {
  return ContextRelationResponseSchema.parse(
    await request(`${base(workspaceId)}/context-relations`, {
      method: "POST",
      body: input,
      idempotencyKey,
    }),
  );
}

export async function endContextRelation(
  workspaceId: string,
  id: string,
  idempotencyKey: string,
) {
  return EndRelationResponseSchema.parse(
    await request(`${base(workspaceId)}/context-relations/${id}/end`, {
      method: "POST",
      idempotencyKey,
    }),
  );
}

export function invalidateContexts(queryClient: QueryClient, userId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: contextKeys.all(userId) }),
    queryClient.invalidateQueries({
      queryKey: ["user", userId, "unit-memberships"],
    }),
  ]);
}

export type ContextFailure =
  | "conflict"
  | "inactive"
  | "cycle"
  | "duplicate"
  | "not-found"
  | "invalid"
  | "retry";

export function classifyContextError(error: unknown): ContextFailure {
  if (error instanceof ApiError) {
    if (error.code === "VERSION_CONFLICT") return "conflict";
    if (error.code === "CONTEXT_INACTIVE") return "inactive";
    if (error.code === "PARENT_CYCLE") return "cycle";
    if (
      error.code === "RELATION_DUPLICATE" ||
      error.code === "MEMBERSHIP_DUPLICATE"
    )
      return "duplicate";
    if (error.status === 404) return "not-found";
    if (error.status === 422) return "invalid";
  }
  return "retry";
}

export const contextFailureMessage: Record<ContextFailure, string> = {
  conflict: "다른 곳에서 먼저 바뀌었습니다.",
  inactive: "보관했거나 대체된 맥락에는 연결할 수 없습니다.",
  cycle: "상위 맥락이 서로를 가리키게 되어 연결할 수 없습니다.",
  duplicate: "이미 같은 연결이 있습니다.",
  "not-found": "맥락이나 기록을 찾을 수 없습니다.",
  invalid: "입력을 다시 확인해 주세요.",
  retry:
    "지금은 저장할 수 없습니다. 입력은 그대로 두었으니 다시 시도해 주세요.",
};
