import { expect, test, type Page } from "@playwright/test";
import {
  apiCreateCapture,
  apiCreateContext,
  apiPost,
  login,
  logout,
  menu,
  origin,
  signInAt,
  workspaceIdOf,
} from "./helpers";

const reader = {
  email: "ctxreader@example.test",
  password: "e2e ctx reader fixture password 1234",
};

async function textOf(page: Page, testId: string): Promise<string> {
  return page.getByTestId(testId).evaluate((node) => node.textContent ?? "");
}

const shared = {
  workspace: "",
  captureId: "",
  captureTitle: "맥락 연결용 기록",
  captureBody: "달리기 후 회복에 대해 적은 문장입니다.",
  firstContextId: "",
};

test.describe.serial("M3 맥락", () => {
  test("creating a context explains bad input and saves once", async ({
    page,
  }) => {
    await signInAt(page, "/contexts/new");
    await page.getByRole("button", { name: "맥락 만들기" }).click();
    await expect(page.getByText("이름을 입력해 주세요.")).toBeVisible();
    await expect(page.getByText("왜 함께 보는지 적어 주세요.")).toBeVisible();
    await expect(
      page.getByText("무엇을 다루고 무엇은 제외하는지 적어 주세요."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/contexts\/new$/);

    await page.getByLabel("이름", { exact: true }).fill("맥락 가");
    await page.getByLabel("종류").selectOption("PROJECT");
    await page
      .getByLabel("목적", { exact: true })
      .fill("달리기 기록을 모아 본다");
    await page
      .getByLabel("범위", { exact: true })
      .fill("훈련과 회복만, 대회 후기는 제외");
    await page.getByRole("button", { name: "맥락 만들기" }).dblclick();
    await expect(
      page.getByRole("heading", { name: "맥락 가", exact: true, level: 1 }),
    ).toBeVisible();
    shared.firstContextId = /\/contexts\/([0-9a-f-]{36})/.exec(page.url())![1]!;
    expect(await textOf(page, "context-purpose")).toBe(
      "달리기 기록을 모아 본다",
    );
    await menu(page, "맥락").click();
    await expect(
      page.getByRole("link", { name: "맥락 가", exact: true }),
    ).toHaveCount(1);

    shared.workspace = await workspaceIdOf(page);
    const capture = await apiCreateCapture(
      page,
      shared.workspace,
      shared.captureTitle,
      shared.captureBody,
    );
    shared.captureId = capture.id;
    await apiCreateContext(page, shared.workspace, "맥락 나");
  });

  test("one unit joins several contexts, and only one may be primary", async ({
    page,
  }) => {
    await signInAt(page, `/captures/${shared.captureId}`);
    await page.getByRole("button", { name: "맥락 연결" }).click();
    const dialog = page.getByRole("dialog", { name: "이 단위의 맥락 연결" });
    await dialog.getByRole("checkbox", { name: "맥락 가" }).check();
    await expect(dialog.getByLabel("맥락 가 역할")).toHaveValue("PRIMARY");
    await dialog.getByRole("checkbox", { name: "맥락 나" }).check();
    await expect(dialog.getByLabel("맥락 나 역할")).toHaveValue("SECONDARY");

    await dialog.getByLabel("맥락 나 역할").selectOption("PRIMARY");
    await expect(
      dialog.getByText("대표 맥락은 하나만 지정할 수 있습니다."),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "연결 저장" }),
    ).toBeDisabled();
    await dialog.getByLabel("맥락 나 역할").selectOption("SECONDARY");
    await dialog.getByRole("button", { name: "연결 저장" }).click();
    await expect(dialog).toBeHidden();

    const cell = page.getByRole("table", { name: "이 revision의 단위" });
    await expect(cell.getByRole("link", { name: "맥락 가" })).toBeVisible();
    await expect(cell.getByRole("link", { name: "맥락 나" })).toBeVisible();

    await page.goto(`/contexts/${shared.firstContextId}`);
    const members = page.getByRole("list", { name: "연결된 기록" });
    await expect(members).toContainText(shared.captureTitle);
    await expect(members).toContainText(shared.captureBody);
    await expect(members).toContainText("대표");
  });

  test("a stale membership save is refused and the latest links are reloaded", async ({
    page,
    context,
  }) => {
    await signInAt(page, `/captures/${shared.captureId}`);
    await page.getByRole("button", { name: "맥락 연결" }).click();
    const stale = page.getByRole("dialog", { name: "이 단위의 맥락 연결" });
    await expect(
      stale.getByRole("checkbox", { name: "맥락 가" }),
    ).toBeChecked();

    const other = await context.newPage();
    await other.goto(`/captures/${shared.captureId}`);
    await other.getByRole("button", { name: "맥락 연결" }).click();
    const fresh = other.getByRole("dialog", { name: "이 단위의 맥락 연결" });
    await fresh.getByRole("checkbox", { name: "맥락 나" }).uncheck();
    await fresh.getByRole("button", { name: "연결 저장" }).click();
    await expect(fresh).toBeHidden();
    await other.close();

    await stale.getByRole("checkbox", { name: "맥락 가" }).uncheck();
    await stale.getByRole("button", { name: "연결 저장" }).click();
    await expect(
      stale.getByText("다른 곳에서 연결이 먼저 바뀌었습니다"),
    ).toBeVisible();
    // The local edit is discarded and the other tab's change is shown.
    await expect(
      stale.getByRole("checkbox", { name: "맥락 나" }),
    ).not.toBeChecked();
    await expect(
      stale.getByRole("checkbox", { name: "맥락 가" }),
    ).toBeChecked();
    await stale.getByRole("button", { name: "닫기" }).last().click();
  });

  test("context relations: add, show from both sides, refuse a parent cycle, end", async ({
    page,
  }) => {
    await signInAt(page, "/contexts");
    const parent = await apiCreateContext(page, shared.workspace, "관계 상위");
    const child = await apiCreateContext(page, shared.workspace, "관계 하위");
    await page.goto(`/contexts/${parent.id}`);
    await page.getByLabel("관계", { exact: true }).selectOption("child");
    await page.getByLabel("대상 맥락").selectOption({ label: "관계 하위" });
    await page.getByRole("button", { name: "관계 추가" }).click();
    const relations = page.getByRole("list", { name: "맥락 관계" });
    await expect(relations).toContainText("하위");
    await expect(relations).toContainText("관계 하위");

    await page.goto(`/contexts/${child.id}`);
    await expect(page.getByRole("list", { name: "맥락 관계" })).toContainText(
      "상위",
    );
    await page.getByLabel("관계", { exact: true }).selectOption("child");
    await page.getByLabel("대상 맥락").selectOption({ label: "관계 상위" });
    await page.getByRole("button", { name: "관계 추가" }).click();
    await expect(page.getByRole("alert")).toContainText("서로를 가리키게");

    await page.goto(`/contexts/${parent.id}`);
    await page.getByRole("button", { name: "관계 하위 연결 끊기" }).click();
    await expect(page.getByText("연결된 맥락이 없습니다.")).toBeVisible();
  });

  test("editing adds a revision; a concurrent edit keeps the draft", async ({
    page,
    context,
  }) => {
    await signInAt(page, "/contexts");
    const target = await apiCreateContext(
      page,
      shared.workspace,
      "수정할 맥락",
    );
    await page.goto(`/contexts/${target.id}/edit`);
    await expect(
      page.getByRole("button", { name: "새 revision으로 저장" }),
    ).toBeDisabled();
    await page.getByLabel("목적", { exact: true }).fill("내가 쓴 목적");
    const other = await context.newPage();
    await other.goto(`/contexts/${target.id}/edit`);
    await other.getByLabel("이름", { exact: true }).fill("다른 탭이 바꾼 이름");
    await other.getByRole("button", { name: "새 revision으로 저장" }).click();
    await expect(other.getByText("revision 2")).toBeVisible();
    await other.close();

    await page.getByRole("button", { name: "새 revision으로 저장" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "다른 곳에서 먼저 바뀌었습니다",
    );
    expect(await textOf(page, "latest-name")).toBe("다른 탭이 바꾼 이름");
    await expect(page.getByLabel("목적", { exact: true })).toHaveValue(
      "내가 쓴 목적",
    );
    await page.getByRole("button", { name: "최신 버전 위에 저장" }).click();
    await expect(page.getByText("revision 3")).toBeVisible();
    expect(await textOf(page, "context-purpose")).toBe("내가 쓴 목적");
  });

  test("archived contexts leave the list, stay linked, and cannot be newly linked", async ({
    page,
  }) => {
    await signInAt(page, "/contexts");
    const linked = await apiCreateContext(
      page,
      shared.workspace,
      "보관될 연결 맥락",
    );
    const idle = await apiCreateContext(
      page,
      shared.workspace,
      "보관될 빈 맥락",
    );
    await apiCreateContext(page, shared.workspace, "활성 맥락");
    const capture = await apiCreateCapture(
      page,
      shared.workspace,
      "보관 확인 기록",
      "본문",
    );
    const detail = (await (
      await page.request.get(
        `/api/v1/workspaces/${shared.workspace}/captures/${capture.id}`,
      )
    ).json()) as { units: { id: string }[] };
    await apiPost(
      page,
      `/api/v1/workspaces/${shared.workspace}/units/${detail.units[0]!.id}/memberships`,
      {
        baseVersion: 1,
        memberships: [{ contextId: linked.id, role: "SECONDARY" }],
      },
    );
    for (const target of [linked, idle])
      await apiPost(
        page,
        `/api/v1/workspaces/${shared.workspace}/contexts/${target.id}/identity`,
        { baseRevision: 1, state: "ARCHIVED" },
      );

    await page.goto("/contexts");
    await expect(
      page.getByRole("link", { name: "보관될 연결 맥락" }),
    ).toHaveCount(0);
    await page.getByLabel("보관한 맥락도 보기").click();
    await expect(page.getByLabel("보관한 맥락도 보기")).toBeChecked();
    await page.getByRole("link", { name: "보관될 연결 맥락" }).click();
    await expect(page.getByRole("button", { name: "수정" })).toHaveCount(0);
    await page.goto(`/contexts/${linked.id}/edit`);
    await expect(page.getByText("수정할 수 없습니다")).toBeVisible();

    await page.goto(`/captures/${capture.id}`);
    await page.getByRole("button", { name: "맥락 연결" }).click();
    const dialog = page.getByRole("dialog", { name: "이 단위의 맥락 연결" });
    await expect(
      dialog.getByRole("checkbox", { name: "보관될 연결 맥락 (보관됨)" }),
    ).toBeChecked();
    await expect(
      dialog.getByRole("checkbox", { name: "활성 맥락" }),
    ).toBeVisible();
    await expect(dialog.getByText("보관될 빈 맥락")).toHaveCount(0);
  });

  test("archiving from the detail page asks first", async ({ page }) => {
    await signInAt(page, "/contexts");
    const target = await apiCreateContext(
      page,
      shared.workspace,
      "화면에서 보관",
    );
    await page.goto(`/contexts/${target.id}`);
    await page.getByRole("button", { name: "보관", exact: true }).click();
    await page
      .getByRole("dialog", { name: "이 맥락을 보관할까요?" })
      .getByRole("button", { name: "보관하기" })
      .click();
    await expect(page).toHaveURL(/\/contexts$/);
    await expect(page.getByRole("link", { name: "화면에서 보관" })).toHaveCount(
      0,
    );
  });

  test("search narrows the list and the list pages through many contexts", async ({
    page,
  }) => {
    await signInAt(page, "/contexts");
    for (let index = 0; index < 55; index++)
      await apiCreateContext(page, shared.workspace, `대량 맥락 ${index}`);
    await page.goto("/contexts");
    const items = page
      .getByRole("list", { name: "맥락 목록" })
      .getByRole("listitem");
    await expect(items).toHaveCount(50);
    await page.getByRole("button", { name: "더 보기" }).click();
    await expect.poll(() => items.count()).toBeGreaterThan(50);

    await page.getByLabel("이름 검색", { exact: true }).fill("대량 맥락 7");
    await page.getByRole("button", { name: "검색" }).click();
    await expect(page).toHaveURL(/q=/);
    await expect(items).toHaveCount(1);
    await page.getByLabel("이름 검색", { exact: true }).fill("없는 이름 zzz");
    await page.getByRole("button", { name: "검색" }).click();
    await expect(page.getByText("검색 결과가 없습니다.")).toBeVisible();
  });

  test("another account cannot open or see these contexts", async ({
    page,
    browser,
  }) => {
    await signInAt(page, "/contexts");
    const invitation = await apiPost<{ token: string }>(
      page,
      "/api/v1/ops/invitations",
      {
        email: reader.email,
      },
    );
    await apiPost(page, "/api/v1/invitations/accept", {
      token: invitation.token,
      name: "다른 사람",
      password: reader.password,
    });
    const other = await browser.newContext({ baseURL: origin });
    const guest = await other.newPage();
    await signInAt(guest, `/contexts/${shared.firstContextId}`, reader);
    await expect(
      guest.getByRole("heading", { name: "찾을 수 없음", exact: true }),
    ).toBeVisible();
    await expect(guest.getByText("달리기 기록을 모아 본다")).toHaveCount(0);
    await guest.goto("/contexts");
    await expect(guest.getByText("아직 맥락이 없습니다")).toBeVisible();
    await logout(guest);
    await login(guest, reader.email, reader.password);
    await other.close();
  });

  test("list, detail and forms fit a 320px screen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await signInAt(page, "/contexts");
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.goto(`/contexts/${shared.firstContextId}`);
    await expect(page.getByTestId("context-purpose")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.goto("/contexts/new");
    await expect(page.getByLabel("이름", { exact: true })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.goto(`/captures/${shared.captureId}`);
    await page.getByRole("button", { name: "맥락 연결" }).click();
    await expect(
      page.getByRole("dialog", { name: "이 단위의 맥락 연결" }),
    ).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
  });
});
