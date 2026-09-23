import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { withWorkspaceTransaction } from "./platform/database/scope.js";

export type IdentityErrorCode =
  | "BOOTSTRAP_COMPLETE"
  | "BOOTSTRAP_RESERVED"
  | "INVITATION_INVALID"
  | "ACCESS_DENIED"
  | "LAST_OPERATOR"
  | "INVALID_INPUT";

export class IdentityError extends Error {
  constructor(public readonly code: IdentityErrorCode) {
    super(code);
  }
}

/** Implemented only by the private auth adapter; its endpoint is never mounted. */
export interface AccountRegistrationPort {
  registerOrVerify(input: {
    email: string;
    name: string;
    password: string;
  }): Promise<string>;
}

export interface SessionRevocationPort {
  revokeAll(userId: string): Promise<void>;
}

export interface PersonalAccess {
  userId: string;
  workspaceId: string;
  operator: boolean;
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new IdentityError("INVALID_INPUT");
  }
  return normalized;
}

function validateAccountInput(name: string, password: string): void {
  const passwordLength = [...password].length;
  if (
    !name.trim() ||
    name.length > 200 ||
    passwordLength < 15 ||
    passwordLength > 1024
  ) {
    throw new IdentityError("INVALID_INPUT");
  }
}

function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createPersonalRows(
  client: PoolClient,
  userId: string,
  workspaceId: string,
): Promise<void> {
  await client.query(
    "INSERT INTO business.workspace (id, personal_owner_id) VALUES ($1, $2)",
    [workspaceId, userId],
  );
  await client.query(
    "INSERT INTO business.workspace_member (workspace_id, user_id) VALUES ($1, $2)",
    [workspaceId, userId],
  );
  await client.query(
    "INSERT INTO business.user_access (user_id, personal_workspace_id) VALUES ($1, $2)",
    [userId, workspaceId],
  );
  await client.query(
    "INSERT INTO business.user_preference (user_id) VALUES ($1)",
    [userId],
  );
}

/** Shared owner check for HTTP commands and worker jobs, with transaction-local RLS scope. */
export async function withActivePersonalWorkspace<T>(
  pool: Pool,
  userId: string,
  operation: (client: PoolClient, access: PersonalAccess) => Promise<T>,
  isolation: "READ COMMITTED" | "REPEATABLE READ" = "READ COMMITTED",
): Promise<T> {
  const lookup = await pool.query<{ personal_workspace_id: string }>(
    "SELECT personal_workspace_id FROM business.user_access WHERE user_id = $1",
    [userId],
  );
  const workspaceId = lookup.rows[0]?.personal_workspace_id;
  if (!workspaceId) throw new IdentityError("ACCESS_DENIED");
  return withWorkspaceTransaction(
    pool,
    workspaceId,
    async (client) => {
      const access = await client.query<{ operator: boolean }>(
        `SELECT EXISTS (
         SELECT 1 FROM business.instance_operator io
         WHERE io.user_id = ua.user_id AND io.active
       ) AS operator
       FROM business.user_access ua
       JOIN business.workspace w ON w.id = ua.personal_workspace_id
       JOIN business.workspace_member wm
         ON wm.workspace_id = w.id AND wm.user_id = ua.user_id
       WHERE ua.user_id = $1 AND ua.state = 'ACTIVE'
         AND w.state = 'ACTIVE' AND wm.state = 'ACTIVE' AND wm.role = 'OWNER'
       FOR SHARE OF ua, w, wm`,
        [userId],
      );
      if (!access.rows[0]) throw new IdentityError("ACCESS_DENIED");
      return operation(client, {
        userId,
        workspaceId,
        operator: access.rows[0].operator,
      });
    },
    isolation,
  );
}

export class IdentityService {
  constructor(
    private readonly pool: Pool,
    private readonly registration: AccountRegistrationPort,
    private readonly sessions: SessionRevocationPort,
    private readonly authLockPool: Pool,
  ) {}

