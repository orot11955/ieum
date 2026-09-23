import "reflect-metadata";
import { Pool } from "pg";
import { IdentityService } from "@ieum/backend/identity-service";
import { CommandCoordinator } from "@ieum/backend/command-coordinator";
import { PreferenceCommands } from "@ieum/backend/preferences";
import { CaptureService } from "@ieum/backend/captures";
import { KnowledgeService } from "@ieum/backend/knowledge";
import { TaskService } from "@ieum/backend/tasks";
import { CalendarService } from "@ieum/backend/calendar";
import { JudgementService } from "@ieum/backend/judgement/judgement-service";
import { ProposalService } from "@ieum/backend/judgement/proposals";
import { assertApplicationDatabaseRole } from "@ieum/backend/platform/database/scope";
import { createApiApp } from "./app.js";
import { createAuth } from "./auth/auth.js";
import { createAuthPort } from "./auth/fastify.js";
import { createAccountAdministration } from "./auth/registration.js";

const port = Number(process.env.PORT ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const databaseUrl = process.env.AUTH_DATABASE_URL;
const applicationDatabaseUrl = process.env.APPLICATION_DATABASE_URL;
const baseUrl = process.env.AUTH_BASE_URL;
const secret = process.env.AUTH_SECRET;
const authValues = [databaseUrl, applicationDatabaseUrl, baseUrl, secret];
if (authValues.some(Boolean) && !authValues.every(Boolean)) {
  throw new Error(
    "AUTH_DATABASE_URL, APPLICATION_DATABASE_URL, AUTH_BASE_URL and AUTH_SECRET must be set together",
  );
}
let runtime: Parameters<typeof createApiApp>[0];
if (databaseUrl && applicationDatabaseUrl && baseUrl && secret) {
  const businessPool = new Pool({ connectionString: applicationDatabaseUrl });
  const authLockPool = new Pool({
    connectionString: applicationDatabaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  try {
    await assertApplicationDatabaseRole(businessPool);
    const config = { databaseUrl, baseUrl, secret };
    const auth = createAuth(config);
    const administration = createAccountAdministration(config);
    const service = new IdentityService(
      businessPool,
      administration.registration,
      administration.sessions,
      authLockPool,
    );
    const commands = new CommandCoordinator(service);
    runtime = {
      auth: auth.auth,
      baseUrl,
      identity: {
        service,
        preferences: new PreferenceCommands(commands),
        captures: new CaptureService(service, commands),
        knowledge: new KnowledgeService(service, commands),
        tasks: new TaskService(service, commands),
        calendar: new CalendarService(service, commands),
        judgement: new JudgementService(businessPool, commands),
        proposals: new ProposalService(businessPool, commands),
        authPort: createAuthPort(auth.auth),
        sessions: administration.sessions,
        origin: new URL(baseUrl).origin,
      },
      loginAllowed: async (email) => {
        const userId = await administration.findUserIdByEmail(email);
        return userId ? service.isActiveUser(userId) : true;
      },
      withAuthMutationLock: (operation) =>
        service.withAuthMutationLock(operation),
      close: async () => {
        await Promise.all([
          auth.close(),
          administration.close(),
          businessPool.end(),
          authLockPool.end(),
        ]);
      },
    };
  } catch (error) {
    await businessPool.end();
    await authLockPool.end();
    throw error;
  }
}
const app = await createApiApp(runtime);
app.enableShutdownHooks();
await app.listen(port, process.env.HOST ?? "127.0.0.1");
