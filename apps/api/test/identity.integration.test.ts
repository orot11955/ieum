import "reflect-metadata";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { IdentityService } from "@ieum/backend/identity-service";
import { CommandCoordinator } from "@ieum/backend/command-coordinator";
import { PreferenceCommands } from "@ieum/backend/preferences";
import { CaptureService } from "@ieum/backend/captures";
import { KnowledgeService } from "@ieum/backend/knowledge";
import { TaskService } from "@ieum/backend/tasks";
import { assertApplicationDatabaseRole } from "@ieum/backend/platform/database/scope";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiApp } from "../src/app.js";
import { createAuth } from "../src/auth/auth.js";
import { createAuthPort } from "../src/auth/fastify.js";
import { createAccountAdministration } from "../src/auth/registration.js";

const authMigrations = fileURLToPath(
  new URL("../../../db/migrations/auth", import.meta.url),
);
const businessMigrations = fileURLToPath(
  new URL("../../../db/migrations/business", import.meta.url),
);
const rolesSql = readFileSync(
  new URL("../../../db/admin/roles.sql", import.meta.url),
  "utf8",
);
const postgresImage =
  "postgres:18.4-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15";
const origin = "http://127.0.0.1:3000";
const password = "be04 strong fixture password 1234";

function roleUrl(base: string, role: string): string {
  const url = new URL(base);
  url.username = role;
  url.password = "be04_fixture_only";
  return url.toString();
}

function cookie(header: string | string[] | undefined): string {
  const values = Array.isArray(header) ? header : [header ?? ""];
  const found = values.find((item) =>
    item.startsWith("better-auth.session_token="),
  );
  if (!found) throw new Error("Expected session cookie");
  return found.split(";", 1)[0]!;
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

function totp(secret: string): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", secret).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, "0");
}

