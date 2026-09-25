import { useState } from "react";
import {
  Button,
  Card,
  Check,
  Cluster,
  Dialog,
  Field,
  Notice,
  Page,
  Select,
  Stack,
  Status,
  Table,
  TextArea,
  useTheme,
  type ThemePreference,
} from "@ieum/ui";

const columns = [
  { key: "name", label: "항목" },
  { key: "state", label: "상태" },
  { key: "detail", label: "상세" },
] as const;
const longUrl =
  "https://example.test/source/아주-긴-자료-주소와-출처-앵커가-좁은-화면에서도-잘리지-않고-줄바꿈되는지-확인하는-표본";

export function Gallery() {
  const { preference, setPreference } = useTheme();
  const [clickCount, setClickCount] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <div className="ieum-shell" data-density="comfortable">
      <nav className="ieum-nav" aria-label="갤러리 목차">
        <div className="ieum-brand">이음</div>
        <a href="#controls">공통 조작</a>
        <a href="#forms">입력 상태</a>
        <a href="#feedback">상태와 표</a>
        <a href="#login">W01 로그인 표본</a>
        <a href="#settings">W26 설정 표본</a>
      </nav>
      <main className="ieum-main" id="main">
        <Page
          eyebrow="FE-01 · 기능 연결 전 디자인 검증"
          title="공통 UI 상태 갤러리"
          actions={<Status tone="info">실제 서비스 화면 아님</Status>}
        >
          <Notice>
            Paper/Dark 공통 recipe와 키보드·오류·좁은 화면 상태를 확인하는 내부
            표본입니다.
          </Notice>
          <Card title="테마">
            <Select
              label="색상 모드"
              value={preference}
              onChange={(event) =>
                setPreference(event.target.value as ThemePreference)
              }
              help="시스템 설정을 선택하면 기기의 다크 모드 변경을 따릅니다."
            >
              <option value="system">시스템 설정</option>
              <option value="light">Paper</option>
              <option value="dark">Dark</option>
            </Select>
          </Card>
          <section
            id="controls"
            className="ieum-stack"
            aria-labelledby="controls-title"
          >
            <h2 id="controls-title">공통 조작</h2>
            <Card title="버튼 상태">
              <Cluster>
                <Button
                  intent="primary"
                  onClick={() => setClickCount((value) => value + 1)}
                >
                  기본 동작
                </Button>
                <Button intent="secondary">보조 동작</Button>
                <Button intent="danger">주의 동작</Button>
                <Button intent="ghost">약한 동작</Button>
                <Button
                  busy
                  onClick={() => setClickCount((value) => value + 1)}
                >
                  저장
                </Button>
                <Button
                  disabled
                  disabledReason="현재 권한에서는 사용할 수 없습니다."
                >
                  비활성 동작
                </Button>
              </Cluster>
              <p role="status">기본 동작 실행 {clickCount}회</p>
              <Button onClick={() => setDialogOpen(true)}>대화상자 열기</Button>
              <Dialog
                open={dialogOpen}
                title="변경 확인"
                onClose={() => setDialogOpen(false)}
              >
                <p>Escape 또는 닫기 버튼으로 돌아갈 수 있습니다.</p>
                <Button intent="primary" onClick={() => setDialogOpen(false)}>
                  확인
                </Button>
              </Dialog>
            </Card>
          </section>
          <section
            id="forms"
            className="ieum-stack"
            aria-labelledby="forms-title"
          >
            <h2 id="forms-title">입력 상태</h2>
            <Card title="입력과 선택">
              <Field
                label="기본 입력"
                placeholder="제목 입력"
                help="원문을 덮어쓰지 않는 제목입니다."
              />
              <Field
                label="오류 입력"
                defaultValue="잘못된 값"
                error="제목을 다시 확인해 주세요."
              />
              <Field
                label="읽기 전용"
                defaultValue="선택하고 복사할 수 있는 내용"
                readOnly
              />
              <Field
                label="비활성 입력"
                defaultValue="지금은 수정할 수 없음"
                disabled
              />
              <TextArea
                label="긴 한글과 URL"
                defaultValue={`아주 긴 한글 문장이 좁은 화면에서도 읽히고 잘리지 않아야 합니다.\n${longUrl}`}
              />
              <Select label="상태 선택" defaultValue="draft">
                <option value="draft">초안</option>
                <option value="review">검토</option>
              </Select>
              <Cluster>
                <Check label="선택됨" defaultChecked />
                <Check label="일부 선택" indeterminate />
                <Check label="선택 불가" disabled />
              </Cluster>
            </Card>
          </section>
          <section
            id="feedback"
            className="ieum-stack"
            aria-labelledby="feedback-title"
          >
            <h2 id="feedback-title">상태와 표</h2>
            <Card title="알림과 상태">
              <Stack>
                <Notice tone="success">저장이 완료되었습니다.</Notice>
                <Notice tone="warning">
                  원문 revision이 바뀌어 다시 확인해야 합니다.
                </Notice>
                <Notice tone="danger">
                  저장하지 못했습니다. 입력은 유지됩니다.
                </Notice>
                <Cluster>
                  <Status tone="neutral">후보</Status>
                  <Status tone="info">진행 중</Status>
                  <Status tone="warning">재검토 필요</Status>
                  <Status tone="success">완료</Status>
                </Cluster>
              </Stack>
            </Card>
            <Card title="자료 표">
              <Table
                caption="맥락 자료 상태 표본"
                columns={columns}
                rows={[
                  {
                    id: "first",
                    selected: true,
                    cells: {
                      name: "긴 한글 제목과 출처가 포함된 자료",
                      state: <Status tone="warning">재검토</Status>,
                      detail: <span className="ieum-break">{longUrl}</span>,
                    },
                  },
                  {
                    id: "second",
                    cells: {
                      name: "두 번째 자료",
                      state: <Status>초안</Status>,
                      detail: "원문 보존",
                    },
                  },
                ]}
              />
              <Table
                caption="빈 표 표본"
                columns={columns}
                rows={[]}
                emptyMessage="아직 자료가 없습니다."
              />
            </Card>
          </section>
          <section
            id="login"
            className="ieum-stack"
            aria-labelledby="login-title"
          >
            <h2 id="login-title">W01 로그인 표본</h2>
            <Card title="계정 입력">
              <Notice tone="info">
                입력과 오류 상태만 확인하는 표본입니다. 실제 로그인은 FE-04에서
                연결합니다.
              </Notice>
              <Field
                label="이메일"
                type="email"
                autoComplete="username"
                placeholder="name@example.com"
              />
              <Field
                label="비밀번호"
                type="password"
                autoComplete="current-password"
              />
              <Button
                intent="primary"
                disabled
                disabledReason="로그인 API 연결 전 표본입니다."
              >
                로그인
              </Button>
            </Card>
          </section>
          <section
            id="settings"
            className="ieum-stack"
            aria-labelledby="settings-title"
          >
            <h2 id="settings-title">W26 설정 표본</h2>
            <Card title="화면 설정">
              <p>
                현재 모드:{" "}
                {preference === "system"
                  ? "시스템 설정"
                  : preference === "light"
                    ? "Paper"
                    : "Dark"}
              </p>
              <p>
                설정 값은 이 기기에만 저장하며 계정 권한이나 본문 데이터로
                사용하지 않습니다.
              </p>
            </Card>
          </section>
        </Page>
      </main>
    </div>
  );
}
