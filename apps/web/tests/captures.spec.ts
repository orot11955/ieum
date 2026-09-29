import { expect, test, type Page } from "@playwright/test";
import { login, logout, menu, origin, signInAt } from "./helpers";

const reader = {
  email: "reader@example.test",
  password: "e2e reader fixture password 1234",
};
const emojiBody = "가나다😀라마바";

async function textOf(page: Page, testId: string): Promise<string> {
  return page.getByTestId(testId).evaluate((node) => node.textContent ?? "");
}

async function createViaUi(page: Page, title: string, body: string) {
  await page.goto("/captures/new");
  await page.getByLabel("제목", { exact: true }).fill(title);
  await page.getByLabel("내용", { exact: true }).fill(body);
  await page.getByRole("button", { name: "기록 저장" }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true, level: 1 }),
  ).toBeVisible();
  return /\/captures\/([0-9a-f-]{36})/.exec(page.url())![1]!;
}

const shared: { firstId: string; splitId: string } = {
  firstId: "",
  splitId: "",
};

test.describe.serial("M2 기록함과 원문", () => {
  test("creating keeps the raw text exactly, and bad input is explained", async ({
    page,
  }) => {
    await signInAt(page, "/captures/new");
    await page.getByRole("button", { name: "기록 저장" }).click();
    await expect(page.getByText("제목을 입력해 주세요.")).toBeVisible();
    await expect(page.getByText("내용을 입력해 주세요.")).toBeVisible();
    await page.getByLabel("제목", { exact: true }).fill("공백만 있는 내용");
    await page.getByLabel("내용", { exact: true }).fill("   \n  ");
    await page.getByRole("button", { name: "기록 저장" }).click();
    await expect(page.getByText("내용을 입력해 주세요.")).toBeVisible();
    await expect(page).toHaveURL(/\/captures\/new$/);

    const body = "첫 줄 😀\n  들여쓴 둘째 줄  \n\n끝";
    await page.getByLabel("제목", { exact: true }).fill("첫 기록");
    await page.getByLabel("내용", { exact: true }).fill(body);
    // A double click must not create two captures.
    await page.getByRole("button", { name: "기록 저장" }).dblclick();
    await expect(
      page.getByRole("heading", { name: "첫 기록", exact: true, level: 1 }),
    ).toBeVisible();
    shared.firstId = /\/captures\/([0-9a-f-]{36})/.exec(page.url())![1]!;
    expect(await textOf(page, "raw-body")).toBe(body);
    await menu(page, "기록함").click();
    await expect(
      page.getByRole("link", { name: "첫 기록", exact: true }),
    ).toHaveCount(1);
  });

  test("Korean IME composition is not disturbed by re-rendering", async ({
    page,
  }) => {
    await signInAt(page, "/captures/new");
    const body = page.getByLabel("내용", { exact: true });
    await body.focus();
    const client = await page.context().newCDPSession(page);
    const compose = async (text: string) =>
      client.send("Input.imeSetComposition", {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
      });
    // 한: ㅎ → 하 → 한, committed; then 글: ㄱ → 그 → 글, committed.
    for (const step of ["ㅎ", "하", "한"]) await compose(step);
    await expect(body).toHaveValue("한");
    await client.send("Input.insertText", { text: "한" });
    for (const step of ["ㄱ", "그", "글"]) {
      await compose(step);
      // The byte counter re-renders the form while the syllable is still open.
      await expect(page.getByText(/\/ 200,000 바이트/)).toBeVisible();
    }
    await client.send("Input.insertText", { text: "글" });
    await expect(body).toHaveValue("한글");
    await expect(page.getByText("6 / 200,000 바이트")).toBeVisible();
  });

  test("a failed save keeps the input and a retry saves exactly once", async ({
    page,
  }) => {
    await signInAt(page, "/captures/new");
    let attempts = 0;
    await page.route("**/api/v1/workspaces/*/captures", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      attempts++;
      if (attempts === 1)
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: "{}",
        });
      return route.fallback();
    });
    await page.getByLabel("제목", { exact: true }).fill("재시도 기록");
    await page
      .getByLabel("내용", { exact: true })
      .fill("실패 뒤에도 남아야 하는 문장");
    await page.getByRole("button", { name: "기록 저장" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "지금은 저장할 수 없습니다",
    );
    await expect(page.getByLabel("내용", { exact: true })).toHaveValue(
      "실패 뒤에도 남아야 하는 문장",
    );
    await page.getByRole("button", { name: "기록 저장" }).click();
    await expect(
      page.getByRole("heading", { name: "재시도 기록", exact: true, level: 1 }),
    ).toBeVisible();
    expect(attempts).toBe(2);
    await menu(page, "기록함").click();
    await expect(
      page.getByRole("link", { name: "재시도 기록", exact: true }),
    ).toHaveCount(1);
  });

  test("a body near the size limit is stored, and one over it is refused with guidance", async ({
    page,
  }) => {
    await signInAt(page, "/captures/new");
    // Korean syllables take 3 bytes each: 60,000 = 180 KB, 70,000 = 210 KB.
    await page.getByLabel("제목", { exact: true }).fill("긴 기록");
    await page.getByLabel("내용", { exact: true }).fill("가".repeat(70_000));
    await page.getByRole("button", { name: "기록 저장" }).click();
    await expect(page.getByText("내용이 너무 깁니다")).toBeVisible();
    await expect(page).toHaveURL(/\/captures\/new$/);
    await page.getByLabel("내용", { exact: true }).fill("가".repeat(60_000));
    await page.getByRole("button", { name: "기록 저장" }).click();
    await expect(
      page.getByRole("heading", { name: "긴 기록", exact: true, level: 1 }),
    ).toBeVisible();
    expect((await textOf(page, "raw-body")).length).toBe(60_000);
  });

  test("editing adds a revision and the old text stays readable and read-only", async ({
    page,
  }) => {
    await signInAt(page, `/captures/${shared.firstId}/edit`);
    await expect(
      page.getByRole("button", { name: "새 revision으로 저장" }),
    ).toBeDisabled();
    await page.getByLabel("내용", { exact: true }).fill("고친 내용");
    await page.getByRole("button", { name: "새 revision으로 저장" }).click();
    await expect(page.getByText("revision 2 / 2")).toBeVisible();
    expect(await textOf(page, "raw-body")).toBe("고친 내용");

    await page.getByRole("link", { name: "revision 1", exact: true }).click();
    await expect(page.getByText("지난 revision 1의 원문입니다")).toBeVisible();
    expect(await textOf(page, "raw-body")).toBe(
      "첫 줄 😀\n  들여쓴 둘째 줄  \n\n끝",
    );
    await expect(page.getByRole("button", { name: "수정" })).toHaveCount(0);
  });

  test("leaving an edit with unsaved text asks first", async ({ page }) => {
    await signInAt(page, `/captures/${shared.firstId}/edit`);
    await page.getByLabel("내용", { exact: true }).fill("저장하지 않은 문장");
    await menu(page, "기록함").click();
    const dialog = page.getByRole("dialog", {
      name: "저장하지 않은 내용이 있습니다",
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "계속 작성" }).click();
    await expect(page.getByLabel("내용", { exact: true })).toHaveValue(
      "저장하지 않은 문장",
    );
    await menu(page, "기록함").click();
    await page
      .getByRole("dialog", { name: "저장하지 않은 내용이 있습니다" })
      .getByRole("button", { name: "저장하지 않고 나가기" })
      .click();
    await expect(page).toHaveURL(/\/captures$/);
  });

  test("a concurrent edit keeps the draft and saves on top of the latest text", async ({
    page,
    context,
  }) => {
    await signInAt(page, `/captures/${shared.firstId}/edit`);
    await page.getByLabel("내용", { exact: true }).fill("내 초안");
    const other = await context.newPage();
    await other.goto(`/captures/${shared.firstId}/edit`);
    await other.getByLabel("내용", { exact: true }).fill("다른 탭이 먼저 저장");
    await other.getByRole("button", { name: "새 revision으로 저장" }).click();
    await expect(other.getByText("revision 3 / 3")).toBeVisible();
    await other.close();

    await page.getByRole("button", { name: "새 revision으로 저장" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "다른 곳에서 먼저 바뀌었습니다",
    );
    await expect(page.getByLabel("내용", { exact: true })).toHaveValue(
      "내 초안",
    );
    expect(await textOf(page, "latest-body")).toBe("다른 탭이 먼저 저장");
    await page.getByRole("button", { name: "최신 버전 위에 저장" }).click();
    await expect(page.getByText("revision 4 / 4")).toBeVisible();
    expect(await textOf(page, "raw-body")).toBe("내 초안");
  });

  test("splitting refuses the middle of an emoji and keeps the raw text", async ({
    page,
  }) => {
    await signInAt(page, "/captures/new");
    shared.splitId = await createViaUi(page, "나눌 기록", emojiBody);
    await page.getByRole("button", { name: "나누기" }).click();
    const area = page.getByLabel("원문 (읽기 전용)");
    const setCaret = (offset: number) =>
      area.evaluate((node: HTMLTextAreaElement, position) => {
        node.focus();
        node.setSelectionRange(position, position);
      }, offset);

    await setCaret(4);
    await page.getByRole("button", { name: "커서 위치에서 나누기" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "하나의 글자인 부분 중간",
    );
    await setCaret(0);
    await page.getByRole("button", { name: "커서 위치에서 나누기" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "처음이나 끝이 아닌 위치",
    );

    await setCaret(3);
    await page.getByRole("button", { name: "커서 위치에서 나누기" }).click();
    await setCaret(5);
    await page.getByRole("button", { name: "커서 위치에서 나누기" }).click();
    await expect(
      page.getByRole("button", { name: "3개로 나누어 저장" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "3개로 나누어 저장" }).click();

    await expect(page).toHaveURL(new RegExp(`/captures/${shared.splitId}$`));
    expect(await textOf(page, "raw-body")).toBe(emojiBody);
    const units = page.getByRole("table", { name: "이 revision의 단위" });
    await expect(units).toContainText("가나다");
    await expect(units).toContainText("😀");
    await expect(units).toContainText("라마바");
  });

  test("archiving hides a capture from the list and freezes it", async ({
    page,
  }) => {
    await signInAt(page, `/captures/${shared.splitId}`);
    await page.getByRole("button", { name: "보관", exact: true }).click();
    await page
      .getByRole("dialog", { name: "이 기록을 보관할까요?" })
      .getByRole("button", { name: "보관하기" })
      .click();
    await expect(page).toHaveURL(/\/captures$/);
    await expect(
      page.getByRole("link", { name: "나눌 기록", exact: true }),
    ).toHaveCount(0);

    await page.getByLabel("보관한 기록도 보기").click();
    await expect(page.getByLabel("보관한 기록도 보기")).toBeChecked();
    await expect(page).toHaveURL(/archived=1/);
    await page.getByRole("link", { name: "나눌 기록", exact: true }).click();
    await expect(page.getByText("보관됨").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "수정" })).toHaveCount(0);
    await page.goto(`/captures/${shared.splitId}/edit`);
    await expect(
      page.getByText("보관한 기록은 수정할 수 없습니다."),
    ).toBeVisible();
  });

  test("the list pages through many captures", async ({ page }) => {
    await signInAt(page, "/captures");
    const workspace = await workspaceId(page);
    for (let index = 0; index < 55; index++) {
      const response = await page.request.post(
        `/api/v1/workspaces/${workspace}/captures`,
        {
          headers: {
            origin,
            "idempotency-key": `e2e-bulk-${String(index).padStart(3, "0")}-key`,
          },
          data: { title: `대량 ${index}`, rawBody: `본문 ${index}` },
        },
      );
      expect(response.ok()).toBe(true);
    }
    await page.reload();
    const items = page
      .getByRole("list", { name: "기록 목록" })
      .getByRole("listitem");
    await expect(items).toHaveCount(50);
    await page.getByRole("button", { name: "더 보기" }).click();
    await expect.poll(() => items.count()).toBeGreaterThan(50);
    await expect(page.getByRole("button", { name: "더 보기" })).toHaveCount(0);
  });

  test("another account cannot open or see the first account's captures", async ({
    page,
    browser,
  }) => {
    await signInAt(page, "/captures");
    const invitation = await page.request.post("/api/v1/ops/invitations", {
      headers: { origin },
      data: { email: reader.email },
    });
    expect(invitation.ok()).toBe(true);
    const { token } = (await invitation.json()) as { token: string };
    const accepted = await page.request.post("/api/v1/invitations/accept", {
      headers: { origin },
      data: { token, name: "읽는 사람", password: reader.password },
    });
    expect(accepted.ok()).toBe(true);

    const other = await browser.newContext({ baseURL: origin });
    const guest = await other.newPage();
    await signInAt(guest, `/captures/${shared.firstId}`, reader);
    await expect(
      guest.getByRole("heading", { name: "찾을 수 없음", exact: true }),
    ).toBeVisible();
    await expect(guest.getByText("내 초안")).toHaveCount(0);
    await guest.goto("/captures");
    await expect(guest.getByText("아직 기록이 없습니다")).toBeVisible();
    await logout(guest);
    await login(guest, reader.email, reader.password);
    await other.close();
  });

  test("list and detail fit a 320px screen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await signInAt(page, "/captures");
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.goto(`/captures/${shared.firstId}`);
    await expect(page.getByTestId("raw-body")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.goto(`/captures/${shared.firstId}/edit`);
    await expect(page.getByLabel("내용", { exact: true })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
  });
});

async function workspaceId(page: Page): Promise<string> {
  const me = await page.request.get("/api/v1/me");
  return ((await me.json()) as { workspace: { id: string } }).workspace.id;
}