  /** Serialize auth session issuance with account suspension. */
  async withAuthMutationLock<T>(operation: () => Promise<T>): Promise<T> {
    const client = await this.authLockPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(496581, 4)");
      const result = await operation();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /** The caller must be a local interactive CLI; no HTTP route exposes this method. */
  async bootstrap(input: {
    email: string;
    name: string;
    password: string;
  }): Promise<PersonalAccess> {
    const email = normalizeEmail(input.email);
    validateAccountInput(input.name, input.password);
    await this.pool.query(
      "INSERT INTO business.installation (id, operator_email) VALUES (1, $1) ON CONFLICT (id) DO NOTHING",
      [email],
    );
    const reservation = await this.pool.query<{
      operator_email: string;
      state: string;
    }>("SELECT operator_email, state FROM business.installation WHERE id = 1");
    if (reservation.rows[0]?.operator_email !== email)
      throw new IdentityError("BOOTSTRAP_RESERVED");
    if (reservation.rows[0].state !== "PENDING")
      throw new IdentityError("BOOTSTRAP_COMPLETE");

    // An interrupted first run can safely retry with the same email and password.
    const userId = await this.registration.registerOrVerify({
      email,
      name: input.name.trim(),
      password: input.password,
    });
    const workspaceId = randomUUID();
    return withWorkspaceTransaction(this.pool, workspaceId, async (client) => {
      const locked = await client.query<{
        operator_email: string;
        state: string;
      }>(
        "SELECT operator_email, state FROM business.installation WHERE id = 1 FOR UPDATE",
      );
      if (locked.rows[0]?.operator_email !== email)
        throw new IdentityError("BOOTSTRAP_RESERVED");
      if (locked.rows[0].state !== "PENDING")
        throw new IdentityError("BOOTSTRAP_COMPLETE");
      await createPersonalRows(client, userId, workspaceId);
      await client.query(
        "INSERT INTO business.instance_operator (user_id) VALUES ($1)",
        [userId],
      );
      await client.query(
        "UPDATE business.installation SET state = 'ACTIVE', operator_user_id = $1, completed_at = now() WHERE id = 1",
        [userId],
      );
      await client.query(
        "INSERT INTO business.identity_event (actor_id, target_id, kind) VALUES ($1, $1, 'BOOTSTRAP_COMPLETED')",
        [userId],
      );
      return { userId, workspaceId, operator: true };
    });
  }

  async withPersonalWorkspace<T>(
    userId: string,
    operation: (client: PoolClient, access: PersonalAccess) => Promise<T>,
  ): Promise<T> {
    return withActivePersonalWorkspace(this.pool, userId, operation);
  }

  async getMe(
    userId: string,
  ): Promise<PersonalAccess & { timeZone: string; preferenceVersion: number }> {
    return this.withPersonalWorkspace(userId, async (client, access) => {
      const preference = await client.query<{
        time_zone: string;
        version: number;
      }>(
        "SELECT time_zone, version FROM business.user_preference WHERE user_id = $1",
        [userId],
      );
      if (!preference.rows[0]) throw new IdentityError("ACCESS_DENIED");
      return {
        ...access,
        timeZone: preference.rows[0].time_zone,
        preferenceVersion: preference.rows[0].version,
      };
    });
  }
  async isActiveUser(userId: string): Promise<boolean> {
    try {
      await this.getMe(userId);
      return true;
    } catch (error) {
      if (error instanceof IdentityError && error.code === "ACCESS_DENIED")
        return false;
      throw error;
    }
  }

  /** Called only by the server-local recovery CLI, with no HTTP exposure. */
  async recordLocalRecovery(
    targetId: string,
    kind: "LOCAL_RECOVERY_STARTED" | "LOCAL_RECOVERY_COMPLETED",
  ): Promise<void> {
    const target = await this.pool.query(
      "SELECT 1 FROM business.user_access WHERE user_id = $1",
      [targetId],
    );
    if (!target.rowCount) throw new IdentityError("ACCESS_DENIED");
    await this.pool.query(
      "INSERT INTO business.identity_event (target_id, kind) VALUES ($1, $2)",
      [targetId, kind],
    );
  }

  async issueInvitation(
    issuerId: string,
    invitedEmail: string,
    expiresInHours = 72,
  ): Promise<{ token: string; expiresAt: Date }> {
    const email = normalizeEmail(invitedEmail);
    if (
      !Number.isInteger(expiresInHours) ||
      expiresInHours < 1 ||
      expiresInHours > 168
    )
      throw new IdentityError("INVALID_INPUT");
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + expiresInHours * 3_600_000);
    await this.withPersonalWorkspace(issuerId, async (client, access) => {
      if (!access.operator) throw new IdentityError("ACCESS_DENIED");
      await client.query(
        "INSERT INTO business.invitation (token_digest, email, issuer_id, expires_at) VALUES ($1, $2, $3, $4)",
        [tokenDigest(token), email, issuerId, expiresAt],
      );
      await client.query(
        "INSERT INTO business.identity_event (actor_id, kind) VALUES ($1, 'INVITATION_ISSUED')",
        [issuerId],
      );
    });
    return { token, expiresAt };
  }

