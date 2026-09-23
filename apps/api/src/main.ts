import "reflect-metadata";
import { createApiApp } from "./app.js";
import { createAuth } from "./auth/auth.js";

const port = Number(process.env.PORT ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const databaseUrl = process.env.AUTH_DATABASE_URL;
const baseUrl = process.env.AUTH_BASE_URL;
const secret = process.env.AUTH_SECRET;
const authValues = [databaseUrl, baseUrl, secret];
if (authValues.some(Boolean) && !authValues.every(Boolean)) {
  throw new Error(
    "AUTH_DATABASE_URL, AUTH_BASE_URL and AUTH_SECRET must be set together",
  );
}
const authRuntime =
  databaseUrl && baseUrl && secret
    ? { ...createAuth({ databaseUrl, baseUrl, secret }), baseUrl }
    : undefined;
const app = await createApiApp(
  authRuntime
    ? {
        auth: authRuntime.auth,
        baseUrl: authRuntime.baseUrl,
        close: authRuntime.close,
      }
    : undefined,
);
app.enableShutdownHooks();
await app.listen(port, process.env.HOST ?? "127.0.0.1");
