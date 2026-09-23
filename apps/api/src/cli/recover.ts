import "reflect-metadata";
import { Pool } from "pg";
import { IdentityError, IdentityService } from "@ieum/backend/identity-service";
import { assertApplicationDatabaseRole } from "@ieum/backend/platform/database/scope";
import { createAuth } from "../auth/auth.js";
import { createAccountAdministration } from "../auth/registration.js";
import { askSecret, askText } from "./terminal.js";

async function main(): Promise<void> {
  if (
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    process.argv.length !== 2
  ) {
    throw new Error(
      "Recovery requires a local interactive terminal without arguments",
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
  const authLockPool = new Pool({
    connectionString: applicationDatabaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  try {
    await assertApplicationDatabaseRole(businessPool);
    const config = { databaseUrl, baseUrl, secret };
    let resetToken: string | null = null;
    const auth = createAuth({
      ...config,
      sendResetPassword: async (message) => {
        resetToken = message.token;
      },
    });
    const administration = createAccountAdministration(config);
    try {
      const email = (await askText("Account email: ")).trim().toLowerCase();
      const userId = await administration.findUserIdByEmail(email);
      if (!userId) throw new Error("Account unavailable for local recovery");
      const newPassword = await askSecret("New password: ");
      const confirmation = await askSecret("Confirm new password: ");
      if (newPassword !== confirmation || [...newPassword].length < 15) {
        throw new Error("Password confirmation or length is invalid");
      }
      const factorChoice = (
        await askText(
          "Type RESET to clear lost MFA factors, or press Enter to preserve them: ",
        )
      ).trim();
      if (factorChoice && factorChoice !== "RESET") {
        throw new Error("MFA choice must be RESET or empty");
      }
      const identity = new IdentityService(
        businessPool,
        administration.registration,
        administration.sessions,
        authLockPool,
      );
      await identity.recordLocalRecovery(userId, "LOCAL_RECOVERY_STARTED");
      await auth.auth.api.requestPasswordReset({
        body: {
          email,
          redirectTo: `${new URL(baseUrl).origin}/reset-password`,
        },
      });
      if (!resetToken) throw new Error("Password reset token unavailable");
      await identity.withAuthMutationLock(async () => {
        await auth.auth.api.resetPassword({
          body: { token: resetToken!, newPassword },
        });
        await administration.sessions.revokeAll(userId);
        if (factorChoice === "RESET") {
          await administration.clearFactorsForLocalRecovery(userId);
        }
        await identity.recordLocalRecovery(userId, "LOCAL_RECOVERY_COMPLETED");
      });
      process.stdout.write(
        "Local recovery completed. Sign in with the new password; enroll MFA again if cleared.\n",
      );
    } finally {
      await Promise.all([auth.close(), administration.close()]);
    }
  } finally {
    await businessPool.end();
    await authLockPool.end();
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
            "Recovery requires a local interactive terminal without arguments",
            "Identity runtime database and auth settings are required",
            "Account unavailable for local recovery",
            "Password confirmation or length is invalid",
            "MFA choice must be RESET or empty",
            "Password reset token unavailable",
          ].includes(error.message)
        ? error.message
        : "Local recovery failed";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
