import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { Button, Notice } from "@ieum/ui";
import type { Me } from "../entities/session/api";
import { signOut } from "../features/auth/api";
import { useLeaveSession } from "../features/auth/session-boundary";

export type ShellContext = { me: Me };

export function AppShell({ me }: { me: Me }) {
  const leave = useLeaveSession();
  const [signingOut, setSigningOut] = useState(false);
  const [failure, setFailure] = useState("");
  return (
    <div className="ieum-shell" data-density="comfortable">
      <a className="ieum-skip" href="#main">
        본문으로 건너뛰기
      </a>
      <nav className="ieum-nav" aria-label="주 메뉴">
        <div className="ieum-brand">이음</div>
        <NavLink to="/" end>
          홈
        </NavLink>
        <NavLink to="/captures">기록함</NavLink>
        <NavLink to="/settings">설정</NavLink>
        {me.operator && <NavLink to="/ops/invitations">초대</NavLink>}
        <hr className="ieum-rule" />
        <p className="ieum-help ieum-break" data-testid="account-email">
          {me.user.email}
        </p>
        <Button
          intent="ghost"
          busy={signingOut}
          onClick={async () => {
            setSigningOut(true);
            setFailure("");
            try {
              await signOut();
              leave("signed-out");
            } catch {
              setFailure("로그아웃하지 못했습니다. 다시 시도해 주세요.");
              setSigningOut(false);
            }
          }}
        >
          로그아웃
        </Button>
        {failure && <Notice tone="danger">{failure}</Notice>}
      </nav>
      <main className="ieum-main" id="main" tabIndex={-1}>
        {/* Keyed by account: no component state survives an account switch. */}
        <Outlet key={me.user.id} context={{ me } satisfies ShellContext} />
      </main>
    </div>
  );
}
