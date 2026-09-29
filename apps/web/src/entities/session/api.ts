import { useQuery } from "@tanstack/react-query";
import {
  MeResponseSchema,
  SessionListResponseSchema,
} from "@ieum/contracts/identity";
import type * as z from "zod";
import { ApiError, request } from "../../shared/api/http";

export type Me = z.infer<typeof MeResponseSchema>;
export type SessionList = z.infer<typeof SessionListResponseSchema>;

/**
 * Every account-scoped query key starts with the user id, so a render for a
 * different account can never read another account's cached rows.
 */
export const sessionKeys = {
  me: ["session", "me"] as const,
  sessions: (userId: string) => ["user", userId, "sessions"] as const,
  authSession: (userId: string) => ["user", userId, "auth-session"] as const,
};

/** Resolves to null when there is no valid session; other failures throw. */
export async function fetchMe(): Promise<Me | null> {
  try {
    return MeResponseSchema.parse(
      await request("/api/v1/me", { sessionBound: false }),
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function useMe() {
  return useQuery({
    queryKey: sessionKeys.me,
    queryFn: fetchMe,
    staleTime: 30_000,
    refetchOnWindowFocus: "always",
  });
}

export function useSessions(userId: string) {
  return useQuery({
    queryKey: sessionKeys.sessions(userId),
    queryFn: async () =>
      SessionListResponseSchema.parse(await request("/api/v1/me/sessions")),
  });
}

type AuthSession = { user: { twoFactorEnabled?: boolean | null } } | null;

/** Vendor session view; used only for the second-factor enrolment state. */
export function useTwoFactorEnabled(userId: string) {
  return useQuery({
    queryKey: sessionKeys.authSession(userId),
    queryFn: async () =>
      Boolean(
        (await request<AuthSession>("/api/auth/get-session"))?.user
          .twoFactorEnabled,
      ),
  });
}