describe("BE-04 identity HTTP with separate auth/application roles", () => {
  let container: StartedPostgreSqlContainer;
  let admin: Pool;
  let appPool: Pool;
  let authLockPool: Pool;
  let app: Awaited<ReturnType<typeof createApiApp>>;
  let identity: IdentityService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer(postgresImage)
      .withDatabase("ieum_be04")
      .withUsername("postgres")
      .withPassword("be04_fixture_only")
      .start();
    admin = new Pool({ connectionString: container.getConnectionUri() });
    await migrate(drizzle(admin), { migrationsFolder: authMigrations });
    await admin.query(rolesSql);
    await migrate(drizzle(admin), {
      migrationsFolder: businessMigrations,
      migrationsSchema: "drizzle_business",
    });
    await admin.query(
      "CREATE ROLE ieum_be04_app LOGIN PASSWORD 'be04_fixture_only' IN ROLE ieum_application",
    );
    await admin.query(
      "CREATE ROLE ieum_be04_auth LOGIN PASSWORD 'be04_fixture_only' IN ROLE ieum_auth_runtime",
    );
    const base = container.getConnectionUri();
    appPool = new Pool({
      connectionString: roleUrl(base, "ieum_be04_app"),
      max: 1,
      connectionTimeoutMillis: 2_000,
    });
    authLockPool = new Pool({
      connectionString: roleUrl(base, "ieum_be04_app"),
      max: 1,
      connectionTimeoutMillis: 2_000,
    });
    await assertApplicationDatabaseRole(appPool);
    const config = {
      databaseUrl: roleUrl(base, "ieum_be04_auth"),
      baseUrl: origin,
      secret: "be04_fixture_secret_at_least_32_characters",
    };
    const auth = createAuth(config);
    const administration = createAccountAdministration(config);
    identity = new IdentityService(
      appPool,
      administration.registration,
      administration.sessions,
      authLockPool,
    );
    const commands = new CommandCoordinator(identity);
    app = await createApiApp({
      auth: auth.auth,
      baseUrl: origin,
      identity: {
        service: identity,
        preferences: new PreferenceCommands(commands),
        captures: new CaptureService(identity, commands),
        knowledge: new KnowledgeService(identity, commands),
        tasks: new TaskService(identity, commands),
        authPort: createAuthPort(auth.auth),
        sessions: administration.sessions,
        origin,
      },
      loginAllowed: async (email) => {
        const userId = await administration.findUserIdByEmail(email);
        return userId ? identity.isActiveUser(userId) : true;
      },
      withAuthMutationLock: (operation) =>
        identity.withAuthMutationLock(operation),
      close: async () => {
        await Promise.all([
          auth.close(),
          administration.close(),
          appPool.end(),
          authLockPool.end(),
        ]);
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await admin?.end();
    await container?.stop();
  }, 120_000);

  async function signIn(email: string) {
    return app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { host: "127.0.0.1:3000", origin },
      payload: { email, password },
    });
  }

  it("keeps public signup closed and isolates two accounts through HTTP", async () => {
    const operator = await identity.bootstrap({
      email: "operator@example.test",
      name: "Operator",
      password,
    });
    const publicSignUp = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { host: "127.0.0.1:3000", origin },
      payload: { email: "outsider@example.test", name: "Outsider", password },
    });
    expect(publicSignUp.statusCode).toBe(400);
    const operatorLogin = await signIn("operator@example.test");
    expect(operatorLogin.statusCode).toBe(200);
    const operatorCookie = cookie(operatorLogin.headers["set-cookie"]);
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      user: { id: operator.userId },
      workspace: { id: operator.workspaceId },
      operator: true,
      preferences: { externalModelEnabled: false },
    });
    const activity = await app.inject({
      method: "POST",
      url: "/api/v1/me/activity",
      headers: { host: "127.0.0.1:3000", origin, cookie: operatorCookie },
    });
    expect(activity.statusCode).toBe(204);
    const preferenceHeaders = {
      host: "127.0.0.1:3000",
      origin,
      cookie: operatorCookie,
      "idempotency-key": "operator-timezone-01",
    };
    const preferencePayload = { timeZone: "Asia/Seoul", baseVersion: 1 };
    const preferenceUpdate = await app.inject({
      method: "PATCH",
      url: "/api/v1/me/preferences",
      headers: preferenceHeaders,
      payload: preferencePayload,
    });
    expect(preferenceUpdate.statusCode).toBe(200);
    expect(preferenceUpdate.json()).toMatchObject({
      timeZone: "Asia/Seoul",
      version: 2,
      replayed: false,
    });
    const preferenceReplay = await app.inject({
      method: "PATCH",
      url: "/api/v1/me/preferences",
      headers: preferenceHeaders,
      payload: preferencePayload,
    });
    expect(preferenceReplay.statusCode).toBe(200);
    expect(preferenceReplay.json()).toMatchObject({
      commandId: preferenceUpdate.json<{ commandId: string }>().commandId,
      version: 2,
      replayed: true,
    });
    const keyConflict = await app.inject({
      method: "PATCH",
      url: "/api/v1/me/preferences",
      headers: preferenceHeaders,
      payload: { timeZone: "Asia/Tokyo", baseVersion: 1 },
    });
    expect(keyConflict.statusCode).toBe(409);
    expect(keyConflict.json<{ code: string }>().code).toBe(
      "IDEMPOTENCY_CONFLICT",
    );
    const staleVersion = await app.inject({
      method: "PATCH",
      url: "/api/v1/me/preferences",
      headers: {
        ...preferenceHeaders,
        "idempotency-key": "operator-timezone-02",
      },
      payload: preferencePayload,
    });
    expect(staleVersion.statusCode).toBe(409);
    expect(staleVersion.json()).toMatchObject({
      code: "VERSION_CONFLICT",
      currentVersion: 2,
    });
    const noKey = await app.inject({
      method: "PATCH",
      url: "/api/v1/me/preferences",
      headers: { host: "127.0.0.1:3000", origin, cookie: operatorCookie },
      payload: preferencePayload,
    });
    expect(noKey.statusCode).toBe(422);
    const sessions = await app.inject({
      method: "GET",
      url: "/api/v1/me/sessions",
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(sessions.statusCode).toBe(200);
    expect(sessions.body).not.toContain("session_token");
    expect(sessions.body).not.toContain('"token"');

    const wrongOrigin = await app.inject({
      method: "POST",
      url: "/api/v1/ops/invitations",
      headers: {
        host: "127.0.0.1:3000",
        origin: "https://attacker.example",
        cookie: operatorCookie,
      },
      payload: { email: "invitee@example.test" },
    });
    expect(wrongOrigin.statusCode).toBe(403);
    const invitationResponse = await app.inject({
      method: "POST",
      url: "/api/v1/ops/invitations",
      headers: { host: "127.0.0.1:3000", origin, cookie: operatorCookie },
      payload: { email: "invitee@example.test" },
    });
    expect(invitationResponse.statusCode).toBe(201);
    const invitationToken = invitationResponse.json<{ token: string }>().token;
    const acceptPayload = {
      token: invitationToken,
      name: "Invitee",
      password,
    };
    const accepted = await app.inject({
      method: "POST",
      url: "/api/v1/invitations/accept",
      headers: { host: "127.0.0.1:3000", origin },
      payload: acceptPayload,
    });
    expect(accepted.statusCode).toBe(201);
    const invitedWorkspaceId = accepted.json<{ workspaceId: string }>()
      .workspaceId;
    expect(invitedWorkspaceId).not.toBe(operator.workspaceId);
    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/invitations/accept",
      headers: { host: "127.0.0.1:3000", origin },
      payload: acceptPayload,
    });
    expect(replay.statusCode).toBe(404);
    expect(replay.body).not.toContain(password);
    expect(replay.body).not.toContain(invitationToken);

    const inviteeLogin = await signIn("invitee@example.test");
    expect(inviteeLogin.statusCode).toBe(200);
    const inviteeCookie = cookie(inviteeLogin.headers["set-cookie"]);
    const inviteeMe = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { host: "127.0.0.1:3000", cookie: inviteeCookie },
    });
    expect(inviteeMe.statusCode).toBe(200);
    expect(inviteeMe.json()).toMatchObject({
      workspace: { id: invitedWorkspaceId },
      operator: false,
    });
    const captureUrl = `/api/v1/workspaces/${operator.workspaceId}/captures`;
    const captureHeaders = {
      host: "127.0.0.1:3000",
      origin,
      cookie: operatorCookie,
      "idempotency-key": "be07-http-create-01",
    };
    const capturePayload = { title: "비공개 기록", rawBody: "A😀B" };
    const captureCreated = await app.inject({
      method: "POST",
      url: captureUrl,
      headers: captureHeaders,
      payload: capturePayload,
    });
    expect(captureCreated.statusCode).toBe(201);
    const captureId = captureCreated.json<{ id: string }>().id;
    expect(captureCreated.json()).toMatchObject({
      revision: 1,
      version: 1,
      replayed: false,
    });
    const captureReplay = await app.inject({
      method: "POST",
      url: captureUrl,
      headers: captureHeaders,
      payload: capturePayload,
    });
    expect(captureReplay.statusCode).toBe(201);
    expect(captureReplay.json()).toMatchObject({
      id: captureId,
      replayed: true,
    });
    const captureKeyConflict = await app.inject({
      method: "POST",
      url: captureUrl,
      headers: captureHeaders,
      payload: { ...capturePayload, rawBody: "changed" },
    });
    expect(captureKeyConflict.statusCode).toBe(409);
    expect(captureKeyConflict.body).not.toContain("changed");
    const captureNoKey = await app.inject({
      method: "POST",
      url: captureUrl,
      headers: { host: "127.0.0.1:3000", origin, cookie: operatorCookie },
      payload: capturePayload,
    });
    expect(captureNoKey.statusCode).toBe(422);
    const captureRead = await app.inject({
      method: "GET",
      url: `${captureUrl}/${captureId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(captureRead.statusCode).toBe(200);
    expect(captureRead.headers["cache-control"]).toBe("no-store");
    expect(captureRead.json()).toMatchObject({
      rawBody: "A😀B",
      units: [{ sourceSpan: { start: 0, end: 4 } }],
    });
    const otherRead = await app.inject({
      method: "GET",
      url: `${captureUrl}/${captureId}`,
      headers: { host: "127.0.0.1:3000", cookie: inviteeCookie },
    });
    expect(otherRead.statusCode).toBe(404);
    expect(otherRead.body).not.toContain("A😀B");
    const wrongCaptureOrigin = await app.inject({
      method: "POST",
      url: captureUrl,
      headers: {
        ...captureHeaders,
        origin: "https://attacker.example",
        "idempotency-key": "be07-http-create-02",
      },
      payload: capturePayload,
    });
    expect(wrongCaptureOrigin.statusCode).toBe(403);
    const splitCapture = await app.inject({
      method: "POST",
      url: `${captureUrl}/${captureId}/units/split`,
      headers: { ...captureHeaders, "idempotency-key": "be07-http-split-001" },
      payload: {
        baseVersion: 1,
        captureRevision: 1,
        spans: [
          { start: 0, end: 1, encoding: "utf16" },
          { start: 1, end: 3, encoding: "utf16" },
          { start: 3, end: 4, encoding: "utf16" },
        ],
      },
    });
    expect(splitCapture.statusCode).toBe(201);
    expect(splitCapture.json()).toMatchObject({
      version: 2,
      unitIds: expect.any(Array),
    });
    const revisedCapture = await app.inject({
      method: "POST",
      url: `${captureUrl}/${captureId}/revisions`,
      headers: { ...captureHeaders, "idempotency-key": "be07-http-revise-01" },
      payload: { baseVersion: 2, title: "개정 기록", rawBody: "C😀D" },
    });
    expect(revisedCapture.statusCode).toBe(201);
    expect(revisedCapture.json()).toMatchObject({ revision: 2, version: 3 });
    const oldCapture = await app.inject({
      method: "GET",
      url: `${captureUrl}/${captureId}/revisions/1`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(oldCapture.statusCode).toBe(200);
    expect(oldCapture.json()).toMatchObject({
      title: "비공개 기록",
      rawBody: "A😀B",
    });
    const archiveCapture = await app.inject({
      method: "POST",
      url: `${captureUrl}/${captureId}/archive`,
      headers: { ...captureHeaders, "idempotency-key": "be07-http-archive-1" },
      payload: { baseVersion: 3 },
    });
    expect(archiveCapture.statusCode).toBe(201);
    const visibleCaptures = await app.inject({
      method: "GET",
      url: captureUrl,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(visibleCaptures.statusCode).toBe(200);
    expect(
      visibleCaptures.json<{ captures: unknown[] }>().captures,
    ).toHaveLength(0);
    const contextUrl = `/api/v1/workspaces/${operator.workspaceId}/contexts`;
    const contextCreated = await app.inject({
      method: "POST",
      url: contextUrl,
      headers: { ...captureHeaders, "idempotency-key": "be08-http-context-01" },
      payload: {
        name: "계획",
        purpose: "실행",
        scope: "개인",
        kind: "PROJECT",
      },
    });
    expect(contextCreated.statusCode).toBe(201);
    const contextId = contextCreated.json<{ id: string }>().id;
    const contextRead = await app.inject({
      method: "GET",
      url: `${contextUrl}/${contextId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(contextRead.statusCode).toBe(200);
    expect(contextRead.headers["cache-control"]).toBe("no-store");
    const unitId = revisedCapture.json<{ unitId: string }>().unitId;
    const membershipUrl = `/api/v1/workspaces/${operator.workspaceId}/units/${unitId}/memberships`;
    const membershipCreated = await app.inject({
      method: "POST",
      url: membershipUrl,
      headers: {
        ...captureHeaders,
        "idempotency-key": "be08-http-membership-01",
      },
      payload: {
        baseVersion: 1,
        memberships: [{ contextId, role: "PRIMARY" }],
      },
    });
    expect(membershipCreated.statusCode).toBe(201);
    expect(membershipCreated.json()).toMatchObject({ membershipVersion: 2 });
    const secondContext = await app.inject({
      method: "POST",
      url: contextUrl,
      headers: { ...captureHeaders, "idempotency-key": "be08-http-context-03" },
      payload: {
        name: "다른 계획",
        purpose: "정리",
        scope: "개인",
        kind: "TOPIC",
      },
    });
    expect(secondContext.statusCode).toBe(201);
    const secondContextId = secondContext.json<{ id: string }>().id;
    const relationUrl = `/api/v1/workspaces/${operator.workspaceId}/context-relations`;
    const relationCreated = await app.inject({
      method: "POST",
      url: relationUrl,
      headers: {
        ...captureHeaders,
        "idempotency-key": "be08-http-relation-01",
      },
      payload: {
        fromContextId: contextId,
        toContextId: secondContextId,
        type: "PARENT_OF",
      },
    });
    expect(relationCreated.statusCode).toBe(201);
    const relationId = relationCreated.json<{ id: string }>().id;
    const relationVisible = await app.inject({
      method: "GET",
      url: `${contextUrl}/${contextId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(
      relationVisible
        .json<{ relations: Array<{ id: string }> }>()
        .relations.map((r) => r.id),
    ).toContain(relationId);
    const relationEnded = await app.inject({
      method: "POST",
      url: `${relationUrl}/${relationId}/end`,
      headers: {
        ...captureHeaders,
        "idempotency-key": "be08-http-end-relation-01",
      },
    });
    expect(relationEnded.statusCode).toBe(201);
    expect(relationEnded.json()).toMatchObject({ id: relationId, ended: true });
    const taskUrl = `/api/v1/workspaces/${operator.workspaceId}/tasks`;
    const taskCreated = await app.inject({
      method: "POST",
      url: taskUrl,
      headers: { ...captureHeaders, "idempotency-key": "be09-http-task-0001" },
      payload: {
        title: "실행",
        due: { kind: "DATE", date: "2028-02-29" },
        contextId,
      },
    });
    expect(taskCreated.statusCode).toBe(201);
    const taskId = taskCreated.json<{ id: string }>().id;
    const taskRead = await app.inject({
      method: "GET",
      url: `${taskUrl}/${taskId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(taskRead.statusCode).toBe(200);
    expect(taskRead.headers["cache-control"]).toBe("no-store");
    expect(taskRead.json()).toMatchObject({
      due: { kind: "DATE", date: "2028-02-29" },
      state: "TODO",
    });
    const taskDone = await app.inject({
      method: "POST",
      url: `${taskUrl}/${taskId}/transition`,
      headers: { ...captureHeaders, "idempotency-key": "be09-http-done-0001" },
      payload: { baseVersion: 1, targetState: "DONE" },
    });
    expect(taskDone.statusCode).toBe(201);
    expect(taskDone.json()).toMatchObject({
      state: "DONE",
      version: 2,
      completionVersion: 2,
    });
    const resultCreated = await app.inject({
      method: "POST",
      url: `${taskUrl}/${taskId}/results`,
      headers: { ...captureHeaders, "idempotency-key": "be09-http-result-001" },
      payload: { baseVersion: 2, title: "실행 결과", rawBody: "새 경험" },
    });
    expect(resultCreated.statusCode).toBe(201);
    const resultCaptureId = resultCreated.json<{ captureId: string }>()
      .captureId;
    const resultCapture = await app.inject({
      method: "GET",
      url: `${captureUrl}/${resultCaptureId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(resultCapture.statusCode).toBe(200);
    expect(resultCapture.json()).toMatchObject({ rawBody: "새 경험" });
    const taskCrossWorkspace = await app.inject({
      method: "GET",
      url: `${taskUrl}/${taskId}`.replace(
        operator.workspaceId,
        invitedWorkspaceId,
      ),
      headers: { host: "127.0.0.1:3000", cookie: inviteeCookie },
    });
    expect(taskCrossWorkspace.statusCode).toBe(404);
    const badOrigin = await app.inject({
      method: "POST",
      url: contextUrl,
      headers: {
        ...captureHeaders,
        origin: "http://other.example",
        "idempotency-key": "be08-http-context-02",
      },
      payload: {
        name: "차단",
        purpose: "차단",
        scope: "차단",
        kind: "PROJECT",
      },
    });
    expect(badOrigin.statusCode).toBe(403);
    const crossWorkspaceContext = await app.inject({
      method: "GET",
      url: `${contextUrl}/${contextId}`.replace(
        operator.workspaceId,
        invitedWorkspaceId,
      ),
      headers: { host: "127.0.0.1:3000", cookie: inviteeCookie },
    });
    expect(crossWorkspaceContext.statusCode).toBe(404);
    const denied = await app.inject({
      method: "POST",
      url: "/api/v1/ops/invitations",
      headers: { host: "127.0.0.1:3000", origin, cookie: inviteeCookie },
      payload: { email: "third@example.test" },
    });
    expect(denied.statusCode).toBe(403);

    const enableMfa = await app.inject({
      method: "POST",
      url: "/api/auth/two-factor/enable",
      headers: { host: "127.0.0.1:3000", origin, cookie: inviteeCookie },
      payload: { password, method: "totp" },
    });
    expect(enableMfa.statusCode).toBe(200);
    const enrollment = enableMfa.json<{
      totpURI: string;
      backupCodes: string[];
    }>();
    const encodedSecret = new URL(enrollment.totpURI).searchParams.get(
      "secret",
    );
    expect(encodedSecret).toBeTruthy();
    const code = totp(decodeBase32(encodedSecret ?? ""));
    const verifyMfa = await app.inject({
      method: "POST",
      url: "/api/auth/two-factor/verify-totp",
      headers: { host: "127.0.0.1:3000", origin, cookie: inviteeCookie },
      payload: { code },
    });
    expect(verifyMfa.statusCode).toBe(200);
    const pendingMfa = await signIn("invitee@example.test");
    expect(
      pendingMfa.json<{ twoFactorRedirect: boolean }>().twoFactorRedirect,
    ).toBe(true);
    const pendingMfaCookie = (
      Array.isArray(pendingMfa.headers["set-cookie"])
        ? pendingMfa.headers["set-cookie"]
        : [pendingMfa.headers["set-cookie"] ?? ""]
    )
      .map((value) => value.split(";", 1)[0])
      .join("; ");

    const suspended = await app.inject({
      method: "PATCH",
      url: `/api/v1/ops/users/${inviteeMe.json<{ user: { id: string } }>().user.id}/state`,
      headers: { host: "127.0.0.1:3000", origin, cookie: operatorCookie },
      payload: { suspended: true },
    });
    expect(suspended.statusCode).toBe(204);
    const afterSuspend = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { host: "127.0.0.1:3000", cookie: inviteeCookie },
    });
    expect(afterSuspend.statusCode).toBe(401);
    const suspendedLogin = await signIn("invitee@example.test");
    expect(suspendedLogin.statusCode).toBe(401);

    const staleFactor = await app.inject({
      method: "POST",
      url: "/api/auth/two-factor/verify-backup-code",
      headers: { host: "127.0.0.1:3000", origin, cookie: pendingMfaCookie },
      payload: { code: enrollment.backupCodes[0] },
    });
    expect(staleFactor.statusCode).toBe(401);
    const staleTotp = await app.inject({
      method: "POST",
      url: "/api/auth/two-factor/verify-totp",
      headers: { host: "127.0.0.1:3000", origin, cookie: pendingMfaCookie },
      payload: { code },
    });
    expect(staleTotp.statusCode).toBe(401);
    const afterFactorAttempts = await admin.query(
      "SELECT id FROM auth.session WHERE user_id = $1",
      [inviteeMe.json<{ user: { id: string } }>().user.id],
    );
    expect(afterFactorAttempts.rowCount).toBe(0);

    const inviteeId = inviteeMe.json<{ user: { id: string } }>().user.id;
    const reactivated = await app.inject({
      method: "PATCH",
      url: `/api/v1/ops/users/${inviteeId}/state`,
      headers: { host: "127.0.0.1:3000", origin, cookie: operatorCookie },
      payload: { suspended: false },
    });
    expect(reactivated.statusCode).toBe(204);
    const staleAfterReactivation = await app.inject({
      method: "POST",
      url: "/api/auth/two-factor/verify-backup-code",
      headers: { host: "127.0.0.1:3000", origin, cookie: pendingMfaCookie },
      payload: { code: enrollment.backupCodes[1] },
    });
    expect(staleAfterReactivation.statusCode).toBe(401);
    let resetToken: string | null = null;
    const recovery = createAuth({
      databaseUrl: roleUrl(container.getConnectionUri(), "ieum_be04_auth"),
      baseUrl: origin,
      secret: "be04_fixture_secret_at_least_32_characters",
      sendResetPassword: async (message) => {
        resetToken = message.token;
      },
    });
    const accountAdministration = createAccountAdministration({
      databaseUrl: roleUrl(container.getConnectionUri(), "ieum_be04_auth"),
      baseUrl: origin,
      secret: "be04_fixture_secret_at_least_32_characters",
    });
    try {
      await identity.recordLocalRecovery(inviteeId, "LOCAL_RECOVERY_STARTED");
      await recovery.auth.api.requestPasswordReset({
        body: {
          email: "invitee@example.test",
          redirectTo: `${origin}/reset-password`,
        },
      });
      expect(resetToken).toBeTruthy();
      const recoveredPassword = "be04 recovered password 5678";
      let oldPasswordAttempt: ReturnType<typeof signIn> | undefined;
      await identity.withAuthMutationLock(async () => {
        oldPasswordAttempt = signIn("invitee@example.test");
        for (
          let attempt = 0;
          attempt < 20 && authLockPool.waitingCount === 0;
          attempt++
        ) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        expect(authLockPool.waitingCount).toBeGreaterThan(0);
        await recovery.auth.api.resetPassword({
          body: { token: resetToken!, newPassword: recoveredPassword },
        });
        await accountAdministration.sessions.revokeAll(inviteeId);
        await accountAdministration.clearFactorsForLocalRecovery(inviteeId);
        await identity.recordLocalRecovery(
          inviteeId,
          "LOCAL_RECOVERY_COMPLETED",
        );
      });
      expect((await oldPasswordAttempt)?.statusCode).toBe(401);
      const factorRows = await admin.query(
        "SELECT id FROM auth.two_factor WHERE user_id = $1",
        [inviteeId],
      );
      expect(factorRows.rowCount).toBe(0);
      expect((await signIn("invitee@example.test")).statusCode).toBe(401);
      const newLogin = await app.inject({
        method: "POST",
        url: "/api/auth/sign-in/email",
        headers: { host: "127.0.0.1:3000", origin },
        payload: { email: "invitee@example.test", password: recoveredPassword },
      });
      expect(newLogin.statusCode).toBe(200);
      const events = await admin.query<{ kind: string }>(
        "SELECT kind FROM business.identity_event WHERE target_id = $1 AND kind LIKE 'LOCAL_RECOVERY_%'",
        [inviteeId],
      );
      expect(events.rows.map((row) => row.kind)).toEqual(
        expect.arrayContaining([
          "LOCAL_RECOVERY_STARTED",
          "LOCAL_RECOVERY_COMPLETED",
        ]),
      );
      expect(events.rows).toHaveLength(2);

      const [responses] = await Promise.all([
        Promise.all(
          Array.from({ length: 12 }, () => signIn("invitee@example.test")),
        ),
        identity.setUserSuspended(operator.userId, inviteeId, true),
      ]);
      expect(
        responses.every((response) =>
          [200, 401, 429].includes(response.statusCode),
        ),
      ).toBe(true);
      expect(await identity.isActiveUser(inviteeId)).toBe(false);

      await admin.query(
        "UPDATE auth.session SET updated_at = now() - interval '13 hours' WHERE user_id = $1",
        [operator.userId],
      );
      const idleRead = await app.inject({
        method: "GET",
        url: "/api/v1/me",
        headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
      });
      expect(idleRead.statusCode).toBe(401);
      const nativeIdleSession = await app.inject({
        method: "GET",
        url: "/api/auth/get-session",
        headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
      });
      expect(nativeIdleSession.statusCode).toBe(200);
      expect(nativeIdleSession.body).toBe("null");
      const idleMutation = await app.inject({
        method: "POST",
        url: "/api/auth/two-factor/enable",
        headers: { host: "127.0.0.1:3000", origin, cookie: operatorCookie },
        payload: { password, method: "totp" },
      });
      expect(idleMutation.statusCode).toBe(401);
      const idleActivity = await app.inject({
        method: "POST",
        url: "/api/v1/me/activity",
        headers: { host: "127.0.0.1:3000", origin, cookie: operatorCookie },
      });
      expect(idleActivity.statusCode).toBe(401);
      await admin.query(
        "UPDATE auth.session SET updated_at = now(), created_at = now() - interval '8 days' WHERE user_id = $1",
        [operator.userId],
      );
      const absoluteRead = await app.inject({
        method: "GET",
        url: "/api/v1/me",
        headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
      });
      expect(absoluteRead.statusCode).toBe(401);

      const httpsOrigin = "https://ieum.example.test";
      const httpsAuth = createAuth({
        databaseUrl: roleUrl(container.getConnectionUri(), "ieum_be04_auth"),
        baseUrl: httpsOrigin,
        secret: "be04_fixture_secret_at_least_32_characters",
      });
      const httpsApp = await createApiApp({
        auth: httpsAuth.auth,
        baseUrl: httpsOrigin,
        withAuthMutationLock: (operation) =>
          identity.withAuthMutationLock(operation),
      });
      try {
        const httpsLogin = await httpsApp.inject({
          method: "POST",
          url: "/api/auth/sign-in/email",
          headers: { host: "ieum.example.test", origin: httpsOrigin },
          payload: { email: "operator@example.test", password },
        });
        expect(httpsLogin.statusCode).toBe(200);
        const secureCookieHeader = httpsLogin.headers["set-cookie"];
        const secureCookie = (
          Array.isArray(secureCookieHeader)
            ? secureCookieHeader
            : [secureCookieHeader ?? ""]
        )
          .find((value) =>
            value.startsWith("__Secure-better-auth.session_token="),
          )
          ?.split(";", 1)[0];
        expect(secureCookie).toBeTruthy();
        await admin.query(
          "UPDATE auth.session SET updated_at = now() - interval '13 hours' WHERE user_id = $1",
          [operator.userId],
        );
        const staleSecureSession = await httpsApp.inject({
          method: "GET",
          url: "/api/auth/get-session",
          headers: { host: "ieum.example.test", cookie: secureCookie },
        });
        expect(staleSecureSession.statusCode).toBe(200);
        expect(staleSecureSession.body).toBe("null");
        const staleSecureMutation = await httpsApp.inject({
          method: "POST",
          url: "/api/auth/two-factor/enable",
          headers: {
            host: "ieum.example.test",
            origin: httpsOrigin,
            cookie: secureCookie,
          },
          payload: { password, method: "totp" },
        });
        expect(staleSecureMutation.statusCode).toBe(401);
      } finally {
        await httpsApp.close();
        await httpsAuth.close();
      }
    } finally {
      await Promise.all([recovery.close(), accountAdministration.close()]);
    }
  }, 60_000);
});
