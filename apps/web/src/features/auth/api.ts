import { ApiError, request } from "../../shared/api/http";

export type SignInResult = "signed-in" | "second-factor";

export async function signIn(
  email: string,
  password: string,
): Promise<SignInResult> {
  const result = await request<{ twoFactorRedirect?: boolean }>(
    "/api/auth/sign-in/email",
    { method: "POST", body: { email, password }, sessionBound: false },
  );
  return result?.twoFactorRedirect ? "second-factor" : "signed-in";
}

export async function verifySecondFactor(
  kind: "totp" | "backup",
  code: string,
): Promise<void> {
  await request(
    kind === "totp"
      ? "/api/auth/two-factor/verify-totp"
      : "/api/auth/two-factor/verify-backup-code",
    { method: "POST", body: { code }, sessionBound: false },
  );
}

export async function signOut(): Promise<void> {
  try {
    await request("/api/auth/sign-out", {
      method: "POST",
      body: {},
      sessionBound: false,
    });
  } catch (error) {
    // An already expired session is signed out; anything else is reported.
    if (!(error instanceof ApiError && error.status === 401)) throw error;
  }
}

export function recordActivity(): Promise<void> {
  return request("/api/v1/me/activity", { method: "POST" });
}

export function describeAuthError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.code === "INVALID_EMAIL_OR_PASSWORD")
      return "이메일 또는 비밀번호가 맞지 않습니다.";
    if (error.status === 429)
      return "시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.";
    if (error.status === 403)
      return "요청 출처를 확인할 수 없습니다. 페이지를 새로고침해 주세요.";
  }
  return "지금은 처리할 수 없습니다. 입력은 그대로 두었으니 다시 시도해 주세요.";
}
