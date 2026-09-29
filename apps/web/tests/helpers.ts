import { expect, type Page } from "@playwright/test";

export const operator = {
  email: "operator@example.test",
  password: "e2e operator fixture password 1234",
};

export const origin = "http://127.0.0.1:4173";

/** The main-menu link, never a same-named link inside the page body. */
export function menu(page: Page, name: string) {
  return page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name, exact: true });
}

export async function login(page: Page, email: string, password: string) {
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Opens a protected path as the given account and waits for the app shell. */
export async function signInAt(
  page: Page,
  path: string,
  account: { email: string; password: string } = operator,
) {
  await page.goto(path);
  await login(page, account.email, account.password);
  await expect(page.getByTestId("account-email")).toHaveText(account.email);
}
