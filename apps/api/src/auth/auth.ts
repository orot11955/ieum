import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export interface AuthConfiguration {
  databaseUrl: string;
  baseUrl: string;
  secret: string;
  sendResetPassword?: (message: {
    email: string;
    url: string;
    token: string;
  }) => Promise<void>;
}

export type IeumAuth = ReturnType<typeof betterAuth>;

export function createAuth(config: AuthConfiguration): {
  auth: IeumAuth;
  close: () => Promise<void>;
} {
  const url = new URL(config.baseUrl);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("AUTH_BASE_URL must be an origin");
  }
  if (config.secret.length < 32) {
    throw new Error("AUTH_SECRET must contain at least 32 characters");
  }
  const pool = new Pool({ connectionString: config.databaseUrl });
  const resetSender = config.sendResetPassword;
  const options: BetterAuthOptions = {
    baseURL: url.origin,
    secret: config.secret,
    database: drizzleAdapter(drizzle(pool, { schema }), {
      provider: "pg",
      schemaName: "auth",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      revokeSessionsOnPasswordReset: true,
      ...(resetSender
        ? {
            sendResetPassword: async ({ user, url: resetUrl, token }) =>
              resetSender({ email: user.email, url: resetUrl, token }),
          }
        : {}),
    },
    session: {
      cookieCache: { enabled: false },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["x-ieum-client-ip"] },
    },
    trustedOrigins: [url.origin],
    plugins: [twoFactor()],
  };
  const auth = betterAuth(options);
  return { auth, close: () => pool.end() };
}
