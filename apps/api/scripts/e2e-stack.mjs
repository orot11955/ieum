// Isolated browser-test stack: a throwaway PostgreSQL container, all migrations,
// separated runtime roles, one operator account and the built management API.
// Never point this at a real database; it creates and drops everything itself.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { IdentityService } from "@ieum/backend/identity-service";
import { createAccountAdministration } from "../dist/auth/registration.js";

const root = new URL("../../../", import.meta.url);
const image =
  "postgres:18.4-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15";
const apiPort = process.env.IEUM_E2E_API_PORT ?? "3100";
const webOrigin = process.env.IEUM_E2E_WEB_ORIGIN ?? "http://127.0.0.1:4173";
const email = process.env.IEUM_E2E_EMAIL ?? "operator@example.test";
const password =
  process.env.IEUM_E2E_PASSWORD ?? "e2e operator fixture password 1234";
const rolePassword = "e2e_fixture_only";

function roleUrl(base, role) {
  const url = new URL(base);
  url.username = role;
  url.password = rolePassword;
  return url.toString();
}

const container = await new PostgreSqlContainer(image)
  .withDatabase("ieum_e2e")
  .withUsername("postgres")
  .withPassword(rolePassword)
  .start();
let api;
const stop = async () => {
  api?.kill("SIGTERM");
  await container.stop().catch(() => {});
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

const base = container.getConnectionUri();
const admin = new pg.Pool({ connectionString: base });
await migrate(drizzle(admin), {
  migrationsFolder: fileURLToPath(new URL("db/migrations/auth", root)),
});
await admin.query(readFileSync(new URL("db/admin/roles.sql", root), "utf8"));
await migrate(drizzle(admin), {
  migrationsFolder: fileURLToPath(new URL("db/migrations/business", root)),
  migrationsSchema: "drizzle_business",
});
await admin.query(
  `CREATE ROLE ieum_e2e_app LOGIN PASSWORD '${rolePassword}' IN ROLE ieum_application`,
);
await admin.query(
  `CREATE ROLE ieum_e2e_auth LOGIN PASSWORD '${rolePassword}' IN ROLE ieum_auth_runtime`,
);
await admin.end();

const env = {
  AUTH_DATABASE_URL: roleUrl(base, "ieum_e2e_auth"),
  APPLICATION_DATABASE_URL: roleUrl(base, "ieum_e2e_app"),
  AUTH_BASE_URL: webOrigin,
  AUTH_SECRET: "e2e_fixture_secret_at_least_32_characters",
};
const appPool = new pg.Pool({ connectionString: env.APPLICATION_DATABASE_URL });
const administration = createAccountAdministration({
  databaseUrl: env.AUTH_DATABASE_URL,
  baseUrl: env.AUTH_BASE_URL,
  secret: env.AUTH_SECRET,
});
await new IdentityService(
  appPool,
  administration.registration,
  administration.sessions,
  appPool,
).bootstrap({ email, name: "E2E Operator", password });
await administration.close();
await appPool.end();

api = spawn(
  process.execPath,
  [fileURLToPath(new URL("../dist/main.js", import.meta.url))],
  {
    env: { ...process.env, ...env, PORT: apiPort, HOST: "127.0.0.1" },
    stdio: "inherit",
  },
);
api.on("exit", (code) => {
  process.stderr.write(`E2E API exited with ${code}\n`);
  void container.stop().finally(() => process.exit(code ?? 1));
});
process.stdout.write(`E2E stack ready: API on ${apiPort} for ${webOrigin}\n`);
