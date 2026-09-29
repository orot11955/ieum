import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Card, Notice } from "@ieum/ui";
import { fetchMe, sessionKeys, useMe } from "../entities/session/api";
import { LoginForm } from "../features/auth/login-form";
import { SecondFactorForm } from "../features/auth/second-factor-form";
import type { LoginState } from "../features/auth/session-boundary";

/** Only same-app paths are accepted as a return target. */
function returnPath(state: unknown): string {
  const from =
    typeof state === "object" && state !== null && "from" in state
      ? state.from
      : undefined;
  return typeof from === "string" &&
    from.startsWith("/") &&
    !from.startsWith("//") &&
    !from.startsWith("/login")
    ? from
    : "/";
}

function AuthFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="ieum-auth-page" id="main">
      <div className="ieum-auth ieum-stack">
        <div className="ieum-brand">이음</div>
        <Card title={title}>{children}</Card>
      </div>
    </main>
  );
}

function useEnterSession() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async (target: string) => {
    // Nothing from a previous account may survive into the new session.
    queryClient.clear();
    await queryClient.fetchQuery({
      queryKey: sessionKeys.me,
      queryFn: fetchMe,
      staleTime: 0,
    });
    navigate(target, { replace: true });
  };
}

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const me = useMe();
  const enter = useEnterSession();
  const state = location.state as LoginState | null;
  const target = returnPath(state);
  if (me.data) return <Navigate to={target} replace />;
  return (
    <AuthFrame title="로그인">
      {state?.reason === "expired" && (
        <Notice tone="warning">
          세션이 만료되었습니다. 다시 로그인해 주세요.
        </Notice>
      )}
      {state?.reason === "signed-out" && (
        <Notice tone="info">로그아웃했습니다.</Notice>
      )}
      <LoginForm
        onSignedIn={(result) =>
          result === "second-factor"
            ? navigate("/login/verify", {
                replace: true,
                state: { from: target } satisfies LoginState,
              })
            : void enter(target)
        }
      />
    </AuthFrame>
  );
}

export function SecondFactorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const enter = useEnterSession();
  const target = returnPath(location.state);
  return (
    <AuthFrame title="2단계 인증">
      <p>로그인을 마치려면 두 번째 인증 수단을 확인합니다.</p>
      <SecondFactorForm
        onVerified={() => void enter(target)}
        onChallengeExpired={() =>
          navigate("/login", {
            replace: true,
            state: { reason: "expired", from: target } satisfies LoginState,
          })
        }
      />
    </AuthFrame>
  );
}

export { AuthFrame };
