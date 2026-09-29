import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type * as z from "zod";
import {
  TaskCommandResponseSchema,
  TaskDetailSchema,
  TaskListSchema,
  TaskResultResponseSchema,
  TaskTransitionResponseSchema,
} from "@ieum/contracts/tasks";
import { ApiError, request } from "../../shared/api/http";

export type TaskDetail = z.infer<typeof TaskDetailSchema>;
export type TaskSummary = z.infer<typeof TaskListSchema>["tasks"][number];
export type TaskState = TaskSummary["state"];
export type TaskDue = TaskSummary["due"];

export const stateLabel: Record<TaskState, string> = {
  TODO: "할 일",
  IN_PROGRESS: "진행 중",
  ON_HOLD: "보류",
  DONE: "완료",
  CANCELED: "취소",
};
export const stateTone: Record<
  TaskState,
  "neutral" | "info" | "warning" | "success"
> = {
  TODO: "neutral",
  IN_PROGRESS: "info",
  ON_HOLD: "warning",
  DONE: "success",
  CANCELED: "neutral",
};

/** Mirrors the server's transition table; the server remains the authority. */
export const nextStates: Record<TaskState, readonly TaskState[]> = {
  TODO: ["IN_PROGRESS", "ON_HOLD", "DONE", "CANCELED"],
  IN_PROGRESS: ["TODO", "ON_HOLD", "DONE", "CANCELED"],
  ON_HOLD: ["TODO", "IN_PROGRESS", "DONE", "CANCELED"],
  DONE: ["TODO", "IN_PROGRESS"],
  CANCELED: ["TODO", "IN_PROGRESS"],
};
export const transitionLabel: Record<TaskState, string> = {
  TODO: "다시 할 일로",
  IN_PROGRESS: "진행 시작",
  ON_HOLD: "보류",
  DONE: "완료",
  CANCELED: "취소",
};

export const taskKeys = {
  all: (userId: string) => ["user", userId, "tasks"] as const,
  list: (userId: string, state: TaskState | "") =>
    ["user", userId, "tasks", "list", state] as const,
  detail: (userId: string, id: string) =>
    ["user", userId, "tasks", "detail", id] as const,
};

const base = (workspaceId: string) => `/api/v1/workspaces/${workspaceId}/tasks`;

export function useTaskList(
  userId: string,
  workspaceId: string,
  state: TaskState | "",
) {
  return useInfiniteQuery({
    queryKey: taskKeys.list(userId, state),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const query = new URLSearchParams();
      if (state) query.set("state", state);
      if (pageParam) query.set("cursor", pageParam);
      return TaskListSchema.parse(
        await request(`${base(workspaceId)}?${query}`),
      );
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function useTask(userId: string, workspaceId: string, id: string) {
  return useQuery({
    queryKey: taskKeys.detail(userId, id),
    queryFn: async () =>
      TaskDetailSchema.parse(await request(`${base(workspaceId)}/${id}`)),
    retry: (count, error) =>
      !(error instanceof ApiError && error.status < 500) && count < 2,
  });
}

export type TaskFields = {
  title: string;
  description: string;
  due: TaskDue;
  contextId: string | null;
};

export async function createTask(
  workspaceId: string,
  input: TaskFields,
  idempotencyKey: string,
) {
  return TaskCommandResponseSchema.parse(
    await request(base(workspaceId), {
      method: "POST",
      body: input,
      idempotencyKey,
    }),
  );
}

export async function editTask(
  workspaceId: string,
  id: string,
  input: TaskFields & { baseVersion: number },
  idempotencyKey: string,
) {
  return TaskCommandResponseSchema.parse(
    await request(`${base(workspaceId)}/${id}/edit`, {
      method: "POST",
      body: input,
      idempotencyKey,
    }),
  );
}

export async function transitionTask(
  workspaceId: string,
  id: string,
  input: { baseVersion: number; targetState: TaskState },
  idempotencyKey: string,
) {
  return TaskTransitionResponseSchema.parse(
    await request(`${base(workspaceId)}/${id}/transition`, {
      method: "POST",
      body: input,
      idempotencyKey,
    }),
  );
}

export async function addTaskResult(
  workspaceId: string,
  id: string,
  input: { baseVersion: number; title: string; rawBody: string },
  idempotencyKey: string,
) {
  return TaskResultResponseSchema.parse(
    await request(`${base(workspaceId)}/${id}/results`, {
      method: "POST",
      body: input,
      idempotencyKey,
    }),
  );
}

export function invalidateTasks(queryClient: QueryClient, userId: string) {
  return queryClient.invalidateQueries({ queryKey: taskKeys.all(userId) });
}

export type TaskFailure =
  | "conflict"
  | "transition"
  | "duplicate-result"
  | "context"
  | "not-found"
  | "invalid"
  | "retry";

export function classifyTaskError(error: unknown): TaskFailure {
  if (error instanceof ApiError) {
    if (error.code === "VERSION_CONFLICT") return "conflict";
    if (error.code === "TASK_TRANSITION_INVALID") return "transition";
    if (error.code === "TASK_RESULT_DUPLICATE") return "duplicate-result";
    if (error.code === "TASK_CONTEXT_INVALID") return "context";
    if (error.status === 404) return "not-found";
    if (error.status === 422) return "invalid";
  }
  return "retry";
}

export const taskFailureMessage: Record<TaskFailure, string> = {
  conflict:
    "다른 곳에서 먼저 바뀌었습니다. 최신 상태를 불러왔으니 다시 확인해 주세요.",
  transition:
    "지금 상태에서는 그렇게 바꿀 수 없습니다. 최신 상태를 불러왔습니다.",
  "duplicate-result": "이번 완료에 대한 결과는 이미 기록했습니다.",
  context:
    "선택한 맥락을 사용할 수 없습니다. 다른 맥락을 고르거나 비워 주세요.",
  "not-found": "할일을 찾을 수 없습니다.",
  invalid: "입력을 다시 확인해 주세요.",
  retry:
    "지금은 저장할 수 없습니다. 입력은 그대로 두었으니 다시 시도해 주세요.",
};
