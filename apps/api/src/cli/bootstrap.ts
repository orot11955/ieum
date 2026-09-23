import "reflect-metadata";
import { Pool } from "pg";
import { IdentityError, IdentityService } from "@ieum/backend/identity-service";
import { assertApplicationDatabaseRole } from "@ieum/backend/platform/database/scope";
import { createAccountAdministration } from "../auth/registration.js";
import { askSecret, askText } from "./terminal.js";

async function main(): Promise<void> {
  if (
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    process.argv.length !== 2
  ) {
    throw new Error(
      "Bootstrap requires a local interactive terminal without arguments",
    );
  }
  const databaseUrl = process.env.AUTH_DATABASE_URL;
  const applicationDatabaseUrl = process.env.APPLICATION_DATABASE_URL;
  const baseUrl = process.env.AUTH_BASE_URL;
  const secret = process.env.AUTH_SECRET;
  if (!databaseUrl || !applicationDatabaseUrl || !baseUrl || !secret) {
    throw new Error("Identity runtime database and auth settings are required");
  }
  const businessPool = new Pool({ connectionString: applicationDatabaseUrl });
  try {
    await assertApplicationDatabaseRole(businessPool);
    const administration = createAccountAdministration({
      databaseUrl,
      baseUrl,
      secret,
    });
    try {
      const email = await askText("Operator email: ");
      const name = await askText("Operator name: ");
      const password = await askSecret("Password: ");
      const confirmation = await askSecret("Confirm password: ");
      if (password !== confirmation) throw new Error("Passwords do not match");
      const identity = new IdentityService(
        businessPool,
        administration.registration,
        administration.sessions,
        businessPool,
      );
      const account = await identity.bootstrap({ email, name, password });
      process.stdout.write(
        `Operator created. User ${account.userId}; workspace ${account.workspaceId}.\n`,
      );
    } finally {
      await administration.close();
    }
  } finally {
    await businessPool.end();
  }
}

try {
  await main();
} catch (error) {
  const code =
    error instanceof IdentityError
      ? error.code
      : error instanceof Error &&
          [
            "An interactive terminal is required",
            "Bootstrap requires a local interactive terminal without arguments",
            "Identity runtime database and auth settings are required",
            "Passwords do not match",
            "Cancelled",
          ].includes(error.message)
        ? error.message
        : "Bootstrap failed";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