  async acceptInvitation(input: {
    token: string;
    name: string;
    password: string;
  }): Promise<PersonalAccess> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(input.token))
      throw new IdentityError("INVITATION_INVALID");
    validateAccountInput(input.name, input.password);
    const workspaceId = randomUUID();
    return withWorkspaceTransaction(this.pool, workspaceId, async (client) => {
      const invitation = await client.query<{
        id: string;
        email: string;
        issuer_id: string;
      }>(
        `SELECT id, email, issuer_id FROM business.invitation
         WHERE token_digest = $1 AND expires_at > now()
           AND revoked_at IS NULL AND consumed_at IS NULL FOR UPDATE`,
        [tokenDigest(input.token)],
      );
      const row = invitation.rows[0];
      if (!row) throw new IdentityError("INVITATION_INVALID");
      const userId = await this.registration.registerOrVerify({
        email: row.email,
        name: input.name.trim(),
        password: input.password,
      });
      const existingAccess = await client.query(
        "SELECT 1 FROM business.user_access WHERE user_id = $1",
        [userId],
      );
      if (existingAccess.rowCount)
        throw new IdentityError("INVITATION_INVALID");
      await createPersonalRows(client, userId, workspaceId);
      await client.query(
        "UPDATE business.invitation SET claimed_user_id = $2, claimed_at = now(), consumed_at = now() WHERE id = $1",
        [row.id, userId],
      );
      await client.query(
        "INSERT INTO business.identity_event (actor_id, target_id, kind) VALUES ($1, $2, 'INVITATION_ACCEPTED')",
        [row.issuer_id, userId],
      );
      return { userId, workspaceId, operator: false };
    });
  }

  async setUserSuspended(
    actorId: string,
    targetId: string,
    suspended: boolean,
  ): Promise<void> {
    const lookup = await this.pool.query<{ personal_workspace_id: string }>(
      "SELECT personal_workspace_id FROM business.user_access WHERE user_id = $1",
      [actorId],
    );
    const workspaceId = lookup.rows[0]?.personal_workspace_id;
    if (!workspaceId) throw new IdentityError("ACCESS_DENIED");
    await this.withAuthMutationLock(() =>
      withWorkspaceTransaction(this.pool, workspaceId, async (client) => {
        // Serialize operator state changes before locking either actor row.
        await client.query(
          "SELECT id FROM business.installation WHERE id = 1 FOR UPDATE",
        );
        const actor = await client.query(
          `SELECT 1 FROM business.user_access ua
         JOIN business.workspace w ON w.id = ua.personal_workspace_id
         JOIN business.workspace_member wm
           ON wm.workspace_id = w.id AND wm.user_id = ua.user_id
         JOIN business.instance_operator io ON io.user_id = ua.user_id
         WHERE ua.user_id = $1 AND ua.state = 'ACTIVE'
           AND w.state = 'ACTIVE' AND wm.state = 'ACTIVE'
           AND wm.role = 'OWNER' AND io.active
         FOR SHARE OF ua, w, wm, io`,
          [actorId],
        );
        if (!actor.rowCount) throw new IdentityError("ACCESS_DENIED");
        const operator = await client.query<{ active: boolean }>(
          "SELECT active FROM business.instance_operator WHERE user_id = $1 FOR UPDATE",
          [targetId],
        );
        if (suspended && operator.rows[0]?.active) {
          const count = await client.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM business.instance_operator io
           JOIN business.user_access ua ON ua.user_id = io.user_id
           WHERE io.active AND ua.state = 'ACTIVE'`,
          );
          if (Number(count.rows[0]?.count) <= 1)
            throw new IdentityError("LAST_OPERATOR");
        }
        const changed = await client.query(
          "UPDATE business.user_access SET state = $2, authz_version = authz_version + 1, updated_at = now() WHERE user_id = $1",
          [targetId, suspended ? "SUSPENDED" : "ACTIVE"],
        );
        if (changed.rowCount !== 1) throw new IdentityError("ACCESS_DENIED");
        await client.query(
          "INSERT INTO business.identity_event (actor_id, target_id, kind) VALUES ($1, $2, $3)",
          [
            actorId,
            targetId,
            suspended ? "USER_SUSPENDED" : "USER_REACTIVATED",
          ],
        );
        await this.sessions.revokeAll(targetId);
      }),
    );
  }
}
