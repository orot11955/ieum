import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiApp } from "../src/app.js";
import { createAuth } from "../src/auth/auth.js";
import { createAuthPort } from "../src/auth/fastify.js";
import * as schema from "../src/auth/schema.js";

const databaseUrl = process.env.AUTH_DATABASE_URL;
const origin = "http://127.0.0.1:3000";
const secret = "ieum_be02_integration_fixture_secret_32_chars";
const password = "be02 fixture password 1234";

describe.skipIf(!databaseUrl)("BE-02 real PostgreSQL auth adapter", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const fixtureAuth = betterAuth({
    baseURL: origin,
    secret,
    database: drizzleAdapter(drizzle(pool, { schema }), {
      provider: "pg",
      schemaName: "auth",
      schema,
    }),
    emailAndPassword: { enabled: true },
    plugins: [twoFactor()],
  });
  let resetMessage: { email: string; url: string; token: string } | null = null;
  const service = createAuth({
    databaseUrl: databaseUrl ?? "",
    baseUrl: origin,
    secret,
    sendResetPassword: async (message) => {
      resetMessage = message;
    },
  });
  let app: Awaited<ReturnType<typeof createApiApp>>;

  beforeAll(async () => {
    app = await createApiApp({ auth: service.auth, baseUrl: origin });
  });
  afterAll(async () => {
    await app?.close();
    await service.close();
    await pool.end();
  });

  async function createUser(): Promise<string> {
    const email = `be02-${randomUUID()}@example.test`;
    await fixtureAuth.api.signUpEmail({
      body: { email, password, name: "Fixture" },
    });
    return email;
  }

  async function signIn(email: string) {
    return app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { host: "127.0.0.1:3000", origin },
      payload: { email, password },
    });
  }

  function sessionCookie(setCookie: string | string[] | undefined): string {
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ""];
    const session = cookies.find((cookie) =>
      cookie.startsWith("better-auth.session_token="),
    );
    expect(session).toBeDefined();
    return session!.split(";", 1)[0]!;
  }

  function decodeBase32(value: string): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0;
    let buffer = 0;
    const bytes: number[] = [];
    for (const character of value.toUpperCase()) {
      buffer = (buffer << 5) | alphabet.indexOf(character);
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >>> bits) & 0xff);
      }
    }
    return Buffer.from(bytes).toString("utf8");
  }

  it("blocks public sign-up and hostile Host/Origin before creating a session", async () => {
    const email = `blocked-${randomUUID()}@example.test`;
    const signUp = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { host: "127.0.0.1:3000", origin },
      payload: { email, password, name: "Blocked" },
    });
    expect(signUp.statusCode).toBe(400);
    const hostileHost = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { host: "attacker.example", origin },
      payload: { email, password },
    });
    expect(hostileHost.statusCode).toBe(400);
    const hostileProxyHost = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: {
        host: "127.0.0.1:3000",
        "x-forwarded-host": "attacker.example",
        origin,
      },
      payload: { email, password },
    });
    expect(hostileProxyHost.statusCode).toBe(400);
    const hostileOrigin = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { host: "127.0.0.1:3000", origin: "https://attacker.example" },
      payload: { email, password },
    });
    expect(hostileOrigin.statusCode).toBe(403);
    const malformedBody = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: {
        host: "127.0.0.1:3000",
        origin,
        "content-type": "application/json",
      },
      payload: "{invalid",
    });
    expect(malformedBody.statusCode).toBe(400);
  });

  it("signs in, resolves an application identity, and rejects a signed-out cookie", async () => {
    const email = await createUser();
    const signInResponse = await signIn(email);
    expect(signInResponse.statusCode).toBe(200);
    const cookie = sessionCookie(signInResponse.headers["set-cookie"]);
    const port = createAuthPort(service.auth);
    expect(await port.resolveSession(cookie)).toMatchObject({ email });
    const session = await app.inject({
      method: "GET",
      url: "/api/auth/get-session",
      headers: { host: "127.0.0.1:3000", cookie },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().user.email).toBe(email);
    const signOut = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { host: "127.0.0.1:3000", origin, cookie },
      payload: {},
    });
    expect(signOut.statusCode).toBe(200);
    expect(await port.resolveSession(cookie)).toBeNull();
  });

  it("revokes another device immediately with cookie cache disabled", async () => {
    const email = await createUser();
    const first = sessionCookie((await signIn(email)).headers["set-cookie"]);
    const second = sessionCookie((await signIn(email)).headers["set-cookie"]);
    const port = createAuthPort(service.auth);
    expect(await port.resolveSession(first)).not.toBeNull();
    expect(await port.resolveSession(second)).not.toBeNull();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/revoke-other-sessions",
      headers: { host: "127.0.0.1:3000", origin, cookie: second },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(await port.resolveSession(first)).toBeNull();
    expect(await port.resolveSession(second)).not.toBeNull();
  });

  it("resets a password once and revokes the prior session", async () => {
    const email = await createUser();
    const oldCookie = sessionCookie(
      (await signIn(email)).headers["set-cookie"],
    );
    const requested = await app.inject({
      method: "POST",
      url: "/api/auth/request-password-reset",
      headers: { host: "127.0.0.1:3000", origin },
      payload: { email, redirectTo: `${origin}/reset-password` },
    });
    expect(requested.statusCode).toBe(200);
    expect(resetMessage).toMatchObject({ email });
    const token = (resetMessage as { token: string } | null)?.token;
    expect(token).toBeTruthy();
    const newPassword = "be02 changed fixture password 1234";
    const reset = await app.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      headers: { host: "127.0.0.1:3000", origin },
      payload: { token, newPassword },
    });
    expect(reset.statusCode).toBe(200);
    expect(
      await createAuthPort(service.auth).resolveSession(oldCookie),
    ).toBeNull();
    const reused = await app.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      headers: { host: "127.0.0.1:3000", origin },
      payload: { token, newPassword },
    });
    expect(reused.statusCode).toBe(400);
    const oldPasswordLogin = await signIn(email);
    expect(oldPasswordLogin.statusCode).toBe(401);
    const newPasswordLogin = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { host: "127.0.0.1:3000", origin },
      payload: { email, password: newPassword },
    });
    expect(newPasswordLogin.statusCode).toBe(200);
  });

  it("requires a second factor and consumes a backup code once", async () => {
    const email = await createUser();
    const enrollmentCookie = sessionCookie(
      (await signIn(email)).headers["set-cookie"],
    );
    const enable = await app.inject({
      method: "POST",
      url: "/api/auth/two-factor/enable",
      headers: { host: "127.0.0.1:3000", origin, cookie: enrollmentCookie },
      payload: { password, method: "totp" },
    });
    expect(enable.statusCode).toBe(200);
    const enrollment = enable.json<{
      totpURI: string;
      backupCodes: string[];
    }>();
    expect(enrollment.backupCodes.length).toBeGreaterThan(0);
    const secret = new URL(enrollment.totpURI).searchParams.get("secret");
    expect(secret).toBeTruthy();
    const { code } = await fixtureAuth.api.generateTOTP({
      body: { secret: decodeBase32(secret ?? "") },
    });
    const verifyEnrollment = await app.inject({
      method: "POST",
      url: "/api/auth/two-factor/verify-totp",
      headers: { host: "127.0.0.1:3000", origin, cookie: enrollmentCookie },
      payload: { code },
    });
    expect(verifyEnrollment.statusCode).toBe(200);
    const pending = await signIn(email);
    expect(pending.statusCode).toBe(200);
    expect(
      pending.json<{ twoFactorRedirect?: boolean }>().twoFactorRedirect,
    ).toBe(true);
    const pendingCookies = pending.headers["set-cookie"];
    const pendingCookie = (
      Array.isArray(pendingCookies) ? pendingCookies : [pendingCookies ?? ""]
    )
      .map((value) => value.split(";", 1)[0])
      .join("; ");
    expect(
      await createAuthPort(service.auth).resolveSession(pendingCookie),
    ).toBeNull();
    const backup = await app.inject({
      method: "POST",
      url: "/api/auth/two-factor/verify-backup-code",
      headers: { host: "127.0.0.1:3000", origin, cookie: pendingCookie },
      payload: { code: enrollment.backupCodes[0] },
    });
    expect(backup.statusCode).toBe(200);
    const completedCookie = sessionCookie(backup.headers["set-cookie"]);
    expect(
      await createAuthPort(service.auth).resolveSession(completedCookie),
    ).toMatchObject({ email });
    const anotherPending = await signIn(email);
    const anotherCookies = anotherPending.headers["set-cookie"];
    const anotherCookie = (
      Array.isArray(anotherCookies) ? anotherCookies : [anotherCookies ?? ""]
    )
      .map((value) => value.split(";", 1)[0])
      .join("; ");
    const reused = await app.inject({
      method: "POST",
      url: "/api/auth/two-factor/verify-backup-code",
      headers: { host: "127.0.0.1:3000", origin, cookie: anotherCookie },
      payload: { code: enrollment.backupCodes[0] },
    });
    expect(reused.statusCode).toBe(401);
    expect(
      await createAuthPort(service.auth).resolveSession(anotherCookie),
    ).toBeNull();
  });
});
