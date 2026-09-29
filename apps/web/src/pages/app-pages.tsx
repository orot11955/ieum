import { Link, useOutletContext } from "react-router";
import {
  Card,
  Notice,
  Page,
  Select,
  useTheme,
  type ThemePreference,
} from "@ieum/ui";
import type { ShellContext } from "../app/shell";
import { SessionList } from "../features/settings/session-list";
import { TwoFactorSettings } from "../features/settings/two-factor";
import { IssueInvitationForm } from "../features/invitations/issue-form";

export function HomePage() {
  const { me } = useOutletContext<ShellContext>();
  return (
    <Page eyebrow="개인 공간" title="홈">
      <Card title="계정">
        <p className="ieum-break">{me.user.email}</p>
        <p>
          시간대:{" "}
          <span className="ieum-inline-code">{me.preferences.timeZone}</span>
        </p>
      </Card>
      <Notice tone="info">
        기록함·맥락·할일·일정·위키 화면은 다음 단계에서 이곳에 연결됩니다. 보안
        설정은 <Link to="/settings">설정</Link>에서 관리합니다.
      </Notice>
    </Page>
  );
}

function ThemeSetting() {
  const { preference, setPreference } = useTheme();
  return (
    <Select
      label="색상 모드"
      value={preference}
      onChange={(event) => setPreference(event.target.value as ThemePreference)}
      help="이 기기에만 저장합니다. 시스템 설정을 고르면 기기의 다크 모드를 따릅니다."
    >
      <option value="system">시스템 설정</option>
      <option value="light">Paper</option>
      <option value="dark">Dark</option>
    </Select>
  );
}

export function SettingsPage() {
  const { me } = useOutletContext<ShellContext>();
  return (
    <Page eyebrow="계정" title="설정">
      <Card title="화면">
        <ThemeSetting />
      </Card>
      <Card title="2단계 인증">
        <TwoFactorSettings userId={me.user.id} />
      </Card>
      <Card title="로그인된 기기">
        <SessionList userId={me.user.id} />
      </Card>
    </Page>
  );
}

export function InvitationsPage() {
  const { me } = useOutletContext<ShellContext>();
  if (!me.operator) return <ForbiddenPage />;
  return (
    <Page eyebrow="운영" title="초대">
      <Card title="새 사용자 초대">
        <IssueInvitationForm />
      </Card>
    </Page>
  );
}

export function ForbiddenPage() {
  return (
    <Page title="접근할 수 없음">
      <Notice tone="warning">이 화면을 볼 권한이 없습니다.</Notice>
      <Link to="/">홈으로</Link>
    </Page>
  );
}

export function NotFoundPage() {
  return (
    <Page title="찾을 수 없음">
      <p>요청한 화면이 없습니다.</p>
      <Link to="/">홈으로</Link>
    </Page>
  );
}
