import "reflect-metadata";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { IdentityService } from "@ieum/backend/identity-service";
import { CommandCoordinator } from "@ieum/backend/command-coordinator";
import { PreferenceCommands } from "@ieum/backend/preferences";
import { CaptureService } from "@ieum/backend/captures";
import { KnowledgeService } from "@ieum/backend/knowledge";
import { StructureService } from "@ieum/backend/knowledge/structure";
import { TaskService } from "@ieum/backend/tasks";
import { CalendarService } from "@ieum/backend/calendar";
import { JudgementService } from "@ieum/backend/judgement/judgement-service";
import { ProposalService } from "@ieum/backend/judgement/proposals";
import { ExtractionService } from "@ieum/backend/extraction/extraction-service";
import { DocumentService } from "@ieum/backend/documents";
import { ExternalExcerptService } from "@ieum/backend/documents/external-excerpts";
import { EvidencePackService } from "@ieum/backend/documents/evidence-packs";
import { DocumentWorkbenchService } from "@ieum/backend/documents/workbench";
import { GenerationService } from "@ieum/backend/generation/generation-service";
import { AssetService } from "@ieum/backend/assets/asset-service";
import { DocumentAssetService } from "@ieum/backend/assets/document-usage";
import { LocalAssetStorage } from "@ieum/backend/assets/storage";
import { PublicationService } from "@ieum/backend/publishing/publication-service";
import { DeliveryCredentialService } from "@ieum/backend/delivery/credential-service";
import { DataTransferService } from "@ieum/backend/data-transfer/service";
import { LocalTransferStorage } from "@ieum/backend/data-transfer/storage";
import {
  createCaptureBundle,
  createCaptureHistoryBundle,
  createContextBundle,
  createPersonalBundle,
  createTaskHistoryBundle,
  createTaskResultBundle,
  readCaptureBundle,
} from "@ieum/backend/data-transfer/manifest";
import {
  assertDeliveryDatabaseRole,
  DeliveryReader,
  LocalDeliveryAssetReader,
} from "@ieum/backend/delivery/reader";
import {
  processGenerationJob,
  reconcileAbandonedGeneration,
} from "@ieum/backend/generation/generation-worker";
import {
  EditorEnvelopeSchema,
  canonicalEditorBlock,
} from "@ieum/contracts/editor";
import { processJudgementJob } from "@ieum/backend/judgement/judgement-worker";
import { withWorkspaceTransaction } from "@ieum/backend/platform/database/scope";
import { assertApplicationDatabaseRole } from "@ieum/backend/platform/database/scope";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiApp } from "../src/app.js";
import { createDeliveryApp } from "../src/delivery/app.js";
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
  let deliveryPool: Pool;
  let authLockPool: Pool;
  let app: Awaited<ReturnType<typeof createApiApp>>;
  let deliveryApp: Awaited<ReturnType<typeof createDeliveryApp>>;
  let identity: IdentityService;
  let assetRoot: string;
  let transferWriteCalls = 0;

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
    await admin.query(
      "CREATE ROLE ieum_be20_delivery LOGIN PASSWORD 'be04_fixture_only' IN ROLE ieum_delivery",
    );
    await admin.query(
      "CREATE ROLE ieum_be20_replica LOGIN REPLICATION PASSWORD 'be04_fixture_only' IN ROLE ieum_delivery",
    );
    await admin.query(
      "CREATE ROLE ieum_be20_writer LOGIN PASSWORD 'be04_fixture_only' IN ROLE ieum_delivery",
    );
    await admin.query(
      "GRANT TRUNCATE ON delivery.publication_asset TO ieum_be20_writer",
    );
    const base = container.getConnectionUri();
    appPool = new Pool({
      connectionString: roleUrl(base, "ieum_be04_app"),
      max: 4,
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
    assetRoot = await mkdtemp(join(tmpdir(), "ieum-be18-assets-"));
    const assetStorage = await LocalAssetStorage.create(
      join(assetRoot, "private"),
      join(assetRoot, "derivative"),
    );
    const transferStorage = await LocalTransferStorage.create(
      join(assetRoot, "transfer"),
    );
    const countedTransferStorage = {
      write: async (key: string, bytes: Buffer) => {
        transferWriteCalls++;
        await transferStorage.write(key, bytes);
      },
      read: (key: string) => transferStorage.read(key),
      remove: (key: string) => transferStorage.remove(key),
    };
    deliveryPool = new Pool({
      connectionString: roleUrl(base, "ieum_be20_delivery"),
      max: 2,
      connectionTimeoutMillis: 2_000,
    });
    await assertDeliveryDatabaseRole(deliveryPool);
    const unsafeDeliveryPool = new Pool({
      connectionString: roleUrl(base, "ieum_be20_replica"),
      max: 1,
    });
    try {
      await expect(
        assertDeliveryDatabaseRole(unsafeDeliveryPool),
      ).rejects.toThrow("Delivery database role is not isolated");
    } finally {
      await unsafeDeliveryPool.end();
    }
    const unsafeWriterPool = new Pool({
      connectionString: roleUrl(base, "ieum_be20_writer"),
      max: 1,
    });
    try {
      await expect(
        assertDeliveryDatabaseRole(unsafeWriterPool),
      ).rejects.toThrow("Delivery database role is not isolated");
    } finally {
      await unsafeWriterPool.end();
    }
    deliveryApp = await createDeliveryApp(
      new DeliveryReader(
        deliveryPool,
        await LocalDeliveryAssetReader.create(join(assetRoot, "derivative")),
      ),
      () => deliveryPool.end(),
    );
    app = await createApiApp({
      auth: auth.auth,
      baseUrl: origin,
      identity: {
        service: identity,
        preferences: new PreferenceCommands(commands),
        captures: new CaptureService(identity, commands),
        knowledge: new KnowledgeService(identity, commands),
        structure: new StructureService(identity, commands),
        tasks: new TaskService(identity, commands),
        calendar: new CalendarService(identity, commands),
        judgement: new JudgementService(appPool, commands),
        proposals: new ProposalService(appPool, commands),
        extraction: new ExtractionService(identity, commands),
        documents: new DocumentService(identity, commands),
        externalExcerpts: new ExternalExcerptService(identity, commands),
        evidencePacks: new EvidencePackService(identity, commands),
        workbench: new DocumentWorkbenchService(identity, commands),
        generation: new GenerationService(identity, commands, {
          modelId: "fixture-model",
          inputPriceMicrousdPerMillion: 1000,
          outputPriceMicrousdPerMillion: 1000,
          maxJobCostMicrousd: 1000,
          timeoutMs: 1000,
        }),
        assets: new AssetService(identity, commands, assetStorage),
        documentAssets: new DocumentAssetService(identity, commands),
        publications: new PublicationService(identity, commands),
        deliveryCredentials: new DeliveryCredentialService(identity),
        dataTransfer: new DataTransferService(
          identity,
          commands,
          countedTransferStorage,
        ),
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
    await deliveryApp?.close();
    if (!deliveryApp) await deliveryPool?.end();
    await app?.close();
    await admin?.end();
    await container?.stop();
    if (assetRoot) await rm(assetRoot, { recursive: true, force: true });
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
    const judgementUrl = `/api/v1/workspaces/${operator.workspaceId}/judgements`;
    const judgementHeaders = {
      host: "127.0.0.1:3000",
      origin,
      cookie: operatorCookie,
      "idempotency-key": "be12-http-request-01",
    };
    const judgementPayload = {
      unitId: captureRead.json<{ units: { id: string }[] }>().units[0]!.id,
      unitRevision: 1,
    };
    const judgementAccepted = await app.inject({
      method: "POST",
      url: judgementUrl,
      headers: judgementHeaders,
      payload: judgementPayload,
    });
    expect(judgementAccepted.statusCode).toBe(202);
    const judgementRequestId = judgementAccepted.json<{ requestId: string }>()
      .requestId;
    expect(judgementAccepted.json()).toMatchObject({
      state: "QUEUED",
      replayed: false,
    });
    const judgementStatus = await app.inject({
      method: "GET",
      url: `${judgementUrl}/${judgementRequestId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(judgementStatus.statusCode).toBe(200);
    expect(judgementStatus.headers["cache-control"]).toBe("no-store");
    expect(judgementStatus.json()).toMatchObject({
      state: "QUEUED",
      inputHash: null,
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: judgementUrl,
          headers: { ...judgementHeaders, origin: "http://other.example" },
          payload: judgementPayload,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `${judgementUrl}/${judgementRequestId}`,
          headers: { host: "127.0.0.1:3000", cookie: inviteeCookie },
        })
      ).statusCode,
    ).toBe(404);
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
    const proposalQuery = await app.inject({
      method: "POST",
      url: captureUrl,
      headers: {
        ...captureHeaders,
        "idempotency-key": "be13-http-query-capture",
      },
      payload: { title: "제안 질문", rawBody: "계획" },
    });
    expect(proposalQuery.statusCode).toBe(201);
    const proposalUnitId = proposalQuery.json<{ unitId: string }>().unitId;
    const proposalRun = await app.inject({
      method: "POST",
      url: judgementUrl,
      headers: { ...judgementHeaders, "idempotency-key": "be13-http-observe" },
      payload: { unitId: proposalUnitId, unitRevision: 1 },
    });
    expect(proposalRun.statusCode).toBe(202);
    const proposalRunId = proposalRun.json<{ requestId: string }>().requestId;
    const proposalOutbox = await withWorkspaceTransaction(
      appPool,
      operator.workspaceId,
      (client) =>
        client.query<{ id: string }>(
          `SELECT id FROM business.command_outbox WHERE workspace_id=$1
           AND command_id=$2 AND event_type='judgement.requested'`,
          [operator.workspaceId, proposalRunId],
        ),
    );
    expect(
      (
        await processJudgementJob(appPool, {
          workspaceId: operator.workspaceId,
          outboxId: proposalOutbox.rows[0]!.id,
        })
      ).outcome,
    ).toBe("SUCCEEDED");
    const candidates = await app.inject({
      method: "GET",
      url: `${judgementUrl}/${proposalRunId}/candidates`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(candidates.statusCode).toBe(200);
    expect(
      candidates.json<{ candidates: { contextId: string }[] }>().candidates,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contextId,
          identityRevision: expect.any(Number),
          membershipRevision: expect.any(Number),
          rank: expect.any(Number),
          rankScore: expect.any(Number),
          decision: "candidate",
          reasons: expect.any(Array),
        }),
      ]),
    );
    const createdProposal = await app.inject({
      method: "POST",
      url: `${judgementUrl}/${proposalRunId}/proposals`,
      headers: { ...judgementHeaders, "idempotency-key": "be13-http-proposal" },
      payload: {
        unitId: proposalUnitId,
        unitRevision: 1,
        contextId,
        role: "SECONDARY",
      },
    });
    expect(createdProposal.statusCode).toBe(201);
    const proposalId = createdProposal.json<{ proposalId: string }>()
      .proposalId;
    const proposalUrl = `/api/v1/workspaces/${operator.workspaceId}/proposals/${proposalId}`;
    const preview = await app.inject({
      method: "GET",
      url: proposalUrl,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      operations: {
        unitId: proposalUnitId,
        after: [{ contextId, role: "SECONDARY" }],
      },
    });
    const operationsHash = preview.json<{ operationsHash: string }>()
      .operationsHash;
    expect(
      (
        await app.inject({
          method: "GET",
          url: proposalUrl,
          headers: { host: "127.0.0.1:3000", cookie: inviteeCookie },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `${proposalUrl}/expose`,
          headers: { ...judgementHeaders, origin: "http://other.example" },
        })
      ).statusCode,
    ).toBe(403);
    const exposure = await app.inject({
      method: "POST",
      url: `${proposalUrl}/expose`,
      headers: { ...judgementHeaders, "idempotency-key": "be13-http-exposure" },
    });
    expect(exposure.statusCode).toBe(200);
    const exposureId = exposure.json<{ exposureId: string }>().exposureId;
    const acceptedProposal = await app.inject({
      method: "POST",
      url: `${proposalUrl}/accept`,
      headers: { ...judgementHeaders, "idempotency-key": "be13-http-accept" },
      payload: { exposureId, operationsHash },
    });
    expect(acceptedProposal.statusCode).toBe(200);
    expect(acceptedProposal.json()).toMatchObject({
      state: "ACCEPTED",
      memberships: [{ contextId, role: "SECONDARY" }],
    });
    const staleObservedCandidate = await app.inject({
      method: "POST",
      url: `${judgementUrl}/${proposalRunId}/proposals`,
      headers: {
        ...judgementHeaders,
        "idempotency-key": "be13-http-stale-candidate",
      },
      payload: {
        unitId: proposalUnitId,
        unitRevision: 1,
        contextId,
        role: "PRIMARY",
      },
    });
    expect(staleObservedCandidate.statusCode).toBe(409);
    expect(staleObservedCandidate.json()).toMatchObject({
      code: "STALE_PROPOSAL",
      previewRequired: true,
    });
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
    const structureBase = `/api/v1/workspaces/${operator.workspaceId}/structures`;
    const structurePreview = await app.inject({
      method: "POST",
      url: `${structureBase}/preview`,
      headers: { ...captureHeaders, "idempotency-key": "be15-http-preview-01" },
      payload: {
        kind: "LINK",
        sourceContextId: contextId,
        addedLinks: [
          {
            fromContextId: contextId,
            toContextId: secondContextId,
            type: "PARENT_OF",
          },
        ],
      },
    });
    expect(structurePreview.statusCode).toBe(201);
    const structureProposal = structurePreview.json<{
      proposalId: string;
      preview: { signature: string };
    }>();
    const structureBadOrigin = await app.inject({
      method: "POST",
      url: `${structureBase}/preview`,
      headers: {
        ...captureHeaders,
        origin: "http://other.example",
        "idempotency-key": "be15-http-origin-01",
      },
      payload: {
        kind: "LINK",
        sourceContextId: contextId,
        addedLinks: [
          {
            fromContextId: contextId,
            toContextId: secondContextId,
            type: "PARENT_OF",
          },
        ],
      },
    });
    expect(structureBadOrigin.statusCode).toBe(403);
    const foreignStructureSource = randomUUID();
    const structureForeign = await app.inject({
      method: "POST",
      url: `${structureBase}/preview`,
      headers: { ...captureHeaders, "idempotency-key": "be15-http-foreign-01" },
      payload: {
        kind: "LINK",
        sourceContextId: foreignStructureSource,
        addedLinks: [
          {
            fromContextId: foreignStructureSource,
            toContextId: contextId,
            type: "PARENT_OF",
          },
        ],
      },
    });
    expect(structureForeign.statusCode).toBe(404);
    const structureApplied = await app.inject({
      method: "POST",
      url: `${structureBase}/proposals/${structureProposal.proposalId}/accept`,
      headers: { ...captureHeaders, "idempotency-key": "be15-http-accept-01" },
      payload: { signature: structureProposal.preview.signature },
    });
    expect(structureApplied.statusCode, structureApplied.body).toBe(201);
    const structureMutationId = structureApplied.json<{ mutationId: string }>()
      .mutationId;
    const structureInverse = await app.inject({
      method: "GET",
      url: `${structureBase}/mutations/${structureMutationId}/undo-preview`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(structureInverse.statusCode).toBe(200);
    const structureUndone = await app.inject({
      method: "POST",
      url: `${structureBase}/mutations/${structureMutationId}/undo`,
      headers: { ...captureHeaders, "idempotency-key": "be15-http-undo-01" },
      payload: {
        signature: structureInverse.json<{ signature: string }>().signature,
      },
    });
    expect(structureUndone.statusCode).toBe(201);
    expect(structureUndone.json()).toMatchObject({
      mutationId: structureMutationId,
      undone: true,
    });
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
    const eventUrl = `/api/v1/workspaces/${operator.workspaceId}/events`;
    const eventCreated = await app.inject({
      method: "POST",
      url: eventUrl,
      headers: { ...captureHeaders, "idempotency-key": "be10-http-event-001" },
      payload: {
        title: "서울 회의",
        schedule: {
          kind: "TIMED",
          timeZone: "Asia/Seoul",
          startLocal: "2024-06-01T09:30:00",
          endLocal: "2024-06-01T10:30:00",
        },
      },
    });
    expect(eventCreated.statusCode).toBe(201);
    const eventId = eventCreated.json<{ id: string }>().id;
    const eventList = await app.inject({
      method: "GET",
      url: `${eventUrl}?fromDate=2024-05-31&toDateExclusive=2024-06-01&viewTimeZone=America%2FNew_York`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(eventList.statusCode).toBe(200);
    expect(eventList.json()).toMatchObject({
      events: [
        { id: eventId, schedule: { displayStartLocal: "2024-05-31T20:30:00" } },
      ],
    });
    const eventGap = await app.inject({
      method: "POST",
      url: eventUrl,
      headers: { ...captureHeaders, "idempotency-key": "be10-http-gap-0001" },
      payload: {
        title: "DST gap",
        schedule: {
          kind: "TIMED",
          timeZone: "America/New_York",
          startLocal: "2024-03-10T02:30:00",
          endLocal: "2024-03-10T03:30:00",
        },
      },
    });
    expect(eventGap.statusCode).toBe(422);
    expect(eventGap.json()).toMatchObject({ code: "NONEXISTENT_LOCAL_TIME" });
    const eventCanceled = await app.inject({
      method: "POST",
      url: `${eventUrl}/${eventId}/state`,
      headers: { ...captureHeaders, "idempotency-key": "be10-http-cancel-001" },
      payload: { baseVersion: 1, targetState: "CANCELED" },
    });
    expect(eventCanceled.statusCode).toBe(201);
    expect(eventCanceled.json()).toMatchObject({
      version: 2,
      state: "CANCELED",
    });
    const eventRead = await app.inject({
      method: "GET",
      url: `${eventUrl}/${eventId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(eventRead.statusCode).toBe(200);
    expect(eventRead.json()).toMatchObject({
      state: "CANCELED",
      schedule: { startAt: "2024-06-01T00:30:00.000Z" },
    });
    const eventUnauthenticated = await app.inject({
      method: "GET",
      url: `${eventUrl}/${eventId}`,
      headers: { host: "127.0.0.1:3000" },
    });
    expect(eventUnauthenticated.statusCode).toBe(401);
    const eventBadOrigin = await app.inject({
      method: "POST",
      url: `${eventUrl}/${eventId}/state`,
      headers: {
        ...captureHeaders,
        origin: "http://other.example",
        "idempotency-key": "be10-http-origin-01",
      },
      payload: { baseVersion: 2, targetState: "CONFIRMED" },
    });
    expect(eventBadOrigin.statusCode).toBe(403);
    const eventCrossWorkspace = await app.inject({
      method: "POST",
      url: `${eventUrl}/${eventId}/state`.replace(
        operator.workspaceId,
        invitedWorkspaceId,
      ),
      headers: {
        host: "127.0.0.1:3000",
        origin,
        cookie: inviteeCookie,
        "idempotency-key": "be10-http-cross-001",
      },
      payload: { baseVersion: 2, targetState: "CONFIRMED" },
    });
    expect(eventCrossWorkspace.statusCode).toBe(404);
    const eventTooLongPeriod = await app.inject({
      method: "GET",
      url: `${eventUrl}?fromDate=2024-01-01&toDateExclusive=2025-01-03&viewTimeZone=UTC`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(eventTooLongPeriod.statusCode).toBe(422);
    const extractionCapture = await app.inject({
      method: "POST",
      url: captureUrl,
      headers: { ...captureHeaders, "idempotency-key": "be14-http-capture-01" },
      payload: { title: "추출할 기록", rawBody: "TODO: 검증 보고서 작성" },
    });
    expect(extractionCapture.statusCode).toBe(201);
    const extractionCaptureId = extractionCapture.json<{ id: string }>().id;
    const extractionGenerated = await app.inject({
      method: "POST",
      url: `${captureUrl}/${extractionCaptureId}/extractions`,
      headers: {
        ...captureHeaders,
        "idempotency-key": "be14-http-generate-01",
      },
    });
    expect(extractionGenerated.statusCode).toBe(201);
    const extractionCrossWorkspace = await app.inject({
      method: "POST",
      url: `${captureUrl}/${extractionCaptureId}/extractions`.replace(
        operator.workspaceId,
        invitedWorkspaceId,
      ),
      headers: {
        host: "127.0.0.1:3000",
        origin,
        cookie: inviteeCookie,
        "idempotency-key": "be14-http-cross-01",
      },
    });
    expect(extractionCrossWorkspace.statusCode).toBe(404);
    const extractionId = extractionGenerated.json<{ candidateIds: string[] }>()
      .candidateIds[0]!;
    const extractionUrl = `/api/v1/workspaces/${operator.workspaceId}/extractions/${extractionId}`;
    const extractionPreview = await app.inject({
      method: "GET",
      url: extractionUrl,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(extractionPreview.statusCode).toBe(200);
    expect(extractionPreview.json()).toMatchObject({
      state: "CANDIDATE",
      sourceStale: false,
      proposal: { targetKind: "task", suggestedTitle: "검증 보고서 작성" },
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: extractionUrl,
          headers: { host: "127.0.0.1:3000", cookie: inviteeCookie },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `${extractionUrl}/accept`,
          headers: {
            ...captureHeaders,
            origin: "http://other.example",
            "idempotency-key": "be14-http-origin-01",
          },
          payload: { expectedCaptureRevision: 1, title: "검증 보고서 작성" },
        })
      ).statusCode,
    ).toBe(403);
    const extractionAccepted = await app.inject({
      method: "POST",
      url: `${extractionUrl}/accept`,
      headers: { ...captureHeaders, "idempotency-key": "be14-http-accept-01" },
      payload: { expectedCaptureRevision: 1, title: "검증 보고서 작성" },
    });
    expect(extractionAccepted.statusCode).toBe(200);
    expect(extractionAccepted.json()).toMatchObject({
      state: "ACCEPTED",
      targetKind: "task",
    });
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

    const assetBase = `/api/v1/workspaces/${operator.workspaceId}/assets`;
    const assetHeaders = {
      host: "127.0.0.1:3000",
      origin,
      cookie: operatorCookie,
    };
    const assetBytes = Buffer.from("Private source for document.\n");
    const pending = await app.inject({
      method: "POST",
      url: assetBase,
      headers: { ...assetHeaders, "idempotency-key": "be18-create-valid-01" },
      payload: {
        fileName: "source.md",
        declaredMime: "text/markdown",
        expectedSize: assetBytes.length,
      },
    });
    expect(pending.statusCode).toBe(201);
    const assetId = pending.json<{ assetId: string }>().assetId;
    const uploaded = await app.inject({
      method: "PUT",
      url: `${assetBase}/${assetId}/content`,
      headers: {
        ...assetHeaders,
        "idempotency-key": "be18-upload-valid-01",
        "content-type": "application/octet-stream",
      },
      payload: assetBytes,
    });
    expect(uploaded.statusCode).toBe(200);
    expect(uploaded.json()).toMatchObject({ state: "VERIFIED", assetId });
    const assetPreview = await app.inject({
      method: "GET",
      url: `${assetBase}/${assetId}/preview`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(assetPreview.statusCode).toBe(200);
    expect(assetPreview.body).toBe(assetBytes.toString());
    expect(assetPreview.headers["cache-control"]).toBe("private, no-store");
    expect(assetPreview.headers["content-type"]).toContain("text/plain");
    const privateDownload = await app.inject({
      method: "GET",
      url: `${assetBase}/${assetId}/content`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(privateDownload.statusCode).toBe(200);
    expect(privateDownload.headers["content-type"]).toContain("text/markdown");
    expect(privateDownload.headers["content-disposition"]).toBe(
      'attachment; filename="download"',
    );
    const deniedAsset = await app.inject({
      method: "GET",
      url: `${assetBase}/${assetId}/content`,
      headers: { host: "127.0.0.1:3000", cookie: inviteeCookie },
    });
    expect(deniedAsset.statusCode).toBe(404);
    const badBytes = Buffer.from("<svg onload=alert(1)></svg>");
    const badPending = await app.inject({
      method: "POST",
      url: assetBase,
      headers: { ...assetHeaders, "idempotency-key": "be18-create-bad-01" },
      payload: {
        fileName: "fake.png",
        declaredMime: "image/png",
        expectedSize: badBytes.length,
      },
    });
    expect(badPending.statusCode).toBe(201);
    const badAssetId = badPending.json<{ assetId: string }>().assetId;
    const rejectedAsset = await app.inject({
      method: "PUT",
      url: `${assetBase}/${badAssetId}/content`,
      headers: {
        ...assetHeaders,
        "idempotency-key": "be18-upload-bad-01",
        "content-type": "application/octet-stream",
      },
      payload: badBytes,
    });
    expect(rejectedAsset.statusCode).toBe(200);
    expect(rejectedAsset.json()).toMatchObject({
      state: "REJECTED",
      rejectionCode: "MIME_MISMATCH",
    });
    const documentUrl = `/api/v1/workspaces/${operator.workspaceId}/documents`;
    const assetDocument = await app.inject({
      method: "POST",
      url: documentUrl,
      headers: {
        ...assetHeaders,
        "idempotency-key": "be18-document-create-01",
      },
      payload: { kind: "NOTE", title: "첨부 manifest 검증" },
    });
    expect(assetDocument.statusCode).toBe(201);
    const assetDocumentId = assetDocument.json<{ id: string }>().id;
    const attached = await app.inject({
      method: "PUT",
      url: `${documentUrl}/${assetDocumentId}/assets`,
      headers: {
        ...assetHeaders,
        "idempotency-key": "be18-document-attach-01",
      },
      payload: { baseDraftVersion: 1, assetIds: [assetId] },
    });
    expect(attached.statusCode).toBe(200);
    expect(attached.json()).toMatchObject({
      draftVersion: 2,
      assetIds: [assetId],
    });
    const assetUsage = await app.inject({
      method: "GET",
      url: `${assetBase}/${assetId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(assetUsage.json()).toMatchObject({
      usedInDocumentIds: [assetDocumentId],
    });
    const sealedAssetDocument = await app.inject({
      method: "POST",
      url: `${documentUrl}/${assetDocumentId}/revisions`,
      headers: { ...assetHeaders, "idempotency-key": "be18-document-seal-01" },
      payload: { draftVersion: 2 },
    });
    expect(sealedAssetDocument.statusCode).toBe(201);
    const sealedAssetRevision = await app.inject({
      method: "GET",
      url: `${documentUrl}/${assetDocumentId}/revisions/1`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(sealedAssetRevision.statusCode).toBe(200);
    expect(sealedAssetRevision.json()).toMatchObject({ assetIds: [assetId] });
    const publicPreviewUrl = `${documentUrl}/${assetDocumentId}/revisions/1/public-preview`;
    const publicPreview = await app.inject({
      method: "GET",
      url: publicPreviewUrl,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(publicPreview.statusCode, publicPreview.body).toBe(200);
    const firstManifestHash = publicPreview.json<{ manifestHash: string }>()
      .manifestHash;
    expect(publicPreview.json()).toMatchObject({
      publicAssetIds: [
        uploaded.json<{ publicAssetId: string }>().publicAssetId,
      ],
    });
    const oversizedRevision = await app.inject({
      method: "GET",
      url: `${documentUrl}/${assetDocumentId}/revisions/2147483648/public-preview`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(oversizedRevision.statusCode).toBe(422);
    const reviewUrl = `${documentUrl}/${assetDocumentId}/revisions/1/reviews`;
    const readyReview = await app.inject({
      method: "POST",
      url: reviewUrl,
      headers: { ...assetHeaders, "idempotency-key": "be19-review-ready-01" },
      payload: { manifestHash: firstManifestHash, decision: "READY" },
    });
    expect(readyReview.statusCode, readyReview.body).toBe(201);
    const reviewId = readyReview.json<{ reviewId: string }>().reviewId;
    const publicationUrl = `/api/v1/workspaces/${operator.workspaceId}/publications`;
    const publishPayload = {
      documentId: assetDocumentId,
      documentRevision: 1,
      reviewId,
      manifestHash: firstManifestHash,
      slug: "asset-note",
    };
    await withWorkspaceTransaction(appPool, operator.workspaceId, (client) =>
      client.query(
        "UPDATE business.public_asset SET state='DISABLED' WHERE workspace_id=$1 AND source_asset_id=$2",
        [operator.workspaceId, assetId],
      ),
    );
    const stalePublish = await app.inject({
      method: "POST",
      url: publicationUrl,
      headers: { ...assetHeaders, "idempotency-key": "be19-publish-stale-01" },
      payload: publishPayload,
    });
    expect(stalePublish.statusCode).toBe(409);
    expect(stalePublish.json()).toMatchObject({ code: "ASSET_STALE" });
    await withWorkspaceTransaction(appPool, operator.workspaceId, (client) =>
      client.query(
        "UPDATE business.public_asset SET state='VERIFIED' WHERE workspace_id=$1 AND source_asset_id=$2",
        [operator.workspaceId, assetId],
      ),
    );
    const published = await app.inject({
      method: "POST",
      url: publicationUrl,
      headers: { ...assetHeaders, "idempotency-key": "be19-publish-01" },
      payload: publishPayload,
    });
    expect(published.statusCode, published.body).toBe(201);
    expect(published.json()).toMatchObject({
      state: "PUBLISHED",
      publicRevision: 1,
      slug: "asset-note",
    });
    const publicationId = published.json<{ publicationId: string }>()
      .publicationId;
    const credentialUrl = `/api/v1/workspaces/${operator.workspaceId}/delivery-credentials`;
    const issuedCredential = await app.inject({
      method: "POST",
      url: credentialUrl,
      headers: { ...assetHeaders, origin },
      payload: { name: "blog-server", expiresInDays: 30 },
    });
    expect(issuedCredential.statusCode, issuedCredential.body).toBe(201);
    expect(issuedCredential.headers["cache-control"]).toBe("no-store");
    let credential = issuedCredential.json<{ id: string; token: string }>();
    let deliveryHeaders = { authorization: `Bearer ${credential.token}` };
    const credentialList = await app.inject({
      method: "GET",
      url: credentialUrl,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(credentialList.statusCode).toBe(200);
    expect(credentialList.body).not.toContain(credential.token);
    const noManagementAccess = await app.inject({
      method: "GET",
      url: publicationUrl,
      headers: { host: "127.0.0.1:3000", ...deliveryHeaders },
    });
    expect(noManagementAccess.statusCode).toBe(401);
    await expect(
      deliveryPool.query("SELECT * FROM business.capture LIMIT 1"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      deliveryPool.query("SELECT * FROM delivery.client_credential LIMIT 1"),
    ).rejects.toMatchObject({ code: "42501" });
    const publicDeliveryUrl = `/delivery/v1/publications/${publicationId}`;
    expect(
      (
        await deliveryApp.inject({
          method: "GET",
          url: publicDeliveryUrl,
          headers: { cookie: operatorCookie },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await deliveryApp.inject({
          method: "GET",
          url: `/delivery/v1/publications/${randomUUID()}`,
          headers: deliveryHeaders,
        })
      ).statusCode,
    ).toBe(404);
    const deliveryDetail = await deliveryApp.inject({
      method: "GET",
      url: publicDeliveryUrl,
      headers: deliveryHeaders,
    });
    expect(deliveryDetail.statusCode, deliveryDetail.body).toBe(200);
    expect(deliveryDetail.json()).toMatchObject({
      id: publicationId,
      publicRevision: 1,
      slug: "asset-note",
      assets: [
        { id: uploaded.json<{ publicAssetId: string }>().publicAssetId },
      ],
    });
    expect(deliveryDetail.body).not.toContain(assetId);
    expect(
      (
        await deliveryApp.inject({
          method: "GET",
          url: publicDeliveryUrl,
          headers: { authorization: `bearer ${credential.token}` },
        })
      ).statusCode,
    ).toBe(200);
    const firstDeliveryEtag = deliveryDetail.headers.etag as string;
    expect(
      (
        await deliveryApp.inject({
          method: "GET",
          url: publicDeliveryUrl,
          headers: { ...deliveryHeaders, "if-none-match": firstDeliveryEtag },
        })
      ).statusCode,
    ).toBe(304);
    const deliveryAssetUrl = `${publicDeliveryUrl}/assets/${uploaded.json<{ publicAssetId: string }>().publicAssetId}`;
    const deliveredAsset = await deliveryApp.inject({
      method: "GET",
      url: deliveryAssetUrl,
      headers: deliveryHeaders,
    });
    expect(deliveredAsset.statusCode, deliveredAsset.body).toBe(200);
    expect(deliveredAsset.body).toBe(assetBytes.toString());
    expect(deliveredAsset.headers["content-type"]).toContain("text/plain");
    const deliveryAssetEtag = deliveredAsset.headers.etag as string;
    const derivativeKey = await withWorkspaceTransaction(
      appPool,
      operator.workspaceId,
      async (client) => {
        const rows = await client.query<{ storage_key: string }>(
          "SELECT storage_key FROM delivery.publication_asset WHERE workspace_id=$1 AND publication_id=$2 AND revision=1",
          [operator.workspaceId, publicationId],
        );
        return rows.rows[0]!.storage_key;
      },
    );
    await writeFile(join(assetRoot, "derivative", derivativeKey), "corrupt");
    expect(
      (
        await deliveryApp.inject({
          method: "GET",
          url: deliveryAssetUrl,
          headers: deliveryHeaders,
        })
      ).statusCode,
    ).toBe(503);
    await writeFile(join(assetRoot, "derivative", derivativeKey), assetBytes);
    await admin.query(
      "UPDATE business.user_access SET state='SUSPENDED',authz_version=authz_version+1 WHERE user_id=$1",
      [operator.userId],
    );
    const suspendedDelivery = await deliveryApp.inject({
      method: "GET",
      url: publicDeliveryUrl,
      headers: { ...deliveryHeaders, "if-none-match": firstDeliveryEtag },
    });
    expect(suspendedDelivery.statusCode).toBe(401);
    await admin.query(
      "UPDATE business.user_access SET state='ACTIVE',authz_version=authz_version+1 WHERE user_id=$1",
      [operator.userId],
    );
    expect(
      (
        await deliveryApp.inject({
          method: "GET",
          url: publicDeliveryUrl,
          headers: deliveryHeaders,
        })
      ).statusCode,
    ).toBe(401);
    const resumedCredential = await app.inject({
      method: "POST",
      url: `${credentialUrl}/${credential.id}/rotate`,
      headers: { ...assetHeaders, origin },
      payload: { expiresInDays: 30 },
    });
    expect(resumedCredential.statusCode, resumedCredential.body).toBe(201);
    credential = resumedCredential.json<{ id: string; token: string }>();
    deliveryHeaders = { authorization: `Bearer ${credential.token}` };
    await admin.query(
      "UPDATE business.workspace SET state='SUSPENDED' WHERE id=$1",
      [operator.workspaceId],
    );
    expect(
      (
        await deliveryApp.inject({
          method: "GET",
          url: deliveryAssetUrl,
          headers: { ...deliveryHeaders, "if-none-match": deliveryAssetEtag },
        })
      ).statusCode,
    ).toBe(401);
    await admin.query(
      "UPDATE business.workspace SET state='ACTIVE' WHERE id=$1",
      [operator.workspaceId],
    );
    await admin.query(
      "UPDATE business.workspace_member SET state='SUSPENDED' WHERE workspace_id=$1 AND user_id=$2",
      [operator.workspaceId, operator.userId],
    );
    expect(
      (
        await deliveryApp.inject({
          method: "GET",
          url: publicDeliveryUrl,
          headers: deliveryHeaders,
        })
      ).statusCode,
    ).toBe(401);
    await admin.query(
      "UPDATE business.workspace_member SET state='ACTIVE' WHERE workspace_id=$1 AND user_id=$2",
      [operator.workspaceId, operator.userId],
    );
    await admin.query(
      "UPDATE business.publication_channel SET state='DISABLED' WHERE workspace_id=$1 AND name='default'",
      [operator.workspaceId],
    );
    expect(
      (
        await deliveryApp.inject({
          method: "GET",
          url: publicDeliveryUrl,
          headers: deliveryHeaders,
        })
      ).statusCode,
    ).toBe(401);
    await admin.query(
      "UPDATE business.publication_channel SET state='ACTIVE' WHERE workspace_id=$1 AND name='default'",
      [operator.workspaceId],
    );
    const duplicatePublish = await app.inject({
      method: "POST",
      url: publicationUrl,
      headers: {
        ...assetHeaders,
        "idempotency-key": "be19-publish-duplicate-01",
      },
      payload: publishPayload,
    });
    expect(duplicatePublish.statusCode).toBe(409);
    expect(duplicatePublish.json()).toMatchObject({
      code: "ALREADY_PUBLISHED",
    });
    const publicRow = await withWorkspaceTransaction(
      appPool,
      operator.workspaceId,
      (client) =>
        client.query(
          "SELECT title,body,manifest_hash FROM delivery.publication_revision WHERE workspace_id=$1 AND publication_id=$2 AND revision=1",
          [operator.workspaceId, publicationId],
        ),
    );
    expect(publicRow.rows[0]).toMatchObject({
      title: "첨부 manifest 검증",
      body: "",
      manifest_hash: firstManifestHash,
    });
    expect(JSON.stringify(publicRow.rows[0])).not.toContain(assetId);
    const crossPublication = await app.inject({
      method: "GET",
      url: `${publicationUrl}/${publicationId}`,
      headers: { host: "127.0.0.1:3000", cookie: inviteeCookie },
    });
    expect(crossPublication.statusCode).toBe(404);
    const detach = await app.inject({
      method: "PUT",
      url: `${documentUrl}/${assetDocumentId}/assets`,
      headers: { ...assetHeaders, "idempotency-key": "be19-detach-draft-01" },
      payload: { baseDraftVersion: 2, assetIds: [] },
    });
    expect(detach.statusCode).toBe(200);
    const afterDraft = await app.inject({
      method: "GET",
      url: `${publicationUrl}/${publicationId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(afterDraft.json()).toMatchObject({
      publicRevision: 1,
      publicAssetIds: [
        uploaded.json<{ publicAssetId: string }>().publicAssetId,
      ],
    });
    const secondSeal = await app.inject({
      method: "POST",
      url: `${documentUrl}/${assetDocumentId}/revisions`,
      headers: { ...assetHeaders, "idempotency-key": "be19-document-seal-02" },
      payload: { draftVersion: 3 },
    });
    expect(secondSeal.statusCode).toBe(201);
    const nextPreview = await app.inject({
      method: "GET",
      url: `${documentUrl}/${assetDocumentId}/revisions/2/public-preview`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(nextPreview.statusCode).toBe(200);
    expect(nextPreview.json()).toMatchObject({ publicAssetIds: [] });
    const nextHash = nextPreview.json<{ manifestHash: string }>().manifestHash;
    const nextReview = await app.inject({
      method: "POST",
      url: `${documentUrl}/${assetDocumentId}/revisions/2/reviews`,
      headers: { ...assetHeaders, "idempotency-key": "be19-review-ready-02" },
      payload: { manifestHash: nextHash, decision: "READY" },
    });
    expect(nextReview.statusCode).toBe(201);
    const revised = await app.inject({
      method: "POST",
      url: `${publicationUrl}/${publicationId}/revisions`,
      headers: { ...assetHeaders, "idempotency-key": "be19-revise-01" },
      payload: {
        basePublicRevision: 1,
        baseAccessEpoch: 2,
        documentRevision: 2,
        reviewId: nextReview.json<{ reviewId: string }>().reviewId,
        manifestHash: nextHash,
        slug: "asset-note-updated",
      },
    });
    expect(revised.statusCode, revised.body).toBe(201);
    expect(revised.json()).toMatchObject({
      publicRevision: 2,
      slug: "asset-note-updated",
      state: "PUBLISHED",
    });
    const refreshedDelivery = await deliveryApp.inject({
      method: "GET",
      url: publicDeliveryUrl,
      headers: { ...deliveryHeaders, "if-none-match": firstDeliveryEtag },
    });
    expect(refreshedDelivery.statusCode, refreshedDelivery.body).toBe(200);
    expect(refreshedDelivery.headers.etag).not.toBe(firstDeliveryEtag);
    expect(refreshedDelivery.json()).toMatchObject({
      publicRevision: 2,
      slug: "asset-note-updated",
      assets: [],
    });
    const priorAlias = await deliveryApp.inject({
      method: "GET",
      url: "/delivery/v1/publications/by-slug/asset-note",
      headers: deliveryHeaders,
    });
    expect(priorAlias.statusCode).toBe(200);
    expect(priorAlias.json()).toMatchObject({
      id: publicationId,
      publicRevision: 2,
    });
    expect(
      (
        await deliveryApp.inject({
          method: "GET",
          url: `${publicDeliveryUrl}/revisions/1`,
          headers: deliveryHeaders,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await deliveryApp.inject({
          method: "GET",
          url: deliveryAssetUrl,
          headers: { ...deliveryHeaders, "if-none-match": deliveryAssetEtag },
        })
      ).statusCode,
    ).toBe(404);
    const oldRevisionFromDeliveryRole = await withWorkspaceTransaction(
      deliveryPool,
      operator.workspaceId,
      (client) =>
        client.query(
          "SELECT revision FROM delivery.publication_revision WHERE workspace_id=$1 AND publication_id=$2 AND revision=1",
          [operator.workspaceId, publicationId],
        ),
    );
    expect(oldRevisionFromDeliveryRole.rowCount).toBe(0);
    const oldAlias = await withWorkspaceTransaction(
      appPool,
      operator.workspaceId,
      (client) =>
        client.query(
          "SELECT is_current FROM delivery.publication_slug WHERE workspace_id=$1 AND channel_id=(SELECT channel_id FROM delivery.publication WHERE id=$2) AND slug='asset-note'",
          [operator.workspaceId, publicationId],
        ),
    );
    expect(oldAlias.rows[0]).toMatchObject({ is_current: false });
    const withdrawn = await app.inject({
      method: "POST",
      url: `${publicationUrl}/${publicationId}/withdraw`,
      headers: { ...assetHeaders, "idempotency-key": "be19-withdraw-01" },
      payload: { basePublicRevision: 2 },
    });
    expect(withdrawn.statusCode).toBe(201);
    expect(withdrawn.json()).toMatchObject({
      state: "WITHDRAWN",
      publicRevision: 2,
    });
    const withdrawnRow = await withWorkspaceTransaction(
      appPool,
      operator.workspaceId,
      (client) =>
        client.query(
          "SELECT state FROM delivery.publication WHERE workspace_id=$1 AND id=$2",
          [operator.workspaceId, publicationId],
        ),
    );
    expect(withdrawnRow.rows[0]).toMatchObject({ state: "WITHDRAWN" });
    const withdrawnFromDeliveryRole = await withWorkspaceTransaction(
      deliveryPool,
      operator.workspaceId,
      (client) =>
        client.query(
          "SELECT revision FROM delivery.publication_revision WHERE workspace_id=$1 AND publication_id=$2",
          [operator.workspaceId, publicationId],
        ),
    );
    expect(withdrawnFromDeliveryRole.rowCount).toBe(0);
    for (const url of [
      publicDeliveryUrl,
      "/delivery/v1/publications/by-slug/asset-note",
      deliveryAssetUrl,
    ]) {
      const unavailable = await deliveryApp.inject({
        method: "GET",
        url,
        headers: { ...deliveryHeaders, "if-none-match": firstDeliveryEtag },
      });
      expect(unavailable.statusCode, url).toBe(404);
    }
    const aliasDocument = await app.inject({
      method: "POST",
      url: documentUrl,
      headers: {
        ...assetHeaders,
        "idempotency-key": "be19-alias-document-create-01",
      },
      payload: { kind: "ARTICLE", title: "충돌 대상" },
    });
    expect(aliasDocument.statusCode).toBe(201);
    const aliasDocumentId = aliasDocument.json<{ id: string }>().id;
    const aliasSeal = await app.inject({
      method: "POST",
      url: `${documentUrl}/${aliasDocumentId}/revisions`,
      headers: {
        ...assetHeaders,
        "idempotency-key": "be19-alias-document-seal-01",
      },
      payload: { draftVersion: 1 },
    });
    expect(aliasSeal.statusCode).toBe(201);
    const aliasPreview = await app.inject({
      method: "GET",
      url: `${documentUrl}/${aliasDocumentId}/revisions/1/public-preview`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(aliasPreview.statusCode).toBe(200);
    const aliasHash = aliasPreview.json<{ manifestHash: string }>()
      .manifestHash;
    const aliasReview = await app.inject({
      method: "POST",
      url: `${documentUrl}/${aliasDocumentId}/revisions/1/reviews`,
      headers: {
        ...assetHeaders,
        "idempotency-key": "be19-alias-document-review-01",
      },
      payload: { manifestHash: aliasHash, decision: "READY" },
    });
    expect(aliasReview.statusCode).toBe(201);
    const aliasCollision = await app.inject({
      method: "POST",
      url: publicationUrl,
      headers: { ...assetHeaders, "idempotency-key": "be19-alias-publish-01" },
      payload: {
        documentId: aliasDocumentId,
        documentRevision: 1,
        reviewId: aliasReview.json<{ reviewId: string }>().reviewId,
        manifestHash: aliasHash,
        slug: "asset-note",
      },
    });
    expect(aliasCollision.statusCode).toBe(409);
    expect(aliasCollision.json()).toMatchObject({ code: "SLUG_CONFLICT" });
    const racingDocument = await app.inject({
      method: "POST",
      url: documentUrl,
      headers: {
        ...assetHeaders,
        "idempotency-key": "be19-race-document-create-01",
      },
      payload: { kind: "ARTICLE", title: "동시 발행 대상" },
    });
    expect(racingDocument.statusCode).toBe(201);
    const racingDocumentId = racingDocument.json<{ id: string }>().id;
    const racingSeal = await app.inject({
      method: "POST",
      url: `${documentUrl}/${racingDocumentId}/revisions`,
      headers: {
        ...assetHeaders,
        "idempotency-key": "be19-race-document-seal-01",
      },
      payload: { draftVersion: 1 },
    });
    expect(racingSeal.statusCode).toBe(201);
    const racingPreview = await app.inject({
      method: "GET",
      url: `${documentUrl}/${racingDocumentId}/revisions/1/public-preview`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(racingPreview.statusCode).toBe(200);
    const racingHash = racingPreview.json<{ manifestHash: string }>()
      .manifestHash;
    const racingReview = await app.inject({
      method: "POST",
      url: `${documentUrl}/${racingDocumentId}/revisions/1/reviews`,
      headers: {
        ...assetHeaders,
        "idempotency-key": "be19-race-document-review-01",
      },
      payload: { manifestHash: racingHash, decision: "READY" },
    });
    expect(racingReview.statusCode).toBe(201);
    const racingPublishRequests = [
      {
        documentId: aliasDocumentId,
        reviewId: aliasReview.json<{ reviewId: string }>().reviewId,
        manifestHash: aliasHash,
      },
      {
        documentId: racingDocumentId,
        reviewId: racingReview.json<{ reviewId: string }>().reviewId,
        manifestHash: racingHash,
      },
    ];
    const racingPublished = await Promise.all(
      racingPublishRequests.map((candidate, index) =>
        app.inject({
          method: "POST",
          url: publicationUrl,
          headers: {
            ...assetHeaders,
            "idempotency-key": `be19-race-publish-${index + 1}`,
          },
          payload: {
            ...candidate,
            documentRevision: 1,
            slug: "racing-slug",
          },
        }),
      ),
    );
    expect(racingPublished.map((result) => result.statusCode).sort()).toEqual([
      201, 409,
    ]);
    expect(
      racingPublished.find((result) => result.statusCode === 409)?.json(),
    ).toMatchObject({ code: "SLUG_CONFLICT" });
    const racingWinnerIndex = racingPublished.findIndex(
      (result) => result.statusCode === 201,
    );
    const racingWinner = racingPublished[racingWinnerIndex]!.json<{
      publicationId: string;
      accessEpoch: number;
    }>();
    const racingLoserIndex = 1 - racingWinnerIndex;
    const racingLoser = racingPublishRequests[racingLoserIndex]!;
    const secondRacingPublication = await app.inject({
      method: "POST",
      url: publicationUrl,
      headers: {
        ...assetHeaders,
        "idempotency-key": "be20-second-racing-publication",
      },
      payload: {
        ...racingLoser,
        documentRevision: 1,
        slug: "second-racing-slug",
      },
    });
    expect(
      secondRacingPublication.statusCode,
      secondRacingPublication.body,
    ).toBe(201);
    const deliveryFirstPage = await deliveryApp.inject({
      method: "GET",
      url: "/delivery/v1/publications?limit=1",
      headers: deliveryHeaders,
    });
    expect(deliveryFirstPage.statusCode, deliveryFirstPage.body).toBe(200);
    const firstPage = deliveryFirstPage.json<{
      items: { id: string }[];
      nextCursor: string;
    }>();
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBeTruthy();
    const deliverySecondPage = await deliveryApp.inject({
      method: "GET",
      url: `/delivery/v1/publications?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor)}`,
      headers: deliveryHeaders,
    });
    expect(deliverySecondPage.statusCode, deliverySecondPage.body).toBe(200);
    expect(
      deliverySecondPage.json<{ items: { id: string }[] }>().items[0]?.id,
    ).not.toBe(firstPage.items[0]?.id);
    expect(
      (
        await deliveryApp.inject({
          method: "GET",
          url: "/delivery/v1/publications?limit=1&cursor=modified.invalid",
          headers: deliveryHeaders,
        })
      ).statusCode,
    ).toBe(400);
    const winnerDocumentId =
      racingPublishRequests[racingWinnerIndex]!.documentId;
    const racingSave = await app.inject({
      method: "PUT",
      url: `${documentUrl}/${winnerDocumentId}/draft`,
      headers: {
        ...assetHeaders,
        "idempotency-key": "be19-race-draft-save-01",
      },
      payload: {
        baseVersion: 1,
        saveSequence: 2,
        schemaVersion: 1,
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { blockId: randomUUID() },
              content: [{ type: "text", text: "개정 경쟁" }],
            },
          ],
        },
      },
    });
    expect(racingSave.statusCode, racingSave.body).toBe(200);
    const racingSecondSeal = await app.inject({
      method: "POST",
      url: `${documentUrl}/${winnerDocumentId}/revisions`,
      headers: {
        ...assetHeaders,
        "idempotency-key": "be19-race-document-seal-02",
      },
      payload: { draftVersion: 2 },
    });
    expect(racingSecondSeal.statusCode).toBe(201);
    const racingSecondPreview = await app.inject({
      method: "GET",
      url: `${documentUrl}/${winnerDocumentId}/revisions/2/public-preview`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(racingSecondPreview.statusCode).toBe(200);
    const racingSecondHash = racingSecondPreview.json<{
      manifestHash: string;
    }>().manifestHash;
    const racingSecondReview = await app.inject({
      method: "POST",
      url: `${documentUrl}/${winnerDocumentId}/revisions/2/reviews`,
      headers: {
        ...assetHeaders,
        "idempotency-key": "be19-race-document-review-02",
      },
      payload: { manifestHash: racingSecondHash, decision: "READY" },
    });
    expect(racingSecondReview.statusCode).toBe(201);
    const racingTransitions = await Promise.all([
      app.inject({
        method: "POST",
        url: `${publicationUrl}/${racingWinner.publicationId}/revisions`,
        headers: { ...assetHeaders, "idempotency-key": "be19-race-revise-01" },
        payload: {
          basePublicRevision: 1,
          baseAccessEpoch: racingWinner.accessEpoch,
          documentRevision: 2,
          reviewId: racingSecondReview.json<{ reviewId: string }>().reviewId,
          manifestHash: racingSecondHash,
          slug: "racing-slug-updated",
        },
      }),
      app.inject({
        method: "POST",
        url: `${publicationUrl}/${racingWinner.publicationId}/withdraw`,
        headers: {
          ...assetHeaders,
          "idempotency-key": "be19-race-withdraw-01",
        },
        payload: { basePublicRevision: 1 },
      }),
    ]);
    expect(racingTransitions.map((result) => result.statusCode).sort()).toEqual(
      [201, 409],
    );
    expect(
      racingTransitions.find((result) => result.statusCode === 409)?.json(),
    ).toMatchObject({ code: "VERSION_CONFLICT" });
    const racingCurrent = await app.inject({
      method: "GET",
      url: `${publicationUrl}/${racingWinner.publicationId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(racingCurrent.statusCode).toBe(200);
    const winningTransition = racingTransitions
      .find((result) => result.statusCode === 201)!
      .json<{
        state: string;
        publicRevision: number;
        slug: string;
        accessEpoch: number;
      }>();
    expect(racingCurrent.json()).toMatchObject({
      state: winningTransition.state,
      publicRevision: winningTransition.publicRevision,
      slug: winningTransition.slug,
      accessEpoch: winningTransition.accessEpoch,
    });
    const rotatedCredential = await app.inject({
      method: "POST",
      url: `${credentialUrl}/${credential.id}/rotate`,
      headers: { ...assetHeaders, origin },
      payload: { expiresInDays: 30 },
    });
    expect(rotatedCredential.statusCode, rotatedCredential.body).toBe(201);
    const rotated = rotatedCredential.json<{ id: string; token: string }>();
    expect(rotated.token).not.toBe(credential.token);
    expect(
      (
        await deliveryApp.inject({
          method: "GET",
          url: "/delivery/v1/publications",
          headers: deliveryHeaders,
        })
      ).statusCode,
    ).toBe(401);
    const rotatedHeaders = { authorization: `Bearer ${rotated.token}` };
    expect(
      (
        await deliveryApp.inject({
          method: "GET",
          url: "/delivery/v1/publications",
          headers: rotatedHeaders,
        })
      ).statusCode,
    ).toBe(200);
    const revokedCredential = await app.inject({
      method: "POST",
      url: `${credentialUrl}/${rotated.id}/revoke`,
      headers: { ...assetHeaders, origin },
    });
    expect(revokedCredential.statusCode).toBe(201);
    expect(revokedCredential.json()).toMatchObject({ state: "REVOKED" });
    expect(
      (
        await deliveryApp.inject({
          method: "GET",
          url: "/delivery/v1/publications",
          headers: rotatedHeaders,
        })
      ).statusCode,
    ).toBe(401);
    const expiringCredential = await app.inject({
      method: "POST",
      url: credentialUrl,
      headers: { ...assetHeaders, origin },
      payload: { name: "expired-fixture", expiresInDays: 1 },
    });
    expect(expiringCredential.statusCode).toBe(201);
    const expired = expiringCredential.json<{ id: string; token: string }>();
    await admin.query(
      `UPDATE delivery.client_credential
       SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day'
       WHERE id=$1`,
      [expired.id],
    );
    expect(
      (
        await deliveryApp.inject({
          method: "GET",
          url: "/delivery/v1/publications",
          headers: { authorization: `Bearer ${expired.token}` },
        })
      ).statusCode,
    ).toBe(401);
    await admin.query(
      "UPDATE auth.session SET created_at=now()-interval '6 minutes' WHERE user_id=$1",
      [operator.userId],
    );
    const reauthRequired = await app.inject({
      method: "POST",
      url: `${documentUrl}/${aliasDocumentId}/revisions/1/reviews`,
      headers: {
        ...assetHeaders,
        "idempotency-key": "be19-reauth-required-01",
      },
      payload: { manifestHash: aliasHash, decision: "READY" },
    });
    expect(reauthRequired.statusCode).toBe(403);
    expect(reauthRequired.json()).toMatchObject({ code: "REAUTH_REQUIRED" });
    await admin.query(
      "UPDATE auth.session SET created_at=now() WHERE user_id=$1",
      [operator.userId],
    );
    const usedDelete = await app.inject({
      method: "DELETE",
      url: `${assetBase}/${assetId}`,
      headers: { ...assetHeaders, "idempotency-key": "be18-delete-used-01" },
    });
    expect(usedDelete.statusCode).toBe(409);
    expect(usedDelete.json()).toMatchObject({ code: "ASSET_IN_USE" });
    const documentHeaders = {
      host: "127.0.0.1:3000",
      origin,
      cookie: operatorCookie,
      "idempotency-key": "be11-document-create-01",
    };
    const createdWiki = await app.inject({
      method: "POST",
      url: documentUrl,
      headers: documentHeaders,
      payload: { kind: "WIKI", title: "연결할 위키" },
    });
    expect(createdWiki.statusCode).toBe(201);
    const wikiId = createdWiki.json<{ id: string }>().id;
    expect(createdWiki.json()).toMatchObject({
      draftVersion: 1,
      latestRevision: 0,
    });
    const wikiBase = `${documentUrl}/${wikiId}`;
    const emptyWiki = await app.inject({
      method: "GET",
      url: wikiBase,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(emptyWiki.statusCode).toBe(200);
    expect(emptyWiki.json()).toMatchObject({
      content: { schemaVersion: 1, content: { type: "doc", content: [] } },
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: wikiBase.replace(operator.workspaceId, invitedWorkspaceId),
          headers: { host: "127.0.0.1:3000", cookie: inviteeCookie },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: documentUrl,
          headers: {
            ...documentHeaders,
            "idempotency-key": "be11-bad-origin",
            origin: "https://other.example",
          },
          payload: { kind: "WIKI", title: "거부" },
        })
      ).statusCode,
    ).toBe(403);

    const blockId = randomUUID();
    const documentContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId },
          content: [{ type: "text", text: "첫 문장" }],
        },
      ],
    };
    const saveUrl = `${wikiBase}/draft`;
    const savePayload = {
      baseVersion: 1,
      saveSequence: 2,
      schemaVersion: 1,
      content: documentContent,
    };
    expect(
      (
        await app.inject({
          method: "PUT",
          url: saveUrl,
          headers: {
            ...documentHeaders,
            "idempotency-key": "be11-bad-schema-01",
          },
          payload: { ...savePayload, schemaVersion: 2 },
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: saveUrl,
          headers: {
            ...documentHeaders,
            "idempotency-key": "be11-bad-node-01",
          },
          payload: {
            ...savePayload,
            content: {
              type: "doc",
              content: [{ type: "image", attrs: { blockId } }],
            },
          },
        })
      ).statusCode,
    ).toBe(422);
    for (const [key, invalidText] of [
      ["be11-nul-text-01", "bad\u0000text"],
      ["be11-surrogate-01", "bad\ud800text"],
    ] as const) {
      const invalidSave = await app.inject({
        method: "PUT",
        url: saveUrl,
        headers: { ...documentHeaders, "idempotency-key": key },
        payload: {
          ...savePayload,
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                attrs: { blockId },
                content: [{ type: "text", text: invalidText }],
              },
            ],
          },
        },
      });
      expect(invalidSave.statusCode, `${key}: ${invalidSave.body}`).toBe(422);
    }
    const saved = await app.inject({
      method: "PUT",
      url: saveUrl,
      headers: { ...documentHeaders, "idempotency-key": "be11-save-02" },
      payload: savePayload,
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      draftVersion: 2,
      saveSequence: 2,
      recheckBlockIds: [blockId],
    });
    const replayedSave = await app.inject({
      method: "PUT",
      url: saveUrl,
      headers: { ...documentHeaders, "idempotency-key": "be11-save-02" },
      payload: savePayload,
    });
    expect(replayedSave.json()).toMatchObject({
      replayed: true,
      draftVersion: 2,
    });
    const reversedOlderSave = await app.inject({
      method: "PUT",
      url: saveUrl,
      headers: { ...documentHeaders, "idempotency-key": "be11-save-01" },
      payload: { ...savePayload, saveSequence: 1 },
    });
    expect(reversedOlderSave.statusCode).toBe(409);
    expect(reversedOlderSave.json()).toMatchObject({
      code: "VERSION_CONFLICT",
      currentVersion: 2,
    });
    const sealed = await app.inject({
      method: "POST",
      url: `${wikiBase}/revisions`,
      headers: { ...documentHeaders, "idempotency-key": "be11-seal-01" },
      payload: { draftVersion: 2 },
    });
    expect(sealed.statusCode).toBe(201);
    expect(sealed.json()).toMatchObject({
      revision: 1,
      draftVersion: 2,
      restoredFromRevision: null,
    });
    const oldRevision = await app.inject({
      method: "GET",
      url: `${wikiBase}/revisions/1`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(oldRevision.statusCode).toBe(200);
    expect(oldRevision.json()).toMatchObject({
      content: { content: documentContent },
    });
    await expect(
      identity.withPersonalWorkspace(operator.userId, async (client) =>
        client.query(
          `UPDATE business.document_revision SET title='tamper' WHERE workspace_id=$1 AND document_id=$2`,
          [operator.workspaceId, wikiId],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    const secondContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId },
          content: [{ type: "text", text: "현재 편집 중" }],
        },
      ],
    };
    const secondSave = await app.inject({
      method: "PUT",
      url: saveUrl,
      headers: { ...documentHeaders, "idempotency-key": "be11-save-03" },
      payload: {
        baseVersion: 2,
        saveSequence: 3,
        schemaVersion: 1,
        content: secondContent,
      },
    });
    expect(secondSave.statusCode).toBe(200);
    expect(secondSave.json()).toMatchObject({
      draftVersion: 3,
      recheckBlockIds: [blockId],
    });
    const restored = await app.inject({
      method: "POST",
      url: `${wikiBase}/restore`,
      headers: { ...documentHeaders, "idempotency-key": "be11-restore-01" },
      payload: { baseRevision: 1, sourceRevision: 1 },
    });
    expect(restored.statusCode).toBe(201);
    expect(restored.json()).toMatchObject({
      revision: 2,
      draftVersion: 3,
      restoredFromRevision: 1,
    });
    const currentWiki = await app.inject({
      method: "GET",
      url: wikiBase,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(currentWiki.json()).toMatchObject({
      draftVersion: 3,
      latestRevision: 2,
      content: { content: secondContent },
    });
    const restoredRevision = await app.inject({
      method: "GET",
      url: `${wikiBase}/revisions/2`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(restoredRevision.json()).toMatchObject({
      content: { content: documentContent },
    });

    const anotherWiki = await app.inject({
      method: "POST",
      url: documentUrl,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be11-document-create-02",
      },
      payload: { kind: "WIKI", title: "대상 위키" },
    });
    expect(anotherWiki.statusCode).toBe(201);
    const targetId = anotherWiki.json<{ id: string }>().id;
    const linked = await app.inject({
      method: "PUT",
      url: `${wikiBase}/links`,
      headers: { ...documentHeaders, "idempotency-key": "be11-links-01" },
      payload: { baseLinkVersion: 1, targetIds: [targetId] },
    });
    expect(linked.statusCode).toBe(200);
    expect(linked.json()).toMatchObject({
      linkVersion: 2,
      targetIds: [targetId],
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: `${documentUrl}/${targetId}`,
          headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
        })
      ).json(),
    ).toMatchObject({ backlinks: [wikiId] });
    const unlinked = await app.inject({
      method: "PUT",
      url: `${wikiBase}/links`,
      headers: { ...documentHeaders, "idempotency-key": "be11-links-02" },
      payload: { baseLinkVersion: 2, targetIds: [] },
    });
    expect(unlinked.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `${documentUrl}/${targetId}`,
          headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
        })
      ).json(),
    ).toMatchObject({ backlinks: [] });
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `${wikiBase}/links`,
          headers: {
            ...documentHeaders,
            "idempotency-key": "be11-links-cross-01",
          },
          payload: { baseLinkVersion: 3, targetIds: [randomUUID()] },
        })
      ).statusCode,
    ).toBe(422);

    const unitSource = await identity.withPersonalWorkspace(
      operator.userId,
      async (client) => {
        const row = await client.query<{
          origin_key: string;
          content_text: string;
        }>(
          `SELECT u.origin_key,r.content_text FROM business.thought_unit u
         JOIN business.thought_unit_revision r ON r.workspace_id=u.workspace_id AND r.unit_id=u.id
         WHERE u.workspace_id=$1 AND u.id=$2 AND r.revision=1`,
          [operator.workspaceId, unitId],
        );
        return row.rows[0]!;
      },
    );
    const sourcedContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId },
          content: [
            {
              type: "sourceReference",
              attrs: {
                label: "원문",
                ref: {
                  sourceKind: "unit",
                  sourceId: unitId,
                  sourceRevision: 1,
                  originKey: unitSource.origin_key,
                  sourceHash: createHash("sha256")
                    .update(unitSource.content_text)
                    .digest("hex"),
                  span: {
                    start: 0,
                    end: unitSource.content_text.length,
                    encoding: "utf16",
                  },
                },
              },
            },
          ],
        },
      ],
    };
    const sourcedSave = await app.inject({
      method: "PUT",
      url: saveUrl,
      headers: { ...documentHeaders, "idempotency-key": "be11-source-save-01" },
      payload: {
        baseVersion: 3,
        saveSequence: 4,
        schemaVersion: 1,
        content: sourcedContent,
      },
    });
    expect(sourcedSave.statusCode).toBe(200);
    const sourcePublicationDocument = await app.inject({
      method: "POST",
      url: documentUrl,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be19-source-document-create-01",
      },
      payload: { kind: "ARTICLE", title: "출처 공개 경계" },
    });
    expect(sourcePublicationDocument.statusCode).toBe(201);
    const sourcePublicationDocumentId = sourcePublicationDocument.json<{
      id: string;
    }>().id;
    const sourceDraft = await app.inject({
      method: "PUT",
      url: `${documentUrl}/${sourcePublicationDocumentId}/draft`,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be19-source-document-save-01",
      },
      payload: {
        baseVersion: 1,
        saveSequence: 1,
        schemaVersion: 1,
        content: sourcedContent,
      },
    });
    expect(sourceDraft.statusCode).toBe(200);
    const sourceSeal = await app.inject({
      method: "POST",
      url: `${documentUrl}/${sourcePublicationDocumentId}/revisions`,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be19-source-document-seal-01",
      },
      payload: { draftVersion: 2 },
    });
    expect(sourceSeal.statusCode).toBe(201);
    const sourcePreview = await app.inject({
      method: "GET",
      url: `${documentUrl}/${sourcePublicationDocumentId}/revisions/1/public-preview`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(sourcePreview.statusCode, sourcePreview.body).toBe(200);
    expect(sourcePreview.json()).toMatchObject({
      sourceCount: 1,
      body: "원문",
    });
    expect(sourcePreview.body).not.toContain(unitId);
    expect(sourcePreview.body).not.toContain(unitSource.content_text);
    const sourceManifestHash = sourcePreview.json<{ manifestHash: string }>()
      .manifestHash;
    const sourceReady = await app.inject({
      method: "POST",
      url: `${documentUrl}/${sourcePublicationDocumentId}/revisions/1/reviews`,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be19-source-review-ready-01",
      },
      payload: { manifestHash: sourceManifestHash, decision: "READY" },
    });
    expect(sourceReady.statusCode).toBe(201);
    const sourcePublishBody = {
      documentId: sourcePublicationDocumentId,
      documentRevision: 1,
      reviewId: sourceReady.json<{ reviewId: string }>().reviewId,
      manifestHash: sourceManifestHash,
      slug: "source-note",
    };
    await withWorkspaceTransaction(appPool, operator.workspaceId, (client) =>
      client.query(
        "UPDATE business.thought_unit SET state='SUPERSEDED' WHERE workspace_id=$1 AND id=$2",
        [operator.workspaceId, unitId],
      ),
    );
    const sourceStale = await app.inject({
      method: "POST",
      url: publicationUrl,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be19-source-stale-01",
      },
      payload: sourcePublishBody,
    });
    expect(sourceStale.statusCode).toBe(409);
    expect(sourceStale.json()).toMatchObject({ code: "SOURCE_STALE" });
    await withWorkspaceTransaction(appPool, operator.workspaceId, (client) =>
      client.query(
        "UPDATE business.thought_unit SET state='ACTIVE' WHERE workspace_id=$1 AND id=$2",
        [operator.workspaceId, unitId],
      ),
    );
    const sourcePublished = await app.inject({
      method: "POST",
      url: publicationUrl,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be19-source-publish-01",
      },
      payload: sourcePublishBody,
    });
    expect(sourcePublished.statusCode, sourcePublished.body).toBe(201);
    const sourcePublicRow = await withWorkspaceTransaction(
      appPool,
      operator.workspaceId,
      (client) =>
        client.query(
          "SELECT body FROM delivery.publication_revision WHERE workspace_id=$1 AND publication_id=$2 AND revision=1",
          [
            operator.workspaceId,
            sourcePublished.json<{ publicationId: string }>().publicationId,
          ],
        ),
    );
    expect(sourcePublicRow.rows[0]).toMatchObject({ body: "원문" });
    const sourcePublicationId = sourcePublished.json<{
      publicationId: string;
    }>().publicationId;
    const laterRejection = await app.inject({
      method: "POST",
      url: `${documentUrl}/${sourcePublicationDocumentId}/revisions/1/reviews`,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be19-source-review-reject-01",
      },
      payload: {
        manifestHash: sourceManifestHash,
        decision: "CHANGES_REQUIRED",
      },
    });
    expect(laterRejection.statusCode).toBe(201);
    const automaticallyWithdrawn = await app.inject({
      method: "GET",
      url: `${publicationUrl}/${sourcePublicationId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(automaticallyWithdrawn.json()).toMatchObject({ state: "WITHDRAWN" });
    const oldReadyRevise = await app.inject({
      method: "POST",
      url: `${publicationUrl}/${sourcePublicationId}/revisions`,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be19-source-old-ready-01",
      },
      payload: {
        basePublicRevision: 1,
        baseAccessEpoch: automaticallyWithdrawn.json<{ accessEpoch: number }>()
          .accessEpoch,
        documentRevision: 1,
        reviewId: sourceReady.json<{ reviewId: string }>().reviewId,
        manifestHash: sourceManifestHash,
        slug: "source-note-new",
      },
    });
    expect(oldReadyRevise.statusCode).toBe(409);
    expect(oldReadyRevise.json()).toMatchObject({ code: "REVIEW_NOT_READY" });
    expect(
      (
        await app.inject({
          method: "PUT",
          url: saveUrl,
          headers: {
            ...documentHeaders,
            "idempotency-key": "be11-source-bad-01",
          },
          payload: {
            baseVersion: 4,
            saveSequence: 5,
            schemaVersion: 1,
            content: {
              ...sourcedContent,
              content: [
                {
                  ...sourcedContent.content[0],
                  content: [
                    {
                      ...sourcedContent.content[0]!.content[0],
                      attrs: {
                        ...sourcedContent.content[0]!.content[0]!.attrs,
                        ref: {
                          ...sourcedContent.content[0]!.content[0]!.attrs.ref,
                          sourceHash: "bad",
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        })
      ).statusCode,
    ).toBe(422);

    const [tabA, tabB] = await Promise.all([
      app.inject({
        method: "PUT",
        url: saveUrl,
        headers: { ...documentHeaders, "idempotency-key": "be11-tab-a-01" },
        payload: {
          baseVersion: 4,
          saveSequence: 6,
          schemaVersion: 1,
          content: documentContent,
        },
      }),
      app.inject({
        method: "PUT",
        url: saveUrl,
        headers: { ...documentHeaders, "idempotency-key": "be11-tab-b-01" },
        payload: {
          baseVersion: 4,
          saveSequence: 7,
          schemaVersion: 1,
          content: secondContent,
        },
      }),
    ]);
    expect([tabA.statusCode, tabB.statusCode].sort()).toEqual([200, 409]);
    expect(
      (
        await app.inject({
          method: "GET",
          url: wikiBase,
          headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
        })
      ).json(),
    ).toMatchObject({ draftVersion: 5 });

    const revisionRef = {
      sourceKind: "document_revision",
      sourceId: wikiId,
      sourceRevision: 1,
      originKey: `document:${wikiId}`,
      sourceHash: sealed.json<{ contentHash: string }>().contentHash,
      span: { start: 0, end: "첫 문장".length, encoding: "utf16" },
    };
    const revisionSourceContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId },
          content: [
            {
              type: "sourceReference",
              attrs: { label: "이전 문서", ref: revisionRef },
            },
          ],
        },
      ],
    };
    const revisionRefSave = await app.inject({
      method: "PUT",
      url: saveUrl,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be11-document-source-01",
      },
      payload: {
        baseVersion: 5,
        saveSequence: 8,
        schemaVersion: 1,
        content: revisionSourceContent,
      },
    });
    expect(revisionRefSave.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: saveUrl,
          headers: {
            ...documentHeaders,
            "idempotency-key": "be11-document-source-bad-01",
          },
          payload: {
            baseVersion: 6,
            saveSequence: 9,
            schemaVersion: 1,
            content: {
              ...revisionSourceContent,
              content: [
                {
                  ...revisionSourceContent.content[0],
                  content: [
                    {
                      type: "sourceReference",
                      attrs: {
                        label: "범위 오류",
                        ref: {
                          ...revisionRef,
                          span: { start: 0, end: 100, encoding: "utf16" },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        })
      ).statusCode,
    ).toBe(422);

    // BE-16: immutable source snapshots, live status, and draft claim review.
    const excerptUrl = `/api/v1/workspaces/${operator.workspaceId}/external-excerpts`;
    const excerptFields = {
      title: "외부 관점",
      url: "https://example.org/research",
      author: "자료 작성자",
      publishedAt: "2026-01-02",
      excerpt: "외부 견해",
    };
    const excerptCreated = await app.inject({
      method: "POST",
      url: excerptUrl,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be16-excerpt-create-01",
      },
      payload: excerptFields,
    });
    expect(excerptCreated.statusCode, excerptCreated.body).toBe(201);
    const excerptId = excerptCreated.json<{ id: string }>().id;
    const excerptDetail = await app.inject({
      method: "GET",
      url: `${excerptUrl}/${excerptId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(excerptDetail.statusCode, excerptDetail.body).toBe(200);
    expect(excerptDetail.json()).toMatchObject({ publishedAt: "2026-01-02" });
    const inviteeExcerpt = await app.inject({
      method: "POST",
      url: excerptUrl.replace(operator.workspaceId, invitedWorkspaceId),
      headers: {
        host: "127.0.0.1:3000",
        origin,
        cookie: inviteeCookie,
        "idempotency-key": "be16-invitee-excerpt-01",
      },
      payload: excerptFields,
    });
    expect(inviteeExcerpt.statusCode, inviteeExcerpt.body).toBe(201);
    const foreignId = inviteeExcerpt.json<{ id: string }>().id;
    const packUrl = `${wikiBase}/evidence-packs`;
    const foreignPack = await app.inject({
      method: "POST",
      url: packUrl,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be16-cross-workspace-pack",
      },
      payload: {
        title: "타인 자료",
        sources: [{ kind: "external_excerpt", id: foreignId, revision: 1 }],
      },
    });
    expect(foreignPack.statusCode).toBe(422);
    expect(foreignPack.json()).toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    const workbenchCapture = await app.inject({
      method: "POST",
      url: captureUrl,
      headers: { ...captureHeaders, "idempotency-key": "be16-capture-01" },
      payload: { title: "경험 기록", rawBody: "내 경험" },
    });
    expect(workbenchCapture.statusCode, workbenchCapture.body).toBe(201);
    const workbenchCaptureId = workbenchCapture.json<{ id: string }>().id;
    const packCreated = await app.inject({
      method: "POST",
      url: packUrl,
      headers: { ...documentHeaders, "idempotency-key": "be16-pack-create-01" },
      payload: {
        title: "문서 근거",
        sources: [
          { kind: "external_excerpt", id: excerptId, revision: 1 },
          {
            kind: "external_excerpt",
            id: excerptId,
            revision: 1,
            span: { start: 0, end: 2, encoding: "utf16" },
          },
          { kind: "document_revision", id: wikiId, revision: 2 },
          {
            kind: "task_result",
            id: resultCreated.json<{ id: string }>().id,
            revision: 2,
          },
          {
            kind: "capture_revision",
            id: workbenchCaptureId,
            revision: 1,
            span: { start: 0, end: "내 경험".length, encoding: "utf16" },
          },
        ],
      },
    });
    expect(packCreated.statusCode, packCreated.body).toBe(201);
    const packId = packCreated.json<{ id: string }>().id;
    const packRevisionUrl = `${packUrl}/${packId}/revisions/1`;
    const packBefore = await app.inject({
      method: "GET",
      url: packRevisionUrl,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(packBefore.statusCode, packBefore.body).toBe(200);
    expect(packBefore.json()).toMatchObject({
      sourceStates: ["fresh", "fresh", "fresh", "fresh", "fresh"],
    });
    expect(
      packBefore.json<{ originFamilies: string[] }>().originFamilies,
    ).toHaveLength(4);
    expect(
      packBefore
        .json<{ originFamilies: string[] }>()
        .originFamilies.slice(0, 2),
    ).toEqual([`external_excerpt:${excerptId}`, `document:${wikiId}`]);
    const workbenchContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId },
          content: [
            { type: "text", text: "외부 견해" },
            {
              type: "sourceReference",
              attrs: {
                label: "근거",
                ref: {
                  sourceKind: "external_excerpt",
                  sourceId: excerptId,
                  sourceRevision: 1,
                  originKey: `external_excerpt:${excerptId}`,
                  sourceHash: excerptCreated.json<{ contentHash: string }>()
                    .contentHash,
                },
              },
            },
          ],
        },
      ],
    };
    const workbenchDraft = await app.inject({
      method: "PUT",
      url: saveUrl,
      headers: { ...documentHeaders, "idempotency-key": "be16-draft-01" },
      payload: {
        baseVersion: 6,
        saveSequence: 10,
        schemaVersion: 1,
        content: workbenchContent,
      },
    });
    expect(workbenchDraft.statusCode, workbenchDraft.body).toBe(200);
    const workbenchBlock = EditorEnvelopeSchema.parse({
      schemaVersion: 1,
      content: workbenchContent,
    }).content.content![0]!;
    const claimId = randomUUID();
    const workbenchUrl = `${wikiBase}/workbench`;
    const savedWorkbench = await app.inject({
      method: "PUT",
      url: workbenchUrl,
      headers: { ...documentHeaders, "idempotency-key": "be16-workbench-01" },
      payload: {
        baseVersion: 0,
        draftVersion: 7,
        packId,
        packRevision: 1,
        purpose: "guide",
        audience: "독자",
        outline: [
          {
            itemId: "preconditions",
            citations: [{ sourceIndex: 0, role: "external_claim" }],
            authorInterpretation: null,
          },
        ],
        conflicts: [],
        claims: [
          {
            blockId,
            claimId,
            textHash: createHash("sha256")
              .update("외부 견해근거")
              .digest("hex"),
            blockHash: createHash("sha256")
              .update(canonicalEditorBlock(workbenchBlock))
              .digest("hex"),
            transform: "quote",
            sourceIndices: [0],
            semanticReview: "unreviewed",
          },
        ],
      },
    });
    expect(savedWorkbench.statusCode, savedWorkbench.body).toBe(200);
    const invalidMapping = await app.inject({
      method: "PUT",
      url: workbenchUrl,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be16-invalid-claim-01",
      },
      payload: {
        baseVersion: 1,
        draftVersion: 7,
        packId,
        packRevision: 1,
        purpose: "guide",
        audience: "독자",
        outline: [],
        conflicts: [],
        claims: [
          {
            blockId,
            claimId: randomUUID(),
            textHash: createHash("sha256").update("다른 문장").digest("hex"),
            blockHash: createHash("sha256")
              .update(canonicalEditorBlock(workbenchBlock))
              .digest("hex"),
            transform: "quote",
            sourceIndices: [0],
            semanticReview: "unreviewed",
          },
        ],
      },
    });
    expect(invalidMapping.statusCode).toBe(422);
    expect(invalidMapping.json()).toMatchObject({
      code: "WORKBENCH_INVALID_MAPPING",
    });
    const workbenchBefore = await app.inject({
      method: "GET",
      url: workbenchUrl,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(workbenchBefore.statusCode, workbenchBefore.body).toBe(200);
    expect(workbenchBefore.json()).toMatchObject({
      claimStates: [{ claimId, state: "current" }],
      readiness: {
        status: "needs_material",
        missingItems: ["steps", "verification_scope"],
        independentOriginFamilies: [`external_excerpt:${excerptId}`],
      },
    });
    // BE-17: explicit opt-in, bounded worker result, and separate draft apply.
    const generationDocument = await app.inject({
      method: "POST",
      url: documentUrl,
      headers: { ...documentHeaders, "idempotency-key": "be17-document-01" },
      payload: { kind: "NOTE", title: "생성 검증" },
    });
    expect(generationDocument.statusCode, generationDocument.body).toBe(201);
    const generationDocumentId = generationDocument.json<{ id: string }>().id;
    const generationPack = await app.inject({
      method: "POST",
      url: `${documentUrl}/${generationDocumentId}/evidence-packs`,
      headers: { ...documentHeaders, "idempotency-key": "be17-pack-01" },
      payload: {
        title: "선택한 자료",
        sources: [{ kind: "external_excerpt", id: excerptId, revision: 1 }],
      },
    });
    expect(generationPack.statusCode, generationPack.body).toBe(201);
    const generationPackId = generationPack.json<{ id: string }>().id;
    const generationUrl = `${documentUrl}/${generationDocumentId}/generations`;
    const generationBody = {
      packId: generationPackId,
      packRevision: 1,
      draftVersion: 1,
      mode: "outline",
      sourceIndices: [0],
      targetBlockIds: [],
      consent: true,
      maxInputTokens: 16000,
      maxOutputTokens: 128,
      maxCostMicrousd: 1000,
    };
    const disabledGeneration = await app.inject({
      method: "POST",
      url: generationUrl,
      headers: { ...documentHeaders, "idempotency-key": "be17-disabled-01" },
      payload: generationBody,
    });
    expect(disabledGeneration.statusCode).toBe(503);
    const optIn = await app.inject({
      method: "PATCH",
      url: "/api/v1/me/preferences/model",
      headers: { ...documentHeaders, "idempotency-key": "be17-opt-in-01" },
      payload: { externalModelEnabled: true, baseVersion: 2 },
    });
    expect(optIn.statusCode, optIn.body).toBe(200);
    const queuedGeneration = await app.inject({
      method: "POST",
      url: generationUrl,
      headers: { ...documentHeaders, "idempotency-key": "be17-generation-01" },
      payload: generationBody,
    });
    expect(queuedGeneration.statusCode, queuedGeneration.body).toBe(202);
    const generationRequestId = queuedGeneration.json<{ requestId: string }>()
      .requestId;
    const generationRef = await withWorkspaceTransaction(
      appPool,
      operator.workspaceId,
      async (client) => {
        const result = await client.query<{ id: string }>(
          "SELECT id FROM business.command_outbox WHERE workspace_id=$1 AND event_type='generation.requested' AND payload_ref->>'requestId'=$2",
          [operator.workspaceId, generationRequestId],
        );
        return {
          workspaceId: operator.workspaceId,
          outboxId: result.rows[0]!.id,
        };
      },
    );
    const fakeProvider = {
      generate: async (input: { serialized: string; signal: AbortSignal }) => {
        expect(input.serialized).toContain("외부 견해");
        expect(input.signal.aborted).toBe(false);
        return {
          output: {
            items: [
              {
                kind: "paragraph" as const,
                targetBlockId: null,
                text: "검토할 제안",
                sourceIndices: [0],
              },
            ],
          },
          inputTokens: 100,
          outputTokens: 20,
        };
      },
    };
    const generationPolicy = {
      modelId: "fixture-model",
      inputPriceMicrousdPerMillion: 1000,
      outputPriceMicrousdPerMillion: 1000,
      maxJobCostMicrousd: 1000,
      timeoutMs: 1000,
    };
    expect(
      await processGenerationJob(
        appPool,
        generationRef,
        fakeProvider,
        generationPolicy,
      ),
    ).toBe("SUCCEEDED");
    const generated = await app.inject({
      method: "GET",
      url: `${generationUrl}/${generationRequestId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(generated.statusCode, generated.body).toBe(200);
    expect(generated.json()).toMatchObject({
      state: "SUCCEEDED",
      artifact: { proposals: [{ text: "검토할 제안", reviewRequired: true }] },
    });
    const foreignGeneration = await app.inject({
      method: "GET",
      url: `${generationUrl}/${generationRequestId}`.replace(
        operator.workspaceId,
        invitedWorkspaceId,
      ),
      headers: { host: "127.0.0.1:3000", cookie: inviteeCookie },
    });
    expect(foreignGeneration.statusCode).toBe(404);
    const generationProposalId = generated.json<{
      artifact: { proposals: { id: string }[] };
    }>().artifact.proposals[0]!.id;
    const applied = await app.inject({
      method: "POST",
      url: `${generationUrl}/${generationRequestId}/apply`,
      headers: { ...documentHeaders, "idempotency-key": "be17-apply-01" },
      payload: { baseDraftVersion: 1, proposalIds: [generationProposalId] },
    });
    expect(applied.statusCode, applied.body).toBe(200);
    expect(applied.json()).toMatchObject({
      draftVersion: 2,
      appliedProposalIds: [generationProposalId],
    });
    const generationAfter = await app.inject({
      method: "GET",
      url: `${documentUrl}/${generationDocumentId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(generationAfter.body).toContain("검토할 제안");
    const duplicateApply = await app.inject({
      method: "POST",
      url: `${generationUrl}/${generationRequestId}/apply`,
      headers: { ...documentHeaders, "idempotency-key": "be17-apply-02" },
      payload: { baseDraftVersion: 1, proposalIds: [generationProposalId] },
    });
    expect(duplicateApply.statusCode).toBe(409);
    const hallucinated = await app.inject({
      method: "POST",
      url: generationUrl,
      headers: { ...documentHeaders, "idempotency-key": "be17-generation-02" },
      payload: { ...generationBody, draftVersion: 2 },
    });
    expect(hallucinated.statusCode, hallucinated.body).toBe(202);
    const badId = hallucinated.json<{ requestId: string }>().requestId;
    const badRef = await withWorkspaceTransaction(
      appPool,
      operator.workspaceId,
      async (client) => {
        const result = await client.query<{ id: string }>(
          "SELECT id FROM business.command_outbox WHERE workspace_id=$1 AND event_type='generation.requested' AND payload_ref->>'requestId'=$2",
          [operator.workspaceId, badId],
        );
        return {
          workspaceId: operator.workspaceId,
          outboxId: result.rows[0]!.id,
        };
      },
    );
    expect(
      await processGenerationJob(
        appPool,
        badRef,
        {
          generate: async () => ({
            output: {
              items: [
                {
                  kind: "paragraph",
                  targetBlockId: null,
                  text: "거짓 출처",
                  sourceIndices: [99],
                },
              ],
            },
            inputTokens: 100,
            outputTokens: 20,
          }),
        },
        generationPolicy,
      ),
    ).toBe("FAILED");
    const rejected = await app.inject({
      method: "GET",
      url: `${generationUrl}/${badId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(rejected.json()).toMatchObject({
      state: "FAILED",
      errorCode: "INVALID_PROVIDER_OUTPUT",
      artifact: null,
    });
    const budgetDenied = await app.inject({
      method: "POST",
      url: generationUrl,
      headers: { ...documentHeaders, "idempotency-key": "be17-budget-01" },
      payload: { ...generationBody, draftVersion: 2, maxInputTokens: 256 },
    });
    expect(budgetDenied.statusCode).toBe(422);
    expect(budgetDenied.json()).toMatchObject({
      code: "GENERATION_BUDGET_EXCEEDED",
    });
    const staleQueued = await app.inject({
      method: "POST",
      url: generationUrl,
      headers: { ...documentHeaders, "idempotency-key": "be17-stale-01" },
      payload: { ...generationBody, draftVersion: 2 },
    });
    expect(staleQueued.statusCode, staleQueued.body).toBe(202);
    const staleId = staleQueued.json<{ requestId: string }>().requestId;
    const currentGenerationDocument = generationAfter.json<{
      content: {
        schemaVersion: 1;
        content: { type: "doc"; content: unknown[] };
      };
    }>();
    const changedDraft = await app.inject({
      method: "PUT",
      url: `${documentUrl}/${generationDocumentId}/draft`,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be17-draft-change-01",
      },
      payload: {
        baseVersion: 2,
        saveSequence: 1,
        ...currentGenerationDocument.content,
      },
    });
    expect(changedDraft.statusCode, changedDraft.body).toBe(200);
    const staleRef = await withWorkspaceTransaction(
      appPool,
      operator.workspaceId,
      async (client) => {
        const found = await client.query<{ id: string }>(
          "SELECT id FROM business.command_outbox WHERE workspace_id=$1 AND event_type='generation.requested' AND payload_ref->>'requestId'=$2",
          [operator.workspaceId, staleId],
        );
        return {
          workspaceId: operator.workspaceId,
          outboxId: found.rows[0]!.id,
        };
      },
    );
    let staleProviderCalls = 0;
    expect(
      await processGenerationJob(
        appPool,
        staleRef,
        {
          generate: async () => {
            staleProviderCalls++;
            return { output: { items: [] }, inputTokens: 0, outputTokens: 0 };
          },
        },
        generationPolicy,
      ),
    ).toBe("STALE");
    expect(staleProviderCalls).toBe(0);
    const canceledQueued = await app.inject({
      method: "POST",
      url: generationUrl,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be17-cancel-request-01",
      },
      payload: { ...generationBody, draftVersion: 3 },
    });
    expect(canceledQueued.statusCode, canceledQueued.body).toBe(202);
    const canceledId = canceledQueued.json<{ requestId: string }>().requestId;
    const canceled = await app.inject({
      method: "POST",
      url: `${generationUrl}/${canceledId}/cancel`,
      headers: { ...documentHeaders, "idempotency-key": "be17-cancel-01" },
    });
    expect(canceled.statusCode, canceled.body).toBe(200);
    expect(canceled.json()).toMatchObject({ state: "CANCELED" });
    const duringQueued = await app.inject({
      method: "POST",
      url: generationUrl,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be17-during-request-01",
      },
      payload: { ...generationBody, draftVersion: 3 },
    });
    expect(duringQueued.statusCode, duringQueued.body).toBe(202);
    const duringId = duringQueued.json<{ requestId: string }>().requestId;
    const duringRef = await withWorkspaceTransaction(
      appPool,
      operator.workspaceId,
      async (client) => {
        const found = await client.query<{ id: string }>(
          "SELECT id FROM business.command_outbox WHERE workspace_id=$1 AND event_type='generation.requested' AND payload_ref->>'requestId'=$2",
          [operator.workspaceId, duringId],
        );
        return {
          workspaceId: operator.workspaceId,
          outboxId: found.rows[0]!.id,
        };
      },
    );
    expect(
      await processGenerationJob(
        appPool,
        duringRef,
        {
          generate: async () => {
            const cancelDuring = await app.inject({
              method: "POST",
              url: `${generationUrl}/${duringId}/cancel`,
              headers: {
                ...documentHeaders,
                "idempotency-key": "be17-cancel-during-01",
              },
            });
            expect(cancelDuring.statusCode, cancelDuring.body).toBe(200);
            return {
              output: {
                items: [
                  {
                    kind: "paragraph",
                    targetBlockId: null,
                    text: "버릴 결과",
                    sourceIndices: [0],
                  },
                ],
              },
              inputTokens: 100,
              outputTokens: 20,
            };
          },
        },
        generationPolicy,
      ),
    ).toBe("CANCELED");
    const canceledDuring = await app.inject({
      method: "GET",
      url: `${generationUrl}/${duringId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(canceledDuring.json()).toMatchObject({
      state: "CANCELED",
      artifact: null,
    });
    const draftDuringQueued = await app.inject({
      method: "POST",
      url: generationUrl,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be17-draft-during-request-01",
      },
      payload: { ...generationBody, draftVersion: 3 },
    });
    expect(draftDuringQueued.statusCode, draftDuringQueued.body).toBe(202);
    const draftDuringId = draftDuringQueued.json<{ requestId: string }>()
      .requestId;
    const draftDuringRef = await withWorkspaceTransaction(
      appPool,
      operator.workspaceId,
      async (client) => {
        const found = await client.query<{ id: string }>(
          "SELECT id FROM business.command_outbox WHERE workspace_id=$1 AND event_type='generation.requested' AND payload_ref->>'requestId'=$2",
          [operator.workspaceId, draftDuringId],
        );
        return {
          workspaceId: operator.workspaceId,
          outboxId: found.rows[0]!.id,
        };
      },
    );
    expect(
      await processGenerationJob(
        appPool,
        draftDuringRef,
        {
          generate: async () => {
            const saveDuring = await app.inject({
              method: "PUT",
              url: `${documentUrl}/${generationDocumentId}/draft`,
              headers: {
                ...documentHeaders,
                "idempotency-key": "be17-draft-during-01",
              },
              payload: {
                baseVersion: 3,
                saveSequence: 2,
                ...currentGenerationDocument.content,
              },
            });
            expect(saveDuring.statusCode, saveDuring.body).toBe(200);
            return {
              output: {
                items: [
                  {
                    kind: "paragraph",
                    targetBlockId: null,
                    text: "오래된 초안 결과",
                    sourceIndices: [0],
                  },
                ],
              },
              inputTokens: 100,
              outputTokens: 20,
            };
          },
        },
        generationPolicy,
      ),
    ).toBe("STALE");
    const staleDuring = await app.inject({
      method: "GET",
      url: `${generationUrl}/${draftDuringId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(staleDuring.json()).toMatchObject({
      state: "STALE",
      errorCode: "DRAFT_CHANGED",
      artifact: null,
    });
    const abandonedQueued = await app.inject({
      method: "POST",
      url: generationUrl,
      headers: { ...documentHeaders, "idempotency-key": "be17-abandoned-01" },
      payload: { ...generationBody, draftVersion: 4 },
    });
    expect(abandonedQueued.statusCode, abandonedQueued.body).toBe(202);
    const abandonedId = abandonedQueued.json<{ requestId: string }>().requestId;
    await withWorkspaceTransaction(appPool, operator.workspaceId, (client) =>
      client.query(
        "UPDATE business.generation_request SET state='RUNNING',updated_at=now()-interval '6 minutes' WHERE workspace_id=$1 AND id=$2",
        [operator.workspaceId, abandonedId],
      ),
    );
    await reconcileAbandonedGeneration(appPool);
    const abandoned = await app.inject({
      method: "GET",
      url: `${generationUrl}/${abandonedId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(abandoned.json()).toMatchObject({
      state: "FAILED",
      errorCode: "WORKER_INTERRUPTED",
      artifact: null,
    });
    const revokeQueued = await app.inject({
      method: "POST",
      url: generationUrl,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be17-revoke-request-01",
      },
      payload: { ...generationBody, draftVersion: 4 },
    });
    expect(revokeQueued.statusCode, revokeQueued.body).toBe(202);
    const revokeId = revokeQueued.json<{ requestId: string }>().requestId;
    const revokeRef = await withWorkspaceTransaction(
      appPool,
      operator.workspaceId,
      async (client) => {
        const found = await client.query<{ id: string }>(
          "SELECT id FROM business.command_outbox WHERE workspace_id=$1 AND event_type='generation.requested' AND payload_ref->>'requestId'=$2",
          [operator.workspaceId, revokeId],
        );
        return {
          workspaceId: operator.workspaceId,
          outboxId: found.rows[0]!.id,
        };
      },
    );
    expect(
      await processGenerationJob(
        appPool,
        revokeRef,
        {
          generate: async () => {
            const optOut = await app.inject({
              method: "PATCH",
              url: "/api/v1/me/preferences/model",
              headers: {
                ...documentHeaders,
                "idempotency-key": "be17-opt-out-01",
              },
              payload: { externalModelEnabled: false, baseVersion: 3 },
            });
            expect(optOut.statusCode, optOut.body).toBe(200);
            return {
              output: {
                items: [
                  {
                    kind: "paragraph",
                    targetBlockId: null,
                    text: "동의 철회 후 결과",
                    sourceIndices: [0],
                  },
                ],
              },
              inputTokens: 100,
              outputTokens: 20,
            };
          },
        },
        generationPolicy,
      ),
    ).toBe("CANCELED");
    const revoked = await app.inject({
      method: "GET",
      url: `${generationUrl}/${revokeId}`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(revoked.json()).toMatchObject({ state: "CANCELED", artifact: null });
    const excerptRevised = await app.inject({
      method: "PUT",
      url: `${excerptUrl}/${excerptId}`,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be16-excerpt-revise-01",
      },
      payload: {
        ...excerptFields,
        excerpt: "수정한 외부 견해",
        baseVersion: 1,
      },
    });
    expect(excerptRevised.statusCode, excerptRevised.body).toBe(200);
    const stalePack = await app.inject({
      method: "GET",
      url: packRevisionUrl,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(stalePack.json()).toMatchObject({
      sourceStates: ["stale", "stale", "fresh", "fresh", "fresh"],
    });
    expect(
      stalePack.json<{ sources: { text: string }[] }>().sources[0]!.text,
    ).toBe("외부 견해");
    const packRevised = await app.inject({
      method: "POST",
      url: `${packUrl}/${packId}/revisions`,
      headers: { ...documentHeaders, "idempotency-key": "be16-pack-revise-01" },
      payload: {
        baseRevision: 1,
        title: "갱신한 근거",
        sources: [
          { kind: "external_excerpt", id: excerptId, revision: 2 },
          { kind: "document_revision", id: wikiId, revision: 2 },
        ],
      },
    });
    expect(packRevised.statusCode, packRevised.body).toBe(201);
    const latestPack = await app.inject({
      method: "GET",
      url: `${packUrl}/${packId}/revisions/2`,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(latestPack.json()).toMatchObject({
      sourceStates: ["fresh", "fresh"],
    });
    expect(
      latestPack.json<{
        sources: { text: string; publishedAt: string | null }[];
      }>().sources[0],
    ).toMatchObject({ text: "수정한 외부 견해", publishedAt: "2026-01-02" });
    const historicalPack = await app.inject({
      method: "GET",
      url: packRevisionUrl,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(historicalPack.json()).toMatchObject({
      currentRevision: 2,
    });
    expect(
      historicalPack.json<{ sources: { text: string }[] }>().sources[0]!.text,
    ).toBe("외부 견해");
    const staleWorkbench = await app.inject({
      method: "GET",
      url: workbenchUrl,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(staleWorkbench.json()).toMatchObject({
      claimStates: [{ claimId, state: "source_stale" }],
    });
    const newDraft = await app.inject({
      method: "PUT",
      url: saveUrl,
      headers: { ...documentHeaders, "idempotency-key": "be16-draft-02" },
      payload: {
        baseVersion: 7,
        saveSequence: 11,
        schemaVersion: 1,
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { blockId },
              content: [
                { type: "text", text: "외부 견해" },
                {
                  type: "sourceReference",
                  attrs: {
                    label: "근거",
                    ref: {
                      sourceKind: "document_revision",
                      sourceId: wikiId,
                      sourceRevision: 2,
                      originKey: `document:${wikiId}`,
                      sourceHash: restored.json<{ contentHash: string }>()
                        .contentHash,
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    });
    expect(newDraft.statusCode, newDraft.body).toBe(200);
    const remap = await app.inject({
      method: "GET",
      url: workbenchUrl,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(remap.json()).toMatchObject({
      currentDraftVersion: 8,
      claimStates: [{ claimId, state: "needs_remap" }],
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: workbenchUrl.replace(operator.workspaceId, invitedWorkspaceId),
          headers: { host: "127.0.0.1:3000", cookie: inviteeCookie },
        })
      ).statusCode,
    ).toBe(404);
    const excerptDeleted = await app.inject({
      method: "DELETE",
      url: `${excerptUrl}/${excerptId}`,
      headers: {
        ...documentHeaders,
        "idempotency-key": "be16-excerpt-delete-01",
      },
      payload: { baseVersion: 2 },
    });
    expect(excerptDeleted.statusCode, excerptDeleted.body).toBe(200);
    const unresolvedPack = await app.inject({
      method: "GET",
      url: packRevisionUrl,
      headers: { host: "127.0.0.1:3000", cookie: operatorCookie },
    });
    expect(unresolvedPack.json()).toMatchObject({
      sourceStates: ["unresolved", "unresolved", "fresh", "fresh", "fresh"],
    });
    await expect(
      identity.withPersonalWorkspace(operator.userId, (client) =>
        client.query(
          `UPDATE business.evidence_pack_revision SET manifest='{}'::jsonb WHERE workspace_id=$1 AND pack_id=$2`,
          [operator.workspaceId, packId],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });

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

    const transferBase = `/api/v1/workspaces/${operator.workspaceId}/data-transfer`;
    const transferHeaders = {
      host: "127.0.0.1:3000",
      origin,
      cookie: operatorCookie,
    };
    const personalExport = await app.inject({
      method: "POST",
      url: `${transferBase}/exports`,
      headers: transferHeaders,
    });
    expect(personalExport.statusCode, personalExport.body).toBe(201);
    const exportId = personalExport.json<{ id: string }>().id;
    await admin.query(
      "UPDATE auth.session SET created_at=now()-interval '6 minutes' WHERE user_id=$1",
      [operator.userId],
    );
    const transferReauth = await app.inject({
      method: "POST",
      url: `${transferBase}/exports`,
      headers: transferHeaders,
    });
    expect(transferReauth.statusCode).toBe(403);
    await admin.query(
      "UPDATE auth.session SET created_at=now() WHERE user_id=$1",
      [operator.userId],
    );
    const downloaded = await app.inject({
      method: "GET",
      url: `${transferBase}/exports/${exportId}/download`,
      headers: transferHeaders,
    });
    expect(downloaded.statusCode, downloaded.body).toBe(200);
    expect(downloaded.headers["cache-control"]).toBe("private, no-store");
    await admin.query(
      "UPDATE business.user_access SET state='SUSPENDED',authz_version=authz_version+1 WHERE user_id=$1",
      [operator.userId],
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: `${transferBase}/exports/${exportId}/download`,
          headers: transferHeaders,
        })
      ).statusCode,
    ).toBe(403);
    await admin.query(
      "UPDATE business.user_access SET state='ACTIVE',authz_version=authz_version+1 WHERE user_id=$1",
      [operator.userId],
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: `${transferBase.replace(operator.workspaceId, invitedWorkspaceId)}/exports/${exportId}/download`,
          headers: transferHeaders,
        })
      ).statusCode,
    ).toBe(404);
    const bundle = downloaded.rawPayload;
    expect(bundle.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]))).toBe(true);
    const staged = await app.inject({
      method: "POST",
      url: `${transferBase}/imports`,
      headers: {
        ...transferHeaders,
        "content-type": "application/vnd.ieum.bundle+gzip",
      },
      payload: bundle,
    });
    expect(staged.statusCode, staged.body).toBe(201);
    const importId = staged.json<{ id: string }>().id;
    const dryRun = await app.inject({
      method: "GET",
      url: `${transferBase}/imports/${importId}/preview`,
      headers: transferHeaders,
    });
    expect(dryRun.statusCode, dryRun.body).toBe(200);
    const transferPreview = dryRun.json<{
      previewHash: string;
      rows: { recordKind: string; state: string }[];
    }>();
    expect(transferPreview.rows.length).toBeGreaterThan(0);
    expect(
      transferPreview.rows
        .filter((row) => row.recordKind === "capture")
        .every((row) => row.state === "DUPLICATE"),
    ).toBe(true);
    expect(
      transferPreview.rows
        .filter((row) => row.recordKind === "event")
        .every((row) => row.state === "NEW"),
    ).toBe(true);
    expect(
      transferPreview.rows
        .filter((row) => row.recordKind === "context")
        .every((row) => row.state === "NEW"),
    ).toBe(true);
    const initialTaskStates = transferPreview.rows
      .filter((row) => row.recordKind === "task")
      .map((row) => row.state);
    expect(initialTaskStates).toContain("NEW");
    expect(initialTaskStates).toContain("MISSING_REFERENCE");
    const changedPreview = await app.inject({
      method: "POST",
      url: `${transferBase}/imports/${importId}/apply`,
      headers: transferHeaders,
      payload: { previewHash: "0".repeat(64) },
    });
    expect(changedPreview.statusCode).toBe(409);
    const transferApplied = await app.inject({
      method: "POST",
      url: `${transferBase}/imports/${importId}/apply`,
      headers: transferHeaders,
      payload: { previewHash: transferPreview.previewHash },
    });
    expect(transferApplied.statusCode, transferApplied.body).toBe(201);
    expect(transferApplied.json()).toMatchObject({ state: "PARTIAL" });
    const missingTransferReferences = await admin.query(
      "SELECT record_kind,reason_code FROM business.transfer_row WHERE run_id=$1 AND state='FAILED' ORDER BY record_kind",
      [importId],
    );
    expect(missingTransferReferences.rows).toEqual([
      { record_kind: "task", reason_code: "MISSING_REFERENCE" },
      { record_kind: "task_result", reason_code: "CONTENT_CONFLICT" },
    ]);
    const linkedImportedTasks = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM business.transfer_row tr
       JOIN business.task t ON t.workspace_id=tr.workspace_id AND t.id=tr.target_id
       JOIN business.transfer_row cr ON cr.workspace_id=tr.workspace_id AND cr.run_id=tr.run_id
         AND cr.record_kind='context' AND cr.target_id=t.context_id AND cr.state='IMPORTED'
       WHERE tr.workspace_id=$1 AND tr.run_id=$2 AND tr.record_kind='task' AND tr.state='IMPORTED'`,
      [operator.workspaceId, importId],
    );
    expect(Number(linkedImportedTasks.rows[0]?.count)).toBeGreaterThan(0);
    const repeated = await app.inject({
      method: "POST",
      url: `${transferBase}/imports`,
      headers: {
        ...transferHeaders,
        "content-type": "application/vnd.ieum.bundle+gzip",
      },
      payload: bundle,
    });
    expect(repeated.statusCode, repeated.body).toBe(201);
    expect(repeated.json<{ id: string }>().id).toBe(importId);
    const repeatedPreview = await app.inject({
      method: "GET",
      url: `${transferBase}/imports/${repeated.json<{ id: string }>().id}/preview`,
      headers: transferHeaders,
    });
    expect(repeatedPreview.statusCode, repeatedPreview.body).toBe(200);
    expect(
      repeatedPreview
        .json<{ rows: { recordKind: string; state: string }[] }>()
        .rows.every(
          (row) =>
            row.state === "FAILED" ||
            row.state === "IMPORTED" ||
            row.state === "SKIPPED",
        ),
    ).toBe(true);
    const reexport = await app.inject({
      method: "POST",
      url: `${transferBase}/exports`,
      headers: transferHeaders,
    });
    expect(reexport.statusCode, reexport.body).toBe(201);
    const reexportBytes = await app.inject({
      method: "GET",
      url: `${transferBase}/exports/${reexport.json<{ id: string }>().id}/download`,
      headers: transferHeaders,
    });
    expect(readCaptureBundle(reexportBytes.rawPayload).manifest.version).toBe(
      6,
    );
    const restaged = await app.inject({
      method: "POST",
      url: `${transferBase}/imports`,
      headers: {
        ...transferHeaders,
        "content-type": "application/vnd.ieum.bundle+gzip",
      },
      payload: reexportBytes.rawPayload,
    });
    expect(restaged.statusCode, restaged.body).toBe(201);
    const transitivePreview = await app.inject({
      method: "GET",
      url: `${transferBase}/imports/${restaged.json<{ id: string }>().id}/preview`,
      headers: transferHeaders,
    });
    const transitiveRows = transitivePreview.json<{
      rows: { recordKind: string; state: string }[];
    }>().rows;
    expect(
      transitiveRows.every(
        (row) =>
          row.state === "MISSING_REFERENCE" ||
          row.state === "DUPLICATE" ||
          row.state === "CONFLICT",
      ),
    ).toBe(true);
    expect(
      transitiveRows.some(
        (row) => row.recordKind === "task_result" && row.state === "CONFLICT",
      ),
    ).toBe(true);
    const transitiveApplied = await app.inject({
      method: "POST",
      url: `${transferBase}/imports/${restaged.json<{ id: string }>().id}/apply`,
      headers: transferHeaders,
      payload: {
        previewHash: transitivePreview.json<{ previewHash: string }>()
          .previewHash,
      },
    });
    expect(transitiveApplied.statusCode, transitiveApplied.body).toBe(201);
    expect(transitiveApplied.json<{ state: string }>().state).toBe("PARTIAL");
    const repeatedResults = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM business.transfer_row
       WHERE run_id=$1 AND record_kind='task_result' AND state='FAILED'`,
      [restaged.json<{ id: string }>().id],
    );
    expect(Number(repeatedResults.rows[0]?.count)).toBeGreaterThan(0);
    const portableSource = randomUUID();
    const portableTaskId = randomUUID();
    const portableEventId = randomUUID();
    const portable = createPersonalBundle(
      portableSource,
      [],
      [
        {
          id: portableTaskId,
          originWorkspaceId: portableSource,
          originId: portableTaskId,
          title: "이식 완료 할일",
          description: "완료 상태 유지",
          state: "DONE",
          version: 2,
          dueKind: "DATE",
          dueDate: "2026-10-01",
          dueAt: null,
          dueTimeZone: null,
          contextId: null,
          originUnitId: null,
          originUnitRevision: null,
          completedAt: "2026-09-25T00:00:00.000Z",
          completionVersion: 2,
        },
      ],
      [
        {
          id: portableEventId,
          originWorkspaceId: portableSource,
          originId: portableEventId,
          title: "이식 종일 일정",
          description: "종일",
          state: "CONFIRMED",
          version: 1,
          scheduleKind: "ALL_DAY",
          timeZone: "Asia/Seoul",
          startAt: null,
          endAt: null,
          startLocal: null,
          endLocal: null,
          startOffsetMinutes: null,
          endOffsetMinutes: null,
          startDate: "2026-10-02",
          endDateExclusive: "2026-10-03",
        },
      ],
    );
    const portableStage = await app.inject({
      method: "POST",
      url: `${transferBase}/imports`,
      headers: {
        ...transferHeaders,
        "content-type": "application/vnd.ieum.bundle+gzip",
      },
      payload: portable,
    });
    expect(portableStage.statusCode, portableStage.body).toBe(201);
    const portableRunId = portableStage.json<{ id: string; scope: string }>()
      .id;
    expect(portableStage.json<{ scope: string }>().scope).toBe(
      "CAPTURES_TASKS_EVENTS",
    );
    const portablePreview = await app.inject({
      method: "GET",
      url: `${transferBase}/imports/${portableRunId}/preview`,
      headers: transferHeaders,
    });
    expect(portablePreview.statusCode, portablePreview.body).toBe(200);
    expect(
      portablePreview
        .json<{ rows: { state: string }[] }>()
        .rows.map((row) => row.state),
    ).toEqual(["NEW", "NEW"]);
    const portableApplied = await app.inject({
      method: "POST",
      url: `${transferBase}/imports/${portableRunId}/apply`,
      headers: transferHeaders,
      payload: {
        previewHash: portablePreview.json<{ previewHash: string }>()
          .previewHash,
      },
    });
    expect(portableApplied.statusCode, portableApplied.body).toBe(201);
    expect(portableApplied.json()).toMatchObject({
      state: "APPLIED",
      counts: { IMPORTED: 2 },
    });
    const transferredTask = await admin.query(
      `SELECT o.target_id,t.state,t.due_date,t.completed_at FROM business.transfer_origin o
       JOIN business.task t ON t.id=o.target_id WHERE o.workspace_id=$1 AND o.record_kind='task' AND o.source_id=$2`,
      [operator.workspaceId, portableTaskId],
    );
    expect(transferredTask.rows[0]?.state).toBe("DONE");
    expect(transferredTask.rows[0]?.completed_at).not.toBeNull();
    const transferredEvent = await admin.query(
      `SELECT e.schedule_kind,e.start_date,e.end_date_exclusive FROM business.transfer_origin o
       JOIN business.calendar_event e ON e.id=o.target_id WHERE o.workspace_id=$1 AND o.record_kind='event' AND o.source_id=$2`,
      [operator.workspaceId, portableEventId],
    );
    expect(transferredEvent.rows[0]?.schedule_kind).toBe("ALL_DAY");
    const portableRestaged = await app.inject({
      method: "POST",
      url: `${transferBase}/imports`,
      headers: {
        ...transferHeaders,
        "content-type": "application/vnd.ieum.bundle+gzip",
      },
      payload: portable,
    });
    expect(portableRestaged.json<{ id: string }>().id).toBe(portableRunId);
    const linkedSource = randomUUID();
    const linkedContextId = randomUUID();
    const linkedTaskId = randomUUID();
    const linkedArchive = createContextBundle(
      linkedSource,
      [],
      [
        {
          id: linkedTaskId,
          originWorkspaceId: linkedSource,
          originId: linkedTaskId,
          title: "연결 이식 할일",
          description: "",
          state: "TODO",
          version: 1,
          dueKind: "NONE",
          dueDate: null,
          dueAt: null,
          dueTimeZone: null,
          contextId: linkedContextId,
          originUnitId: null,
          originUnitRevision: null,
          completedAt: null,
          completionVersion: null,
        },
      ],
      [],
      [
        {
          id: linkedContextId,
          originWorkspaceId: linkedSource,
          originId: linkedContextId,
          name: "연결 이식 맥락",
          purpose: "검증",
          scope: "개인",
          kind: "PROJECT",
          state: "ACTIVE",
          supersededById: null,
          identityRevision: 3,
          membershipRevision: 1,
        },
      ],
    );
    const linkedStage = await app.inject({
      method: "POST",
      url: `${transferBase}/imports`,
      headers: {
        ...transferHeaders,
        "content-type": "application/vnd.ieum.bundle+gzip",
      },
      payload: linkedArchive,
    });
    expect(linkedStage.statusCode, linkedStage.body).toBe(201);
    const linkedRunId = linkedStage.json<{ id: string }>().id;
    const linkedPreview = await app.inject({
      method: "GET",
      url: `${transferBase}/imports/${linkedRunId}/preview`,
      headers: transferHeaders,
    });
    expect(
      linkedPreview
        .json<{ rows: { state: string }[] }>()
        .rows.map((row) => row.state),
    ).toEqual(["NEW", "NEW"]);
    const linkedApplied = await app.inject({
      method: "POST",
      url: `${transferBase}/imports/${linkedRunId}/apply`,
      headers: transferHeaders,
      payload: {
        previewHash: linkedPreview.json<{ previewHash: string }>().previewHash,
      },
    });
    expect(linkedApplied.statusCode, linkedApplied.body).toBe(201);
    expect(linkedApplied.json()).toMatchObject({
      state: "APPLIED",
      counts: { IMPORTED: 2 },
    });
    const linkedTargets = await admin.query(
      `SELECT c.id AS context_id,t.context_id AS task_context_id,o.source_revision
       FROM business.transfer_origin o JOIN business.context c ON c.id=o.target_id
       JOIN business.task t ON t.workspace_id=c.workspace_id AND t.context_id=c.id
       WHERE o.workspace_id=$1 AND o.record_kind='context' AND o.source_id=$2`,
      [operator.workspaceId, linkedContextId],
    );
    expect(linkedTargets.rows[0]?.task_context_id).toBe(
      linkedTargets.rows[0]?.context_id,
    );
    expect(linkedTargets.rows[0]?.source_revision).toBe(3);
    const linkedReexport = await app.inject({
      method: "POST",
      url: `${transferBase}/exports`,
      headers: transferHeaders,
    });
    expect(linkedReexport.statusCode, linkedReexport.body).toBe(201);
    const linkedDownload = await app.inject({
      method: "GET",
      url: `${transferBase}/exports/${linkedReexport.json<{ id: string }>().id}/download`,
      headers: transferHeaders,
    });
    const linkedManifest = readCaptureBundle(
      linkedDownload.rawPayload,
    ).manifest;
    expect(linkedManifest.version).toBe(6);
    if (linkedManifest.version !== 6) throw new Error("expected v6");
    expect(
      linkedManifest.contexts.find(
        (context) => context.id === linkedTargets.rows[0]?.context_id,
      )?.identityRevision,
    ).toBe(3);
    const historySource = randomUUID();
    const historyTaskId = randomUUID();
    const historyBundle = createTaskHistoryBundle(
      historySource,
      [],
      [
        {
          id: historyTaskId,
          originWorkspaceId: historySource,
          originId: historyTaskId,
          title: "전이 기록 이식",
          description: "",
          state: "DONE",
          version: 4,
          dueKind: "NONE",
          dueDate: null,
          dueAt: null,
          dueTimeZone: null,
          contextId: null,
          originUnitId: null,
          originUnitRevision: null,
          completedAt: "2026-09-25T00:00:00.000Z",
          completionVersion: 4,
        },
      ],
      [],
      [],
      [
        {
          taskId: historyTaskId,
          version: 2,
          fromState: "TODO",
          toState: "IN_PROGRESS",
          recordedAt: "2026-09-24T00:00:00.000Z",
        },
        {
          taskId: historyTaskId,
          version: 4,
          fromState: "IN_PROGRESS",
          toState: "DONE",
          recordedAt: "2026-09-25T00:00:00.000Z",
        },
      ],
    );
    const historyStage = await app.inject({
      method: "POST",
      url: `${transferBase}/imports`,
      headers: {
        ...transferHeaders,
        "content-type": "application/vnd.ieum.bundle+gzip",
      },
      payload: historyBundle,
    });
    expect(historyStage.statusCode, historyStage.body).toBe(201);
    expect(historyStage.json<{ scope: string }>().scope).toBe(
      "CAPTURES_TASKS_EVENTS_CONTEXTS_TASK_HISTORY",
    );
    const historyRunId = historyStage.json<{ id: string }>().id;
    const historyPreview = await app.inject({
      method: "GET",
      url: `${transferBase}/imports/${historyRunId}/preview`,
      headers: transferHeaders,
    });
    expect(historyPreview.statusCode, historyPreview.body).toBe(200);
    const historyApplied = await app.inject({
      method: "POST",
      url: `${transferBase}/imports/${historyRunId}/apply`,
      headers: transferHeaders,
      payload: {
        previewHash: historyPreview.json<{ previewHash: string }>().previewHash,
      },
    });
    expect(historyApplied.statusCode, historyApplied.body).toBe(201);
    expect(historyApplied.json<{ state: string }>().state).toBe("APPLIED");
    const importedHistory = await admin.query<{
      version: number;
      from_state: string;
      to_state: string;
    }>(
      `SELECT tt.version,tt.from_state,tt.to_state
       FROM business.transfer_origin o JOIN business.task_transition tt
         ON tt.workspace_id=o.workspace_id AND tt.task_id=o.target_id
       WHERE o.workspace_id=$1 AND o.record_kind='task' AND o.source_id=$2
       ORDER BY tt.version`,
      [operator.workspaceId, historyTaskId],
    );
    expect(importedHistory.rows).toMatchObject([
      { version: 2, from_state: "TODO", to_state: "IN_PROGRESS" },
      { version: 4, from_state: "IN_PROGRESS", to_state: "DONE" },
    ]);
    const historyManifest = readCaptureBundle(historyBundle).manifest;
    if (historyManifest.version !== 4) throw new Error("expected v4");
    const replayHistoryId = randomUUID();
    const replayHistory = createTaskHistoryBundle(
      historySource,
      [],
      [{ ...historyManifest.tasks[0]!, id: replayHistoryId }],
      [],
      [],
      historyManifest.taskTransitions.map((transition) => ({
        ...transition,
        taskId: replayHistoryId,
      })),
    );
    const replayStage = await app.inject({
      method: "POST",
      url: `${transferBase}/imports`,
      headers: {
        ...transferHeaders,
        "content-type": "application/vnd.ieum.bundle+gzip",
      },
      payload: replayHistory,
    });
    expect(replayStage.statusCode, replayStage.body).toBe(201);
    const replayPreview = await app.inject({
      method: "GET",
      url: `${transferBase}/imports/${replayStage.json<{ id: string }>().id}/preview`,
      headers: transferHeaders,
    });
    expect(
      replayPreview
        .json<{ rows: { state: string }[] }>()
        .rows.map((row) => row.state),
    ).toEqual(["DUPLICATE"]);
    const resultSource = randomUUID();
    const resultTaskId = randomUUID();
    const portableResultCaptureId = randomUUID();
    const resultId = randomUUID();
    const resultBundle = createTaskResultBundle(
      resultSource,
      [
        {
          id: portableResultCaptureId,
          revision: 1,
          title: "완료 결과 원문",
          rawBody: "완료 결과 본문",
        },
      ],
      [
        {
          id: resultTaskId,
          originWorkspaceId: resultSource,
          originId: resultTaskId,
          title: "결과가 있는 할일",
          description: "",
          state: "DONE",
          version: 2,
          dueKind: "NONE",
          dueDate: null,
          dueAt: null,
          dueTimeZone: null,
          contextId: null,
          originUnitId: null,
          originUnitRevision: null,
          completedAt: "2026-09-25T00:00:00.000Z",
          completionVersion: 2,
        },
      ],
      [],
      [],
      [
        {
          taskId: resultTaskId.toUpperCase(),
          version: 2,
          fromState: "TODO",
          toState: "DONE",
          recordedAt: "2026-09-25T00:00:00.000Z",
        },
      ],
      [
        {
          id: resultId,
          originWorkspaceId: resultSource,
          originId: resultId,
          taskId: resultTaskId.toUpperCase(),
          captureId: portableResultCaptureId.toUpperCase(),
          completionVersion: 2,
          recordedAt: "2026-09-25T00:01:00.000Z",
        },
      ],
    );
    const resultStage = await app.inject({
      method: "POST",
      url: `${transferBase}/imports`,
      headers: {
        ...transferHeaders,
        "content-type": "application/vnd.ieum.bundle+gzip",
      },
      payload: resultBundle,
    });
    expect(resultStage.statusCode, resultStage.body).toBe(201);
    expect(resultStage.json<{ scope: string }>().scope).toBe(
      "CAPTURES_TASKS_EVENTS_CONTEXTS_TASK_HISTORY_RESULTS",
    );
    const resultRunId = resultStage.json<{ id: string }>().id;
    const resultPreview = await app.inject({
      method: "GET",
      url: `${transferBase}/imports/${resultRunId}/preview`,
      headers: transferHeaders,
    });
    expect(resultPreview.statusCode, resultPreview.body).toBe(200);
    expect(
      resultPreview
        .json<{ rows: { state: string }[] }>()
        .rows.map((row) => row.state),
    ).toEqual(["NEW", "NEW", "NEW"]);
    const resultApplied = await app.inject({
      method: "POST",
      url: `${transferBase}/imports/${resultRunId}/apply`,
      headers: transferHeaders,
      payload: {
        previewHash: resultPreview.json<{ previewHash: string }>().previewHash,
      },
    });
    expect(resultApplied.statusCode, resultApplied.body).toBe(201);
    expect(resultApplied.json<{ state: string }>().state).toBe("APPLIED");
    const resultTargets = await admin.query<{
      task_id: string;
      capture_id: string;
      mapped_task_id: string;
      mapped_capture_id: string;
    }>(
      `SELECT tr.task_id,tr.capture_id,ot.target_id AS mapped_task_id,
              oc.target_id AS mapped_capture_id
       FROM business.transfer_origin orr
       JOIN business.task_result tr ON tr.workspace_id=orr.workspace_id AND tr.id=orr.target_id
       JOIN business.transfer_origin ot ON ot.workspace_id=orr.workspace_id
         AND ot.record_kind='task' AND ot.source_id=$3
       JOIN business.transfer_origin oc ON oc.workspace_id=orr.workspace_id
         AND oc.record_kind='capture' AND oc.source_id=$4
       WHERE orr.workspace_id=$1 AND orr.record_kind='task_result' AND orr.source_id=$2`,
      [operator.workspaceId, resultId, resultTaskId, portableResultCaptureId],
    );
    expect(resultTargets.rows[0]?.task_id).toBe(
      resultTargets.rows[0]?.mapped_task_id,
    );
    expect(resultTargets.rows[0]?.capture_id).toBe(
      resultTargets.rows[0]?.mapped_capture_id,
    );
    const historicalSource = randomUUID();
    const historicalCaptureId = randomUUID();
    const historicalBundle = createCaptureHistoryBundle(
      historicalSource,
      [
        {
          id: historicalCaptureId,
          revision: 3,
          title: "현재 원문",
          rawBody: "셋째 본문",
          recordedAt: "2026-09-25T00:00:00.000Z",
        },
      ],
      [],
      [],
      [],
      [],
      [],
      [
        {
          captureId: historicalCaptureId,
          revision: 1,
          title: "첫 원문",
          rawBody: "첫 본문",
          recordedAt: "2026-09-23T00:00:00.000Z",
        },
        {
          captureId: historicalCaptureId,
          revision: 2,
          title: "둘째 원문",
          rawBody: "둘째 본문",
          recordedAt: "2026-09-24T00:00:00.000Z",
        },
      ],
    );
    const historicalStage = await app.inject({
      method: "POST",
      url: `${transferBase}/imports`,
      headers: {
        ...transferHeaders,
        "content-type": "application/vnd.ieum.bundle+gzip",
      },
      payload: historicalBundle,
    });
    expect(historicalStage.statusCode, historicalStage.body).toBe(201);
    expect(historicalStage.json<{ scope: string }>().scope).toBe(
      "CAPTURES_TASKS_EVENTS_CONTEXTS_TASK_HISTORY_RESULTS_CAPTURE_HISTORY",
    );
    const historicalRunId = historicalStage.json<{ id: string }>().id;
    const historicalPreview = await app.inject({
      method: "GET",
      url: `${transferBase}/imports/${historicalRunId}/preview`,
      headers: transferHeaders,
    });
    expect(
      historicalPreview
        .json<{ rows: { state: string }[] }>()
        .rows.map((row) => row.state),
    ).toEqual(["NEW"]);
    const historicalApplied = await app.inject({
      method: "POST",
      url: `${transferBase}/imports/${historicalRunId}/apply`,
      headers: transferHeaders,
      payload: {
        previewHash: historicalPreview.json<{ previewHash: string }>()
          .previewHash,
      },
    });
    expect(historicalApplied.statusCode, historicalApplied.body).toBe(201);
    expect(historicalApplied.json<{ state: string }>().state).toBe("APPLIED");
    const historyRows = await admin.query<{
      revision: number;
      title: string;
      raw_body: string;
      recorded_at: Date;
    }>(
      `SELECT r.revision,r.title,r.raw_body,r.recorded_at
       FROM business.transfer_origin o JOIN business.capture_revision r
         ON r.workspace_id=o.workspace_id AND r.capture_id=o.target_id
       WHERE o.workspace_id=$1 AND o.record_kind='capture' AND o.source_workspace_id=$2 AND o.source_id=$3
       ORDER BY r.revision`,
      [operator.workspaceId, historicalSource, historicalCaptureId],
    );
    expect(
      historyRows.rows.map((row) => [
        row.revision,
        row.title,
        row.raw_body,
        row.recorded_at.toISOString(),
      ]),
    ).toEqual([
      [1, "첫 원문", "첫 본문", "2026-09-23T00:00:00.000Z"],
      [2, "둘째 원문", "둘째 본문", "2026-09-24T00:00:00.000Z"],
      [3, "현재 원문", "셋째 본문", "2026-09-25T00:00:00.000Z"],
    ]);
    const historicalReplay = await app.inject({
      method: "GET",
      url: `${transferBase}/imports/${historicalRunId}/preview`,
      headers: transferHeaders,
    });
    expect(
      historicalReplay
        .json<{ rows: { state: string }[] }>()
        .rows.map((row) => row.state),
    ).toEqual(["IMPORTED"]);
    const changedHistory = createCaptureHistoryBundle(
      historicalSource,
      [
        {
          id: historicalCaptureId,
          revision: 3,
          title: "현재 원문",
          rawBody: "셋째 본문",
          recordedAt: "2026-09-25T00:00:00.000Z",
        },
      ],
      [],
      [],
      [],
      [],
      [],
      [
        {
          captureId: historicalCaptureId,
          revision: 1,
          title: "첫 원문",
          rawBody: "변경된 첫 본문",
          recordedAt: "2026-09-23T00:00:00.000Z",
        },
        {
          captureId: historicalCaptureId,
          revision: 2,
          title: "둘째 원문",
          rawBody: "둘째 본문",
          recordedAt: "2026-09-24T00:00:00.000Z",
        },
      ],
    );
    const changedHistoryStage = await app.inject({
      method: "POST",
      url: `${transferBase}/imports`,
      headers: {
        ...transferHeaders,
        "content-type": "application/vnd.ieum.bundle+gzip",
      },
      payload: changedHistory,
    });
    expect(changedHistoryStage.statusCode, changedHistoryStage.body).toBe(201);
    const changedHistoryPreview = await app.inject({
      method: "GET",
      url: `${transferBase}/imports/${changedHistoryStage.json<{ id: string }>().id}/preview`,
      headers: transferHeaders,
    });
    expect(
      changedHistoryPreview
        .json<{ rows: { state: string }[] }>()
        .rows.map((row) => row.state),
    ).toEqual(["CONFLICT"]);
    const historicalStorage = await admin.query<{ storage_key: string }>(
      "SELECT storage_key FROM business.transfer_run WHERE id=ANY($1::uuid[])",
      [[historicalRunId, changedHistoryStage.json<{ id: string }>().id]],
    );
    await admin.query(
      "DELETE FROM business.transfer_row WHERE run_id=ANY($1::uuid[])",
      [[historicalRunId, changedHistoryStage.json<{ id: string }>().id]],
    );
    await admin.query(
      "DELETE FROM business.transfer_run WHERE id=ANY($1::uuid[])",
      [[historicalRunId, changedHistoryStage.json<{ id: string }>().id]],
    );
    const historicalFiles = await LocalTransferStorage.create(
      join(assetRoot, "transfer"),
    );
    for (const row of historicalStorage.rows)
      await historicalFiles.remove(row.storage_key);
    await admin.query("DELETE FROM business.task WHERE id=$1", [
      transferredTask.rows[0]?.target_id,
    ]);
    const staleTaskId = randomUUID();
    const staleArchive = createPersonalBundle(
      portableSource,
      [],
      [
        {
          id: staleTaskId,
          originWorkspaceId: portableSource,
          originId: portableTaskId,
          title: "이식 완료 할일",
          description: "완료 상태 유지",
          state: "DONE",
          version: 2,
          dueKind: "DATE",
          dueDate: "2026-10-01",
          dueAt: null,
          dueTimeZone: null,
          contextId: null,
          originUnitId: null,
          originUnitRevision: null,
          completedAt: "2026-09-25T00:00:00.000Z",
          completionVersion: 2,
        },
      ],
      [],
    );
    const staleStage = await app.inject({
      method: "POST",
      url: `${transferBase}/imports`,
      headers: {
        ...transferHeaders,
        "content-type": "application/vnd.ieum.bundle+gzip",
      },
      payload: staleArchive,
    });
    expect(staleStage.statusCode, staleStage.body).toBe(201);
    const stalePreview = await app.inject({
      method: "GET",
      url: `${transferBase}/imports/${staleStage.json<{ id: string }>().id}/preview`,
      headers: transferHeaders,
    });
    expect(
      stalePreview.json<{ rows: { state: string }[] }>().rows[0]?.state,
    ).toBe("CONFLICT");
    const caseSource = randomUUID();
    const caseTaskOrigin = randomUUID();
    const caseEventOrigin = randomUUID();
    const caseArchives = [true, false].map((upper) => {
      const source = upper ? caseSource.toUpperCase() : caseSource;
      const taskOrigin = upper ? caseTaskOrigin.toUpperCase() : caseTaskOrigin;
      const eventOrigin = upper
        ? caseEventOrigin.toUpperCase()
        : caseEventOrigin;
      return createPersonalBundle(
        source,
        [],
        [
          {
            id: randomUUID(),
            originWorkspaceId: source,
            originId: taskOrigin,
            title: "대소문자 잠금 할일",
            description: "",
            state: "TODO",
            version: 1,
            dueKind: "NONE",
            dueDate: null,
            dueAt: null,
            dueTimeZone: null,
            contextId: null,
            originUnitId: null,
            originUnitRevision: null,
            completedAt: null,
            completionVersion: null,
          },
        ],
        [
          {
            id: randomUUID(),
            originWorkspaceId: source,
            originId: eventOrigin,
            title: "대소문자 잠금 일정",
            description: "",
            state: "CONFIRMED",
            version: 1,
            scheduleKind: "ALL_DAY",
            timeZone: "Asia/Seoul",
            startAt: null,
            endAt: null,
            startLocal: null,
            endLocal: null,
            startOffsetMinutes: null,
            endOffsetMinutes: null,
            startDate: "2026-10-04",
            endDateExclusive: "2026-10-05",
          },
        ],
      );
    });
    const caseStages = await Promise.all(
      caseArchives.map((bytes) =>
        app.inject({
          method: "POST",
          url: `${transferBase}/imports`,
          headers: {
            ...transferHeaders,
            "content-type": "application/vnd.ieum.bundle+gzip",
          },
          payload: bytes,
        }),
      ),
    );
    expect(caseStages.every((response) => response.statusCode === 201)).toBe(
      true,
    );
    const caseRunIds = caseStages.map(
      (response) => response.json<{ id: string }>().id,
    );
    const casePreviews = await Promise.all(
      caseRunIds.map((id) =>
        app.inject({
          method: "GET",
          url: `${transferBase}/imports/${id}/preview`,
          headers: transferHeaders,
        }),
      ),
    );
    expect(
      casePreviews.every((response) =>
        response
          .json<{ rows: { state: string }[] }>()
          .rows.every((row) => row.state === "NEW"),
      ),
    ).toBe(true);
    const caseApplies = await Promise.all(
      caseRunIds.map((id, index) =>
        app.inject({
          method: "POST",
          url: `${transferBase}/imports/${id}/apply`,
          headers: transferHeaders,
          payload: {
            previewHash: casePreviews[index]!.json<{ previewHash: string }>()
              .previewHash,
          },
        }),
      ),
    );
    expect(
      caseApplies.every((response) => response.statusCode === 201),
      caseApplies.map((response) => response.body).join("\n"),
    ).toBe(true);
    const caseTasks = await admin.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM business.task WHERE workspace_id=$1 AND title=$2",
      [operator.workspaceId, "대소문자 잠금 할일"],
    );
    const caseEvents = await admin.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM business.calendar_event WHERE workspace_id=$1 AND title=$2",
      [operator.workspaceId, "대소문자 잠금 일정"],
    );
    expect(caseTasks.rows[0]?.count).toBe("1");
    expect(caseEvents.rows[0]?.count).toBe("1");
    const invalidBundle = await app.inject({
      method: "POST",
      url: `${transferBase}/imports`,
      headers: {
        ...transferHeaders,
        "content-type": "application/vnd.ieum.bundle+gzip",
      },
      payload: Buffer.from("not an archive"),
    });
    expect(invalidBundle.statusCode).toBe(422);
    const racingSourceWorkspace = randomUUID();
    const racingSourceId = randomUUID();
    const racingArchives = ["첫 내용", "수정된 내용"].map((rawBody) =>
      createCaptureBundle(racingSourceWorkspace, [
        { id: racingSourceId, revision: 1, title: "경쟁 원문", rawBody },
      ]),
    );
    const stagedRace = await Promise.all(
      racingArchives.map((archive) =>
        app.inject({
          method: "POST",
          url: `${transferBase}/imports`,
          headers: {
            ...transferHeaders,
            "content-type": "application/vnd.ieum.bundle+gzip",
          },
          payload: archive,
        }),
      ),
    );
    expect(stagedRace.every((response) => response.statusCode === 201)).toBe(
      true,
    );
    const racingRuns = stagedRace.map(
      (response) => response.json<{ id: string }>().id,
    );
    const racingPreviews = await Promise.all(
      racingRuns.map((runId) =>
        app.inject({
          method: "GET",
          url: `${transferBase}/imports/${runId}/preview`,
          headers: transferHeaders,
        }),
      ),
    );
    expect(
      racingPreviews.every(
        (response) =>
          response.json<{ rows: { state: string }[] }>().rows[0]?.state ===
          "NEW",
      ),
    ).toBe(true);
    const racingApplied = await Promise.all(
      racingRuns.map((runId, index) =>
        app.inject({
          method: "POST",
          url: `${transferBase}/imports/${runId}/apply`,
          headers: transferHeaders,
          payload: {
            previewHash: racingPreviews[index]!.json<{ previewHash: string }>()
              .previewHash,
          },
        }),
      ),
    );
    expect(racingApplied.every((response) => response.statusCode === 201)).toBe(
      true,
    );
    expect(
      racingApplied
        .map((response) => response.json<{ state: string }>().state)
        .sort(),
    ).toEqual(["APPLIED", "PARTIAL"]);
    const writesBeforeQuota = transferWriteCalls;
    const quotaAttempts = await Promise.all(
      Array.from({ length: 14 }, () =>
        app.inject({
          method: "POST",
          url: `${transferBase}/exports`,
          headers: transferHeaders,
        }),
      ),
    );
    expect(quotaAttempts.some((response) => response.statusCode === 429)).toBe(
      true,
    );
    expect(
      quotaAttempts.every((response) =>
        [201, 429].includes(response.statusCode),
      ),
    ).toBe(true);
    expect(transferWriteCalls - writesBeforeQuota).toBe(
      quotaAttempts.filter((response) => response.statusCode === 201).length,
    );
    const activeRuns = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM business.transfer_run
       WHERE workspace_id=$1 AND actor_id=$2 AND expires_at>now()`,
      [operator.workspaceId, operator.userId],
    );
    expect(Number(activeRuns.rows[0]?.count)).toBeLessThanOrEqual(16);
    await admin.query(
      "UPDATE business.transfer_run SET created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour' WHERE id=$1",
      [exportId],
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: `${transferBase}/exports/${exportId}/download`,
          headers: transferHeaders,
        })
      ).statusCode,
    ).toBe(410);

    const sharedResultOrigin = randomUUID();
    const duplicateSource = randomUUID();
    const duplicateTaskIds = [randomUUID(), randomUUID()];
    const duplicateCaptureIds = [randomUUID(), randomUUID()];
    const duplicateResultIds = [randomUUID(), randomUUID()];
    const duplicateBundle = createTaskResultBundle(
      duplicateSource,
      duplicateCaptureIds.map((captureId, index) => ({
        id: captureId,
        revision: 1,
        title: `중복 출처 원문 ${index + 1}`,
        rawBody: `서로 다른 결과 ${index + 1}`,
      })),
      duplicateTaskIds.map((taskId, index) => ({
        id: taskId,
        originWorkspaceId: duplicateSource,
        originId: taskId,
        title: `중복 출처 할일 ${index + 1}`,
        description: "",
        state: "DONE" as const,
        version: 2,
        dueKind: "NONE" as const,
        dueDate: null,
        dueAt: null,
        dueTimeZone: null,
        contextId: null,
        originUnitId: null,
        originUnitRevision: null,
        completedAt: "2026-09-25T00:00:00.000Z",
        completionVersion: 2,
      })),
      [],
      [],
      duplicateTaskIds.map((taskId) => ({
        taskId,
        version: 2,
        fromState: "TODO" as const,
        toState: "DONE" as const,
        recordedAt: "2026-09-25T00:00:00.000Z",
      })),
      duplicateResultIds.map((resultId, index) => ({
        id: resultId,
        originWorkspaceId: duplicateSource,
        originId: sharedResultOrigin,
        taskId: duplicateTaskIds[index]!,
        captureId: duplicateCaptureIds[index]!,
        completionVersion: 2,
        recordedAt: "2026-09-25T00:01:00.000Z",
      })),
    );
    const duplicateStage = await app.inject({
      method: "POST",
      url: `${transferBase}/imports`,
      headers: {
        ...transferHeaders,
        "content-type": "application/vnd.ieum.bundle+gzip",
      },
      payload: duplicateBundle,
    });
    expect(duplicateStage.statusCode, duplicateStage.body).toBe(201);
    const duplicateRunId = duplicateStage.json<{ id: string }>().id;
    const duplicatePreview = await app.inject({
      method: "GET",
      url: `${transferBase}/imports/${duplicateRunId}/preview`,
      headers: transferHeaders,
    });
    expect(
      duplicatePreview
        .json<{ rows: { recordKind: string; state: string }[] }>()
        .rows.filter((row) => row.recordKind === "task_result")
        .map((row) => row.state),
    ).toEqual(["NEW", "CONFLICT"]);
    const duplicateApplied = await app.inject({
      method: "POST",
      url: `${transferBase}/imports/${duplicateRunId}/apply`,
      headers: transferHeaders,
      payload: {
        previewHash: duplicatePreview.json<{ previewHash: string }>()
          .previewHash,
      },
    });
    expect(duplicateApplied.statusCode, duplicateApplied.body).toBe(201);
    expect(duplicateApplied.json<{ state: string }>().state).toBe("PARTIAL");
    const duplicateRows = await admin.query<{
      state: string;
      reason_code: string | null;
    }>(
      `SELECT state,reason_code FROM business.transfer_row
       WHERE run_id=$1 AND record_kind='task_result' ORDER BY source_id`,
      [duplicateRunId],
    );
    expect(duplicateRows.rows.map((row) => row.state).sort()).toEqual([
      "FAILED",
      "IMPORTED",
    ]);
    expect(
      duplicateRows.rows.find((row) => row.state === "FAILED")?.reason_code,
    ).toBe("ORIGIN_DUPLICATE");

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
