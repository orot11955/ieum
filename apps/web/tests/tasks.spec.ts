import { expect, test, type Page } from "@playwright/test";
import {
  apiCreateCapture,
  apiCreateContext,
  apiCreateTask,
  apiPost,
  origin,
  signInAt,
  workspaceIdOf,
} from "./helpers";

async function textOf(page: Page, testId: string): Promise<string> {
  return page.getByTestId(testId).evaluate((node) => node.textContent ?? "");
}

const shared = { workspace: "", taskId: "" };

test.describe.serial("M4 할일", () => {
  test("creating a task explains bad input and saves once", async ({
    page,
  }) => {
    await signInAt(page, "/tasks/new");
    shared.workspace = await workspaceIdOf(page);
    await page.getByRole("button", { name: "할일 만들기" }).click();
    await expect(page.getByText("제목을 입력해 주세요.")).toBeVisible();
    await page.getByLabel("제목", { exact: true }).fill("보고서 작성");
    await page.getByLabel("기한", { exact: true }).selectOption("DATE");
    await page.getByRole("button", { name: "할일 만들기" }).click();
    await expect(page.getByText("날짜를 선택해 주세요.")).toBeVisible();
    await page.getByLabel("기한 날짜").fill("2028-02-29");
    await page.getByRole("button", { name: "할일 만들기" }).dblclick();
    await expect(
      page.getByRole("heading", { name: "보고서 작성", exact: true, level: 1 }),
    ).toBeVisible();
    shared.taskId = /\/tasks\/([0-9a-f-]{36})/.exec(page.url())![1]!;
    expect(await textOf(page, "task-due")).toContain("2028");
    await page.goto("/tasks");
    await expect(
      page.getByRole("link", { name: "보고서 작성", exact: true }),
    ).toHaveCount(1);
  });

  test("only allowed moves are offered, and completing keeps the task independent of its source", async ({
    page,
  }) => {
    await signInAt(page, `/tasks/${shared.taskId}`);
    // A task that is already open cannot be "reopened".
    await expect(
      page.getByRole("button", { name: "다시 할 일로" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "진행 시작" }).click();
    await expect(page.getByText("진행 중").first()).toBeVisible();
    await page.getByRole("button", { name: "완료", exact: true }).click();
    await expect(page.getByText("완료").first()).toBeVisible();
    // A finished task can only be reopened, not put on hold or canceled.
    await expect(page.getByRole("button", { name: "보류" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "취소" })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "상태 이력" })).toContainText(
      "완료",
    );
  });

  test("a result becomes a new capture linked to this completion, once", async ({
    page,
  }) => {
    await signInAt(page, `/tasks/${shared.taskId}`);
    await page
      .getByLabel("결과 내용")
      .fill("보고서를 제출했고 피드백을 받았다.");
    await page.getByRole("button", { name: "결과 기록" }).click();
    const results = page.getByRole("list", { name: "이번 완료의 결과" });
    await expect(results).toBeVisible();
    await expect(page.getByLabel("결과 내용")).toHaveCount(0);
    await results.getByRole("link", { name: "결과 기록 열기" }).click();
    await expect(page.getByTestId("raw-body")).toHaveText(
      "보고서를 제출했고 피드백을 받았다.",
    );
  });

  test("reopening and finishing again allows a new result; the old one stays", async ({
    page,
  }) => {
    await signInAt(page, `/tasks/${shared.taskId}`);
    await page.getByRole("button", { name: "다시 할 일로" }).click();
    await expect(page.getByLabel("결과 내용")).toHaveCount(0);
    await page.getByRole("button", { name: "완료", exact: true }).click();
    await expect(page.getByLabel("결과 내용")).toBeVisible();
    await expect(
      page.getByRole("list", { name: "이전 완료의 결과" }),
    ).toBeVisible();
  });

  test("editing keeps state; a concurrent edit keeps the draft", async ({
    page,
    context,
  }) => {
    await signInAt(page, `/tasks/${shared.taskId}/edit`);
    await expect(
      page.getByRole("button", { name: "저장", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("설명").fill("내가 쓴 설명");
    const other = await context.newPage();
    await other.goto(`/tasks/${shared.taskId}/edit`);
    await other.getByLabel("제목", { exact: true }).fill("다른 탭이 바꾼 제목");
    await other.getByRole("button", { name: "저장", exact: true }).click();
    await expect(
      other.getByRole("heading", { name: "다른 탭이 바꾼 제목", level: 1 }),
    ).toBeVisible();
    await other.close();

    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      "다른 곳에서 먼저 바뀌었습니다",
    );
    expect(await textOf(page, "latest-title")).toBe("다른 탭이 바꾼 제목");
    await expect(page.getByLabel("설명")).toHaveValue("내가 쓴 설명");
    await page.getByRole("button", { name: "최신 버전 위에 저장" }).click();
    await expect(page.getByText("내가 쓴 설명")).toBeVisible();
    await expect(page.getByText("완료").first()).toBeVisible();
  });

  test("a stale move from the list is refused and the list shows the truth", async ({
    page,
  }) => {
    await signInAt(page, "/tasks");
    const task = await apiCreateTask(page, shared.workspace, "낡은 화면 할일");
    await page.reload();
    await expect(
      page.getByRole("link", { name: "낡은 화면 할일" }),
    ).toBeVisible();
    // Another tab cancels it; this list still shows it as open.
    await apiPost(
      page,
      `/api/v1/workspaces/${shared.workspace}/tasks/${task.id}/transition`,
      {
        baseVersion: task.version,
        targetState: "CANCELED",
      },
    );
    await page.getByRole("button", { name: "낡은 화면 할일 완료" }).click();
    await expect(page.getByText("다른 곳에서 먼저 바뀌었습니다")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "낡은 화면 할일 완료" }),
    ).toHaveCount(0);
  });

  test("a task with a date-time due is shown in its own zone, and context links work", async ({
    page,
  }) => {
    await signInAt(page, "/contexts");
    await apiCreateContext(page, shared.workspace, "주제 맥락");
    const ctx = await apiCreateContext(
      page,
      shared.workspace,
      "할일 맥락",
      "프로젝트 목적",
      "PROJECT",
    );
    await page.goto("/tasks/new");
    await page.getByLabel("제목", { exact: true }).fill("시각 기한 할일");
    await page.getByLabel("기한", { exact: true }).selectOption("INSTANT");
    await page.getByLabel("기한 시간대").fill("Asia/Seoul");
    await page.getByLabel("기한 시각").fill("2028-03-01T09:30");
    await page
      .getByLabel("맥락", { exact: true })
      .selectOption({ label: "할일 맥락" });
    await page.getByRole("button", { name: "할일 만들기" }).click();
    await expect(
      page.getByRole("heading", { name: "시각 기한 할일", level: 1 }),
    ).toBeVisible();
    expect(await textOf(page, "task-due")).toContain("Asia/Seoul");
    await page.getByRole("link", { name: "할일 맥락" }).click();
    await expect(page).toHaveURL(new RegExp(`/contexts/${ctx.id}$`));
  });

  test("a repeated or skipped due time is caught before saving", async ({
    page,
  }) => {
    await signInAt(page, "/tasks/new");
    await page.getByLabel("제목", { exact: true }).fill("서머타임 기한");
    await page.getByLabel("기한", { exact: true }).selectOption("INSTANT");
    await page.getByLabel("기한 시간대").fill("America/New_York");
    // 2028-03-12 02:30 does not exist (clocks jump 02:00 → 03:00).
    await page.getByLabel("기한 시각").fill("2028-03-12T02:30");
    await expect(page.getByText("존재하지 않습니다").first()).toBeVisible();
    await page.getByRole("button", { name: "할일 만들기" }).click();
    await expect(page.getByText("존재하지 않습니다").first()).toBeVisible();
    await expect(page).toHaveURL(/\/tasks\/new$/);
    // 2028-11-05 01:30 happens twice; one must be chosen.
    await page.getByLabel("기한 시각").fill("2028-11-05T01:30");
    await page.getByRole("button", { name: "할일 만들기" }).click();
    await expect(page.getByText("하루에 두 번").first()).toBeVisible();
    await page
      .getByLabel(/하루에 두 번 있는 시각입니다/)
      .selectOption({ index: 2 });
    await page.getByRole("button", { name: "할일 만들기" }).click();
    await expect(
      page.getByRole("heading", { name: "서머타임 기한", level: 1 }),
    ).toBeVisible();
    expect(await textOf(page, "task-due")).toContain("America/New_York");
  });

  test("editing the source capture never reopens a finished task", async ({
    page,
  }) => {
    await signInAt(page, "/tasks");
    const capture = await apiCreateCapture(
      page,
      shared.workspace,
      "출처 기록",
      "TODO: 원문에서 만든 할일",
    );
    const task = await apiCreateTask(
      page,
      shared.workspace,
      "원문에서 만든 할일",
      {
        origin: { unitId: capture.unitId, revision: 1 },
      },
    );
    await apiPost(
      page,
      `/api/v1/workspaces/${shared.workspace}/tasks/${task.id}/transition`,
      { baseVersion: task.version, targetState: "DONE" },
    );
    await page.goto(`/captures/${capture.id}/edit`);
    await page
      .getByLabel("내용", { exact: true })
      .fill("고친 원문: 이 할일은 없어졌다");
    await page.getByRole("button", { name: "새 revision으로 저장" }).click();
    await expect(page.getByText("revision 2 / 2")).toBeVisible();
    await page.goto(`/tasks/${task.id}`);
    await expect(page.getByText("완료").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "다시 할 일로" }),
    ).toBeVisible();
    await expect(page.getByLabel("결과 내용")).toBeVisible();
  });

  test("filtering by state and paging through many tasks", async ({ page }) => {
    await signInAt(page, "/tasks");
    for (let index = 0; index < 55; index++)
      await apiCreateTask(page, shared.workspace, `대량 할일 ${index}`);
    await page.reload();
    const items = page
      .getByRole("list", { name: "할일 목록" })
      .getByRole("listitem");
    await expect(items).toHaveCount(50);
    await page.getByRole("button", { name: "더 보기" }).click();
    await expect.poll(() => items.count()).toBeGreaterThan(50);
    await page.getByLabel("상태", { exact: true }).selectOption("DONE");
    await expect(page).toHaveURL(/state=DONE/);
    await expect(page.getByRole("link", { name: /대량 할일/ })).toHaveCount(0);
  });

  test("another account cannot open the task, and 320px fits", async ({
    page,
    browser,
  }) => {
    await signInAt(page, "/tasks");
    const invitation = await apiPost<{ token: string }>(
      page,
      "/api/v1/ops/invitations",
      {
        email: "taskreader@example.test",
      },
    );
    await apiPost(page, "/api/v1/invitations/accept", {
      token: invitation.token,
      name: "다른 사람",
      password: "e2e task reader fixture password 1234",
    });
    const other = await browser.newContext({ baseURL: origin });
    const guest = await other.newPage();
    await signInAt(guest, `/tasks/${shared.taskId}`, {
      email: "taskreader@example.test",
      password: "e2e task reader fixture password 1234",
    });
    await expect(
      guest.getByRole("heading", { name: "찾을 수 없음", exact: true }),
    ).toBeVisible();
    await other.close();

    await page.setViewportSize({ width: 320, height: 800 });
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
    await page.goto("/tasks");
    await expect(page.getByRole("list", { name: "할일 목록" })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.goto(`/tasks/${shared.taskId}`);
    await expect(page.getByRole("list", { name: "상태 이력" })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
  });
});
