import { useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type * as z from "zod";
import {
  EventCommandResponseSchema,
  EventDetailSchema,
  EventPeriodSchema,
} from "@ieum/contracts/calendar";
import { ApiError, request } from "../../shared/api/http";

export type EventDetail = z.infer<typeof EventDetailSchema>;
export type EventPeriod = z.infer<typeof EventPeriodSchema>;
export type EventItem = EventPeriod["events"][number];
export type EventSchedule = EventItem["schedule"];
export type EventScheduleInput =
  | {
      kind: "TIMED";
      timeZone: string;
      startLocal: string;
      endLocal: string;
      startOffsetMinutes?: number;
      endOffsetMinutes?: number;
    }
  | {
      kind: "ALL_DAY";
      timeZone: string;
      startDate: string;
      endDateExclusive: string;
    };

export const eventKeys = {
  all: (userId: string) => ["user", userId, "events"] as const,
  period: (
    userId: string,
    from: string,
    to: string,
    zone: string,
    canceled: boolean,
  ) => ["user", userId, "events", "period", from, to, zone, canceled] as const,
  detail: (userId: string, id: string) =>
    ["user", userId, "events", "detail", id] as const,
};

const base = (workspaceId: string) =>
  `/api/v1/workspaces/${workspaceId}/events`;

export function useEventPeriod(
  userId: string,
  workspaceId: string,
  fromDate: string,
  toDateExclusive: string,
  viewTimeZone: string,
  includeCanceled: boolean,
) {
  return useQuery({
    queryKey: eventKeys.period(
      userId,
      fromDate,
      toDateExclusive,
      viewTimeZone,
      includeCanceled,
    ),
    queryFn: async () => {
      const query = new URLSearchParams({
        fromDate,
        toDateExclusive,
        viewTimeZone,
        includeCanceled: String(includeCanceled),
      });
      return EventPeriodSchema.parse(
        await request(`${base(workspaceId)}?${query}`),
      );
    },
  });
}

export function useEvent(userId: string, workspaceId: string, id: string) {
  return useQuery({
    queryKey: eventKeys.detail(userId, id),
    queryFn: async () =>
      EventDetailSchema.parse(await request(`${base(workspaceId)}/${id}`)),
    retry: (count, error) =>
      !(error instanceof ApiError && error.status < 500) && count < 2,
  });
}

export async function createEvent(
  workspaceId: string,
  input: { title: string; description: string; schedule: EventScheduleInput },
  idempotencyKey: string,
) {
  return EventCommandResponseSchema.parse(
    await request(base(workspaceId), {
      method: "POST",
      body: input,
      idempotencyKey,
    }),
  );
}

export async function editEvent(
  workspaceId: string,
  id: string,
  input: {
    baseVersion: number;
    title: string;
    description: string;
    schedule: EventScheduleInput;
  },
  idempotencyKey: string,
) {
  return EventCommandResponseSchema.parse(
    await request(`${base(workspaceId)}/${id}/edit`, {
      method: "POST",
      body: input,
      idempotencyKey,
    }),
  );
}

export async function setEventState(
  workspaceId: string,
  id: string,
  input: { baseVersion: number; targetState: "CONFIRMED" | "CANCELED" },
  idempotencyKey: string,
) {
  return EventCommandResponseSchema.parse(
    await request(`${base(workspaceId)}/${id}/state`, {
      method: "POST",
      body: input,
      idempotencyKey,
    }),
  );
}

export function invalidateEvents(queryClient: QueryClient, userId: string) {
  return queryClient.invalidateQueries({ queryKey: eventKeys.all(userId) });
}

export type EventFailure =
  "conflict" | "state" | "not-found" | "invalid" | "retry";

export function classifyEventError(error: unknown): EventFailure {
  if (error instanceof ApiError) {
    if (error.code === "VERSION_CONFLICT") return "conflict";
    if (error.code === "EVENT_STATE_INVALID") return "state";
    if (error.status === 404) return "not-found";
    if (error.status === 422) return "invalid";
  }
  return "retry";
}

export const eventFailureMessage: Record<EventFailure, string> = {
  conflict: "다른 곳에서 먼저 바뀌었습니다.",
  state: "지금 상태에서는 그렇게 바꿀 수 없습니다.",
  "not-found": "일정을 찾을 수 없습니다.",
  invalid: "입력을 다시 확인해 주세요. 시간대와 시각이 올바른지 확인합니다.",
  retry:
    "지금은 저장할 수 없습니다. 입력은 그대로 두었으니 다시 시도해 주세요.",
};
