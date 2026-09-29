import { useEffect, useRef, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Notice } from "@ieum/ui";
import { SESSION_EXPIRED_EVENT } from "../../shared/api/http";
import { useMe, type Me } from "../../entities/session/api";
import { recordActivity } from "./api";

export type LoginState = { from?: string; reason?: "expired" | "signed-out" };

const ACTIVITY_INTERVAL_MS = 5 * 60 * 1000;

/** Drops every cached row and returns to login. Used for expiry and sign-out. */
export function useLeaveSession() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return (reason: NonNullable<LoginState["reason"]>, from?: string) => {
    queryClient.clear();
    navigate("/login", {
      replace: true,
      state: { reason, ...(from ? { from } : {}) } satisfies LoginState,
    });
  };
}

function useExpiryRedirect() {
  const leave = useLeaveSession();
  const location = useLocation();
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname + location.search;
  useEffect(() => {
    const onExpired = () => leaveRef.current("expired", pathRef.current);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);
}

/** Server idle expiry counts activity; report it at most every few minutes. */
function useActivityHeartbeat() {
  useEffect(() => {
    let last = Date.now();
    const onInput = () => {
      if (Date.now() - last < ACTIVITY_INTERVAL_MS) return;
      last = Date.now();
      void recordActivity().catch(() => {
        // 401 is routed through the expiry event; other failures are retried later.
      });
    };
    window.addEventListener("pointerdown", onInput);
    window.addEventListener("keydown", onInput);
    return () => {
      window.removeEventListener("pointerdown", onInput);
      window.removeEventListener("keydown", onInput);
    };
  }, []);
}

/**
 * Renders children only for a confirmed session. While the session is being
 * resolved nothing account-specific is drawn, and an account switch drops the
 * previous account's cache before the new account renders.
 */
export function RequireSession({
  children,
}: {
  children: (me: Me) => ReactNode;
}) {
  const me = useMe();
  const location = useLocation();
  const queryClient = useQueryClient();
  const previousUser = useRef<string | null>(null);
  useExpiryRedirect();
  useActivityHeartbeat();
  const userId = me.data?.user.id ?? null;
  useEffect(() => {
    // Keys are scoped by user id, so this only frees memory; it is never
    // needed to keep another account's rows off the screen.
    if (previousUser.current && previousUser.current !== userId)
      queryClient.removeQueries({ queryKey: ["user", previousUser.current] });
    previousUser.current = userId;
  }, [queryClient, userId]);

  if (me.isPending)
    return (
      <p className="ieum-sr-only" role="status">
        세션을 확인하는 중입니다.
      </p>
    );
  if (me.isError && me.data === undefined)
    return (
      <main className="ieum-auth-page">
        <div className="ieum-auth">
          <Notice tone="danger">
            서버에 연결하지 못했습니다. 잠시 후 새로고침해 주세요.
          </Notice>
        </div>
      </main>
    );
  if (!me.data)
    return (
      <Navigate
        to="/login"
        replace
        state={
          {
            from: location.pathname + location.search,
          } satisfies LoginState
        }
      />
    );
  return <>{children(me.data)}</>;
}
