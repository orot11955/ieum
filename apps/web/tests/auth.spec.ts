import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const operator = {
  email: "operator@example.test",
  password: "e2e operator fixture password 1234",
};
const invitee = {
  email: "invitee@example.test",
  password: "e2e invitee fixture password 1234",
};

function menu(page: Page, name: string) {
  return page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name, exact: true });
}

async function login(page: Page, email: string, password: string) {
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
}

function decodeBase32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const character of value.replace(/=+$/, "").toUpperCase()) {
    buffer = (buffer << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, "0");
}

/** Records, for every DOM change from now on, which watched emails are shown. */
async function watchEmails(page: Page, emails: string[]) {
  await page.evaluate((watched) => {
    const frames: string[][] = [];
    (window as unknown as { __emailFrames: string[][] }).__emailFrames = frames;
    const scan = () => {
      const text = document.body.innerText;
      frames.push(watched.filter((email) => text.includes(email)));
    };
    scan();
    new MutationObserver(scan).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }, emails);
}

async function emailFrames(page: Page): Promise<string[][]> {
  return page.evaluate(
    () => (window as unknown as { __emailFrames: string[][] }).__emailFrames,
  );
}

test.describe.serial("M1 login, session and accounts", () => {
  test("a protected URL sends an anonymous visitor to login and back", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId("account-email")).toHaveCount(0);
    await login(page, operator.email, operator.password);
    await expect(page).toHaveURL(/\/settings$/);
    await expect(
      page.getByRole("heading", { name: "설정", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("account-email")).toHaveText(operator.email);
    await expect(menu(page, "설정")).toHaveAttribute("aria-current", "page");
  });

  test("wrong credentials keep the email, clear the password and explain", async ({
    page,
  }) => {
    await page.goto("/login");
    await login(page, operator.email, "wrong password but long enough");
    await expect(page.getByRole("alert")).toContainText(
      "이메일 또는 비밀번호가 맞지 않습니다",
    );
    await expect(page.getByLabel("이메일")).toHaveValue(operator.email);
    await expect(page.getByLabel("비밀번호", { exact: true })).toHaveValue("");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("logout drops the account view and back navigation cannot restore it", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page, operator.email, operator.password);
    await expect(
      page.getByRole("heading", { name: "홈", exact: true }),
    ).toBeVisible();
    await menu(page, "설정").click();
    await expect(
      page.getByRole("table", { name: "로그인된 기기" }),
    ).toBeVisible();
    await logout(page);
    await expect(page.getByText("로그아웃했습니다.")).toBeVisible();
    await watchEmails(page, [operator.email]);
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("이메일")).toBeVisible();
    expect((await emailFrames(page)).flat()).toEqual([]);
  });

  test("an operator invites a second account that cannot open operator pages", async ({
    page,
    browser,
  }) => {
    await page.goto("/ops/invitations");
    await login(page, operator.email, operator.password);
    await expect(
      page.getByRole("heading", { name: "초대", exact: true }),
    ).toBeVisible();
    await page.getByLabel("초대할 이메일").fill(invitee.email);
    await page.getByRole("button", { name: "초대 링크 만들기" }).click();
    const link = await page.getByTestId("invitation-link").innerText();
    expect(link).toMatch(/^http:\/\/127\.0\.0\.1:4173\/invitation#[\w-]{43}$/);

    const other = await browser.newContext();
    const guest = await other.newPage();
    await guest.goto(link);
    await guest.getByLabel("이름").fill("초대받은 사람");
    await guest.getByLabel("비밀번호", { exact: true }).fill(invitee.password);
    await guest.getByLabel("비밀번호 확인").fill("different password 12345");
    await guest.getByRole("button", { name: "계정 만들기" }).click();
    await expect(guest.getByText("비밀번호가 서로 다릅니다.")).toBeVisible();
    await guest.getByLabel("비밀번호 확인").fill(invitee.password);
    await guest.getByRole("button", { name: "계정 만들기" }).click();
    await expect(guest.getByText("계정을 만들었습니다")).toBeVisible();
    expect(new URL(guest.url()).hash).toBe("");
    await guest.getByRole("link", { name: "로그인으로 이동" }).click();
    await login(guest, invitee.email, invitee.password);
    await expect(guest.getByTestId("account-email")).toHaveText(invitee.email);
    await expect(menu(guest, "초대")).toHaveCount(0);
    await guest.goto("/ops/invitations");
    await expect(
      guest.getByRole("heading", { name: "접근할 수 없음", exact: true }),
    ).toBeVisible();
    await guest.goto(link);
    await guest.getByLabel("이름").fill("다시 사용");
    await guest.getByLabel("비밀번호", { exact: true }).fill(invitee.password);
    await guest.getByLabel("비밀번호 확인").fill(invitee.password);
    await guest.getByRole("button", { name: "계정 만들기" }).click();
    await expect(guest.getByRole("alert")).toContainText(
      "만료되었거나 이미 사용",
    );
    await other.close();
  });

  test("switching accounts in one browser never shows the previous account after the switch", async ({
    page,
  }) => {
    await page.goto("/settings");
    await login(page, operator.email, operator.password);
    await expect(page.getByTestId("account-email")).toHaveText(operator.email);
    // Another tab signs in as someone else; this tab learns it on focus.
    const switched = await page.request.post("/api/auth/sign-in/email", {
      headers: { origin: "http://127.0.0.1:4173" },
      data: { email: invitee.email, password: invitee.password },
    });
    expect(switched.ok()).toBe(true);
    await watchEmails(page, [operator.email, invitee.email]);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    await expect(page.getByTestId("account-email")).toHaveText(invitee.email);
    await expect(
      page.getByRole("table", { name: "로그인된 기기" }),
    ).toBeVisible();
    const frames = await emailFrames(page);
    const firstInvitee = frames.findIndex((shown) =>
      shown.includes(invitee.email),
    );
    expect(firstInvitee).toBeGreaterThanOrEqual(0);
    // From the first frame that shows the new account, the old one never shows.
    expect(
      frames
        .slice(firstInvitee)
        .filter((shown) => shown.includes(operator.email)),
    ).toEqual([]);
    await expect(page.getByText(operator.email)).toHaveCount(0);
    await logout(page);
  });

  test("a session ended elsewhere returns to login with an expiry notice", async ({
    page,
    browser,
  }) => {
    await page.goto("/");
    await login(page, operator.email, operator.password);
    await expect(
      page.getByRole("heading", { name: "홈", exact: true }),
    ).toBeVisible();

    const other = await browser.newContext({
      baseURL: "http://127.0.0.1:4173",
    });
    const admin = await other.newPage();
    await admin.goto("/login");
    await login(admin, operator.email, operator.password);
    await menu(admin, "설정").click();
    const revoke = admin.getByRole("button", { name: "세션 끝내기" });
    await expect(revoke.first()).toBeVisible();
    const count = await revoke.count();
    for (let index = 0; index < count; index++) {
      await revoke.first().click();
      await expect(revoke).toHaveCount(count - index - 1);
    }
    await other.close();

    await menu(page, "설정").click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("세션이 만료되었습니다")).toBeVisible();
    await expect(page.getByTestId("account-email")).toHaveCount(0);
    await login(page, operator.email, operator.password);
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("second factor enrolment and login challenge", async ({ page }) => {
    await page.goto("/settings");
    await login(page, invitee.email, invitee.password);
    await expect(page.getByText("꺼짐")).toBeVisible();
    await page.getByLabel("현재 비밀번호").fill("not the password at all");
    await page.getByRole("button", { name: "2단계 인증 설정 시작" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "비밀번호가 맞지 않습니다",
    );
    await expect(page.getByTestId("account-email")).toHaveText(invitee.email);
    await page.getByLabel("현재 비밀번호").fill(invitee.password);
    await page.getByRole("button", { name: "2단계 인증 설정 시작" }).click();
    const secret = await page.getByTestId("totp-secret").innerText();
    const backup = (await page.getByTestId("backup-codes").innerText())
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    expect(backup.length).toBeGreaterThan(0);
    await page.getByLabel("인증 앱 코드").fill(totp(secret));
    await page.getByRole("button", { name: "확인하고 켜기" }).click();
    await expect(page.getByText("켜짐")).toBeVisible();
    await logout(page);

    await login(page, invitee.email, invitee.password);
    await expect(page).toHaveURL(/\/login\/verify$/);
    await expect(page.getByTestId("account-email")).toHaveCount(0);
    await page.getByLabel("인증 앱 코드").fill("000000");
    await page.getByRole("button", { name: "확인", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("코드가 맞지 않습니다");
    await page.getByRole("button", { name: "백업 코드 사용" }).click();
    await page.getByLabel("백업 코드").fill(backup[0]!);
    await page.getByRole("button", { name: "확인", exact: true }).click();
    await expect(page.getByTestId("account-email")).toHaveText(invitee.email);
    await logout(page);

    await login(page, invitee.email, invitee.password);
    await page.getByRole("button", { name: "백업 코드 사용" }).click();
    await page.getByLabel("백업 코드").fill(backup[0]!);
    await page.getByRole("button", { name: "확인", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("코드가 맞지 않습니다");
  });

  test("unknown routes and narrow screens stay usable", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/no-such-page");
    await expect(page).toHaveURL(/\/login$/);
    await login(page, operator.email, operator.password);
    await expect(
      page.getByRole("heading", { name: "찾을 수 없음", exact: true }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await menu(page, "설정").click();
    await expect(
      page.getByRole("heading", { name: "설정", exact: true }),
    ).toBeVisible();
    await page.getByLabel("색상 모드").selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute(
      "data-ieum-theme",
      "paper-dark",
    );
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "홈", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "본문으로 건너뛰기" }),
    ).toBeFocused();
  });
});
