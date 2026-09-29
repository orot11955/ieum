import { expect, test, type Page } from "@playwright/test";
import {
  apiCreateEvent,
  apiPost,
  origin,
  signInAt,
  workspaceIdOf,
} from "./helpers";

async function textOf(page: Page, testId: string): Promise<string> {
  return page
    .getByTestId(testId)
    .first()
    .evaluate((node) => node.textContent ?? "");
}

async function viewerZone(page: Page): Promise<string> {
  const me = await page.request.get("/api/v1/me");
  return ((await me.json()) as { preferences: { timeZone: string } })
    .preferences.timeZone;
}

const cell = (page: Page, date: string) =>
  page.locator(`td[data-date="${date}"]`);

async function eventId(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/calendar\/events\/[0-9a-f-]{36}$/);
  return /events\/([0-9a-f-]{36})/.exec(page.url())![1]!;
}

const shared = { workspace: "" };

test.describe.serial("M4 일정", () => {
  test("creating a timed event explains bad input and shows on the month grid", async ({
    page,
  }) => {
    await signInAt(page, "/calendar/new?date=2028-04-10");
    shared.workspace = await workspaceIdOf(page);
    await page.getByRole("button", { name: "일정 만들기" }).click();
    await expect(page.getByText("제목을 입력해 주세요.")).toBeVisible();
    await page.getByLabel("제목", { exact: true }).fill("팀 회의");
    await page.getByLabel("시작", { exact: true }).fill("2028-04-10T15:00");
    await page.getByLabel("끝", { exact: true }).fill("2028-04-10T14:00");
    await page.getByRole("button", { name: "일정 만들기" }).click();
    await expect(
      page.getByText("끝나는 시각은 시작보다 뒤여야 합니다."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/calendar\/new/);
    await page.getByLabel("끝", { exact: true }).fill("2028-04-10T16:00");
    await page.getByLabel("시간대", { exact: true }).fill("Asia/Seoul");
    await page.getByRole("button", { name: "일정 만들기" }).dblclick();
    await expect(
      page.getByRole("heading", { name: "팀 회의", level: 1 }),
    ).toBeVisible();
    await eventId(page);
    expect(await textOf(page, "event-time")).toContain("Asia/Seoul");
    await page.goto("/calendar?month=2028-04");
    await expect(
      cell(page, "2028-04-10").getByRole("link", { name: /팀 회의/ }),
    ).toHaveCount(1);
    await expect(page.getByRole("list", { name: "일정 목록" })).toContainText(
      "팀 회의",
    );
  });

  test("an all-day event spanning a leap day appears on every covered day", async ({
    page,
  }) => {
    await signInAt(page, "/calendar/new?date=2028-02-27");
    await page.getByLabel("제목", { exact: true }).fill("출장");
    await page.getByLabel("종류", { exact: true }).selectOption("ALL_DAY");
    await page.getByLabel("시작 날짜").fill("2028-02-27");
    await page.getByLabel("끝 날짜").fill("2028-03-01");
    await page.getByRole("button", { name: "일정 만들기" }).click();
    await expect(
      page.getByRole("heading", { name: "출장", level: 1 }),
    ).toBeVisible();
    expect(await textOf(page, "event-time")).toContain("종일");
    await page.goto("/calendar?month=2028-02");
    for (const day of ["2028-02-27", "2028-02-28", "2028-02-29"])
      await expect(
        cell(page, day).getByRole("link", { name: "출장" }),
      ).toHaveCount(1);
    // March 1 is the last day; March 2 is not covered.
    await page.goto("/calendar?month=2028-03");
    await expect(
      cell(page, "2028-03-01").getByRole("link", { name: "출장" }),
    ).toHaveCount(1);
    await expect(
      cell(page, "2028-03-02").getByRole("link", { name: "출장" }),
    ).toHaveCount(0);
  });

  test("a time skipped by a clock change is refused; a repeated hour needs a choice", async ({
    page,
  }) => {
    await signInAt(page, "/calendar/new?date=2028-03-12");
    await page.getByLabel("제목", { exact: true }).fill("서머타임 시작일");
    await page.getByLabel("시간대", { exact: true }).fill("America/New_York");
    await page.getByLabel("시작", { exact: true }).fill("2028-03-12T02:30");
    await page.getByLabel("끝", { exact: true }).fill("2028-03-12T04:30");
    await expect(page.getByText("존재하지 않습니다").first()).toBeVisible();
    await page.getByRole("button", { name: "일정 만들기" }).click();
    await expect(page).toHaveURL(/\/calendar\/new/);
    await page.getByLabel("시작", { exact: true }).fill("2028-03-12T03:30");
    await page.getByRole("button", { name: "일정 만들기" }).click();
    await expect(
      page.getByRole("heading", { name: "서머타임 시작일", level: 1 }),
    ).toBeVisible();

    await page.goto("/calendar/new?date=2028-11-05");
    await page.getByLabel("제목", { exact: true }).fill("서머타임 종료일");
    await page.getByLabel("시간대", { exact: true }).fill("America/New_York");
    await page.getByLabel("시작", { exact: true }).fill("2028-11-05T01:30");
    await page.getByLabel("끝", { exact: true }).fill("2028-11-05T03:30");
    await page.getByRole("button", { name: "일정 만들기" }).click();
    await expect(page.getByText("하루에 두 번").first()).toBeVisible();
    await expect(page).toHaveURL(/\/calendar\/new/);
    // Choose the later of the two 01:30 (standard time, UTC-05:00): option 0 is the placeholder.
    await page.getByLabel(/시작: 하루에 두 번/).selectOption({ index: 2 });
    await page.getByRole("button", { name: "일정 만들기" }).click();
    const id = await eventId(page);
    const detail = (await (
      await page.request.get(
        `/api/v1/workspaces/${shared.workspace}/events/${id}`,
      )
    ).json()) as { schedule: { startAt: string; endAt: string } };
    expect(Date.parse(detail.schedule.startAt)).toBe(
      Date.UTC(2028, 10, 5, 6, 30),
    );
    // 01:30 EST to 03:30 EST is two real hours, not three.
    expect(
      (Date.parse(detail.schedule.endAt) -
        Date.parse(detail.schedule.startAt)) /
        3_600_000,
    ).toBe(2);
    await page.goto(`/calendar/events/${id}/edit`);
    await expect(page.getByLabel(/시작: 하루에 두 번/)).toHaveValue("-300");
  });

  test("an event in another zone is also shown in the viewer's zone and on the right day", async ({
    page,
  }) => {
    await signInAt(page, "/calendar");
    const zone = await viewerZone(page);
    const other =
      zone === "Pacific/Auckland" ? "America/Los_Angeles" : "Pacific/Auckland";
    const created = await apiCreateEvent(
      page,
      shared.workspace,
      "다른 시간대 일정",
      {
        kind: "TIMED",
        timeZone: other,
        startLocal: "2028-05-10T23:30:00",
        endLocal: "2028-05-11T00:30:00",
      },
    );
    await page.goto(`/calendar/events/${created.id}`);
    await expect(page.getByTestId("event-time").first()).toContainText(other);
    await expect(page.getByText(`내 시간대(${zone})`)).toBeVisible();
    await page.goto("/calendar?month=2028-05");
    await expect(
      page
        .getByRole("list", { name: "일정 목록" })
        .getByRole("link", { name: "다른 시간대 일정" }),
    ).toBeVisible();
  });

  test("overlapping events are marked in the list", async ({ page }) => {
    await signInAt(page, "/calendar");
    for (const title of ["겹침 가", "겹침 나"])
      await apiCreateEvent(page, shared.workspace, title, {
        kind: "TIMED",
        timeZone: "Asia/Seoul",
        startLocal: "2028-06-15T10:00:00",
        endLocal: "2028-06-15T11:00:00",
      });
    await page.goto("/calendar?month=2028-06");
    const list = page.getByRole("list", { name: "일정 목록" });
    await expect(list).toContainText("겹침: 겹침 나");
    await expect(list).toContainText("겹침: 겹침 가");
  });

  test("canceling hides an event by default, restoring brings it back, a stale action is refused", async ({
    page,
  }) => {
    await signInAt(page, "/calendar");
    const created = await apiCreateEvent(page, shared.workspace, "취소 시험", {
      kind: "TIMED",
      timeZone: "Asia/Seoul",
      startLocal: "2028-07-04T09:00:00",
      endLocal: "2028-07-04T10:00:00",
    });
    await page.goto(`/calendar/events/${created.id}`);
    await page.getByRole("button", { name: "일정 취소" }).click();
    await expect(page.getByText("취소됨").first()).toBeVisible();
    await page.goto("/calendar?month=2028-07");
    await expect(
      cell(page, "2028-07-04").getByRole("link", { name: /취소 시험/ }),
    ).toHaveCount(0);
    await page.getByLabel("취소된 일정도 보기").click();
    await expect(page.getByLabel("취소된 일정도 보기")).toBeChecked();
    await expect(
      cell(page, "2028-07-04").getByRole("link", { name: /\(취소\)/ }),
    ).toHaveCount(1);

    await page.goto(`/calendar/events/${created.id}`);
    await expect(page.getByRole("button", { name: "일정 복구" })).toBeVisible();
    // Restored elsewhere after this page loaded; it still offers to restore.
    await apiPost(
      page,
      `/api/v1/workspaces/${shared.workspace}/events/${created.id}/state`,
      {
        baseVersion: 2,
        targetState: "CONFIRMED",
      },
    );
    await page.getByRole("button", { name: "일정 복구" }).click();
    await expect(page.getByText("다른 곳에서 먼저 바뀌었습니다")).toBeVisible();
    await expect(page.getByRole("button", { name: "일정 취소" })).toBeVisible();
  });

  test("editing keeps a concurrent change visible and the draft intact", async ({
    page,
    context,
  }) => {
    await signInAt(page, "/calendar");
    const created = await apiCreateEvent(page, shared.workspace, "수정 시험", {
      kind: "ALL_DAY",
      timeZone: "Asia/Seoul",
      startDate: "2028-08-01",
      endDateExclusive: "2028-08-02",
    });
    await page.goto(`/calendar/events/${created.id}/edit`);
    await expect(
      page.getByRole("button", { name: "저장", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("설명").fill("내 메모");
    const other = await context.newPage();
    await other.goto(`/calendar/events/${created.id}/edit`);
    await other.getByLabel("제목", { exact: true }).fill("다른 탭 제목");
    await other.getByRole("button", { name: "저장", exact: true }).click();
    await expect(
      other.getByRole("heading", { name: "다른 탭 제목", level: 1 }),
    ).toBeVisible();
    await other.close();
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      "다른 곳에서 먼저 바뀌었습니다",
    );
    expect(await textOf(page, "latest-title")).toBe("다른 탭 제목");
    await expect(page.getByLabel("설명")).toHaveValue("내 메모");
    await page.getByRole("button", { name: "최신 버전 위에 저장" }).click();
    await expect(page.getByText("내 메모")).toBeVisible();
  });

  test("month navigation moves through months and ignores a bad month", async ({
    page,
  }) => {
    await signInAt(page, "/calendar?month=2028-12");
    await expect(
      page.getByRole("heading", { name: "2028년 12월", level: 1 }),
    ).toBeVisible();
    await page.getByRole("button", { name: "다음 달" }).click();
    await expect(
      page.getByRole("heading", { name: "2029년 1월", level: 1 }),
    ).toBeVisible();
    await expect(page).toHaveURL(/month=2029-01/);
    await page.getByRole("button", { name: "이전 달" }).click();
    await page.getByRole("button", { name: "이전 달" }).click();
    await expect(
      page.getByRole("heading", { name: "2028년 11월", level: 1 }),
    ).toBeVisible();
    await page.goto("/calendar?month=abcd-99");
    await expect(page.getByRole("table", { name: "월간 일정" })).toBeVisible();
    await page.getByRole("button", { name: "오늘" }).click();
    await expect(page.getByRole("table", { name: "월간 일정" })).toBeVisible();
  });

  test("another account cannot open the event, and 320px fits", async ({
    page,
    browser,
  }) => {
    await signInAt(page, "/calendar");
    const created = await apiCreateEvent(
      page,
      shared.workspace,
      "비공개 일정",
      {
        kind: "ALL_DAY",
        timeZone: "Asia/Seoul",
        startDate: "2028-09-01",
        endDateExclusive: "2028-09-02",
      },
    );
    const invitation = await apiPost<{ token: string }>(
      page,
      "/api/v1/ops/invitations",
      {
        email: "calreader@example.test",
      },
    );
    const password = "e2e calendar reader fixture password 1234";
    await apiPost(page, "/api/v1/invitations/accept", {
      token: invitation.token,
      name: "다른 사람",
      password,
    });
    const other = await browser.newContext({ baseURL: origin });
    const guest = await other.newPage();
    await signInAt(guest, `/calendar/events/${created.id}`, {
      email: "calreader@example.test",
      password,
    });
    await expect(
      guest.getByRole("heading", { name: "찾을 수 없음", exact: true }),
    ).toBeVisible();
    await expect(guest.getByText("비공개 일정")).toHaveCount(0);
    await other.close();

    await page.setViewportSize({ width: 320, height: 800 });
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
    await page.goto("/calendar?month=2028-09");
    await expect(page.getByRole("table", { name: "월간 일정" })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.goto("/calendar/new");
    await expect(page.getByLabel("제목", { exact: true })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
  });
});
