import type {
  AccountRegistrationPort,
  SessionRevocationPort,
} from "@ieum/backend/identity-service";
import { Pool } from "pg";
import { createPrivateRegistrationAuth } from "./auth.js";
import type { AuthConfiguration } from "./auth.js";
import {
  ABSOLUTE_SESSION_SECONDS,
  IDLE_SESSION_SECONDS,
} from "./session-policy.js";

export function createAccountAdministration(config: AuthConfiguration): {
  registration: AccountRegistrationPort;
  sessions: SessionRevocationPort & {
    listForUser(userId: string): Promise<
      Array<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userAgent: string | null;
        ipAddress: string | null;
      }>
    >;
    revokeById(userId: string, sessionId: string): Promise<void>;
    touchActivity(userId: string, sessionId: string): Promise<boolean>;
  };
  findUserIdByEmail(email: string): Promise<string | null>;
  clearFactorsForLocalRecovery(userId: string): Promise<void>;
  close: () => Promise<void>;
} {
  const privateAuth = createPrivateRegistrationAuth(config);
  const pool = new Pool({ connectionString: config.databaseUrl });

  async function verifyExisting(
    email: string,
    password: string,
  ): Promise<string> {
    const response = await privateAuth.auth.api.signInEmail({
      body: { email, password },
    });
    if (!response || !("user" in response) || !("token" in response)) {
      throw new Error("Existing account could not be verified");
    }
    try {
      return response.user.id;
    } finally {
      await pool.query("DELETE FROM auth.session WHERE token = $1", [
        response.token,
      ]);
    }
  }

  return {
    registration: {
      async registerOrVerify({ email, name, password }) {
        const existing = await pool.query<{ id: string }>(
          'SELECT id FROM auth."user" WHERE email = $1',
          [email],
        );
        if (existing.rows[0]) {
          const verifiedId = await verifyExisting(email, password);
          if (verifiedId !== existing.rows[0].id)
            throw new Error("Existing account identity changed");
          return verifiedId;
        }
        try {
          const response = await privateAuth.auth.api.signUpEmail({
            body: { email, name, password },
          });
          if (!response?.user.id)
            throw new Error("Account registration did not return a user");
          return response.user.id;
        } catch (error) {
          // A concurrent retry may have created the same auth row. Verify the
          // supplied password before completing the reserved business identity.
          const raced = await pool.query<{ id: string }>(
            'SELECT id FROM auth."user" WHERE email = $1',
            [email],
          );
          if (!raced.rows[0]) throw error;
          const verifiedId = await verifyExisting(email, password);
          if (verifiedId !== raced.rows[0].id) throw error;
          return verifiedId;
        }
      },
    },
    sessions: {
      async revokeAll(userId) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("DELETE FROM auth.session WHERE user_id = $1", [
            userId,
          ]);
          // Better Auth stores both pending MFA challenges and trusted-device
          // grants with the auth user ID as their verification value.
          await client.query("DELETE FROM auth.verification WHERE value = $1", [
            userId,
          ]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      async listForUser(userId) {
        const result = await pool.query<{
          id: string;
          created_at: Date;
          updated_at: Date;
          user_agent: string | null;
          ip_address: string | null;
        }>(
          `SELECT id, created_at, updated_at, user_agent, ip_address
           FROM auth.session WHERE user_id = $1 AND expires_at > now()
             AND created_at > $2 AND updated_at > $3
           ORDER BY created_at DESC`,
          [
            userId,
            new Date(Date.now() - ABSOLUTE_SESSION_SECONDS * 1_000),
            new Date(Date.now() - IDLE_SESSION_SECONDS * 1_000),
          ],
        );
        return result.rows.map((row) => ({
          id: row.id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          userAgent: row.user_agent,
          ipAddress: row.ip_address,
        }));
      },
      async revokeById(userId, sessionId) {
        await pool.query(
          "DELETE FROM auth.session WHERE user_id = $1 AND id = $2",
          [userId, sessionId],
        );
      },
      async touchActivity(userId, sessionId) {
        const result = await pool.query(
          `UPDATE auth.session SET updated_at = now()
           WHERE id = $1 AND user_id = $2 AND expires_at > now()
             AND created_at > $3 AND updated_at > $4`,
          [
            sessionId,
            userId,
            new Date(Date.now() - ABSOLUTE_SESSION_SECONDS * 1_000),
            new Date(Date.now() - IDLE_SESSION_SECONDS * 1_000),
          ],
        );
        return result.rowCount === 1;
      },
    },
    async findUserIdByEmail(email) {
      const result = await pool.query<{ id: string }>(
        'SELECT id FROM auth."user" WHERE email = $1',
        [email.trim().toLowerCase()],
      );
      return result.rows[0]?.id ?? null;
    },
    async clearFactorsForLocalRecovery(userId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM auth.two_factor WHERE user_id = $1", [
          userId,
        ]);
        await client.query(
          'UPDATE auth."user" SET two_factor_enabled = false WHERE id = $1',
          [userId],
        );
        await client.query("DELETE FROM auth.session WHERE user_id = $1", [
          userId,
        ]);
        await client.query("DELETE FROM auth.verification WHERE value = $1", [
          userId,
        ]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: async () => {
      await privateAuth.close();
      await pool.end();
    },
  };
}
