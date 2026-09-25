import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("theme is applied before React and follows system, selection and reload", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-ieum-theme",
    "paper-dark",
  );
  await page.getByLabel("색상 모드").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute(
    "data-ieum-theme",
    "paper-light",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-ieum-theme",
    "paper-light",
  );
  await page.getByLabel("색상 모드").selectOption("system");
  await expect(page.locator("html")).toHaveAttribute(
    "data-ieum-theme",
    "paper-dark",
  );
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-ieum-theme",
    "paper-light",
  );
  expect(
    await page.evaluate(() => document.documentElement.dataset.ieumTheme),
  ).toBe("paper-light");
});

test("buttons, input states and native dialog keep keyboard behavior", async ({
  page,
}) => {
  await page.getByRole("button", { name: "기본 동작" }).click();
  await expect(page.getByText("기본 동작 실행 1회")).toBeVisible();
  await page
    .getByRole("button", { name: "처리 중…" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByText("기본 동작 실행 1회")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "비활성 동작" }),
  ).toBeDisabled();
  await expect(page.getByLabel("오류 입력")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("오류 입력")).toHaveAttribute(
    "aria-describedby",
    /-error/,
  );
  await expect(page.getByLabel("읽기 전용")).toHaveAttribute("readonly", "");
  await expect(page.getByLabel("일부 선택")).toHaveAttribute(
    "aria-checked",
    "mixed",
  );

  const opener = page.getByRole("button", { name: "대화상자 열기" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "변경 확인" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "닫기" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test("long text, accessibility states and gallery screenshots work at narrow width", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByLabel("색상 모드").selectOption("light");
  await expect(page.locator("body")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(
    page.getByRole("table", { name: "맥락 자료 상태 표본" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("fe-01-paper-320.png"),
    fullPage: true,
  });
  await page.getByLabel("색상 모드").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute(
    "data-ieum-theme",
    "paper-dark",
  );
  await page.screenshot({
    path: testInfo.outputPath("fe-01-dark-320.png"),
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await expect(page.getByRole("button", { name: "기본 동작" })).toBeVisible();
  await expect(page.getByLabel("기본 입력")).toBeVisible();
});
