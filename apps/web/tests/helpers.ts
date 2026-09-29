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

/** Direct API calls as the signed-in page, for arranging data quickly. */
export async function workspaceIdOf(page: Page): Promise<string> {
  const me = await page.request.get("/api/v1/me");
  return ((await me.json()) as { workspace: { id: string } }).workspace.id;
}

export async function apiPost<T>(
  page: Page,
  path: string,
  data: unknown,
): Promise<T> {
  const response = await page.request.post(path, {
    headers: { origin, "idempotency-key": `e2e-${crypto.randomUUID()}` },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T;
}

export async function apiCreateCapture(
  page: Page,
  workspace: string,
  title: string,
  rawBody: string,
): Promise<{ id: string; unitId: string }> {
  return apiPost(page, `/api/v1/workspaces/${workspace}/captures`, {
    title,
    rawBody,
  });
}

export async function apiCreateContext(
  page: Page,
  workspace: string,
  name: string,
  purpose = `${name}의 목적`,
  kind: "TOPIC" | "FLOW" | "PROJECT" | "COLLECTION" = "TOPIC",
): Promise<{ id: string }> {
  return apiPost(page, `/api/v1/workspaces/${workspace}/contexts`, {
    name,
    purpose,
    scope: `${name}의 범위`,
    kind,
  });
}

export async function apiCreateTask(
  page: Page,
  workspace: string,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; version: number }> {
  return apiPost(page, `/api/v1/workspaces/${workspace}/tasks`, {
    title,
    ...extra,
  });
}

export async function apiCreateEvent(
  page: Page,
  workspace: string,
  title: string,
  schedule: Record<string, unknown>,
): Promise<{ id: string; version: number }> {
  return apiPost(page, `/api/v1/workspaces/${workspace}/events`, {
    title,
    schedule,
  });
}
