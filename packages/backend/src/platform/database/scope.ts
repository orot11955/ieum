import type { Pool, PoolClient } from "pg";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Reject a deployment URL that bypasses or owns the RLS-protected business tables. */
export async function assertApplicationDatabaseRole(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{
    rolsuper: boolean;
    rolbypassrls: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolreplication: boolean;
    application_member: boolean;
    migrator_member: boolean;
    auth_member: boolean;
    relay_member: boolean;
    owns_business: boolean;
    auth_usage: boolean;
    queue_usage: boolean;
    can_set_dangerous_role: boolean;
  }>(`SELECT r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolreplication,
       pg_has_role(current_user, 'ieum_application', 'USAGE') AS application_member,
       pg_has_role(current_user, 'ieum_migrator', 'MEMBER') AS migrator_member,
       pg_has_role(current_user, 'ieum_auth_runtime', 'MEMBER') AS auth_member,
       pg_has_role(current_user, 'ieum_job_relay', 'MEMBER') AS relay_member,
       EXISTS (
         SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'business' AND c.relkind = 'r' AND c.relowner = r.oid
       ) AS owns_business,
       has_schema_privilege(current_user, 'auth', 'USAGE') AS auth_usage,
       CASE WHEN to_regnamespace('pgboss') IS NULL THEN false
            ELSE has_schema_privilege(current_user, 'pgboss', 'USAGE') END AS queue_usage,
       EXISTS (
         SELECT 1 FROM pg_roles target
         WHERE pg_has_role(current_user, target.oid, 'SET')
           AND (
             target.rolsuper OR target.rolbypassrls OR target.rolcreatedb
             OR target.rolcreaterole OR target.rolreplication
             OR EXISTS (
               SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname IN ('business', 'pgboss') AND c.relkind = 'r' AND c.relowner = target.oid
             )
           )
       ) AS can_set_dangerous_role
       FROM pg_roles r WHERE r.rolname = current_user`);
  const role = rows[0];
  if (
    !role ||
    role.rolsuper ||
    role.rolbypassrls ||
    role.rolcreatedb ||
    role.rolcreaterole ||
    role.rolreplication ||
    !role.application_member ||
    role.migrator_member ||
    role.auth_member ||
    role.relay_member ||
    role.owns_business ||
    role.auth_usage ||
    role.queue_usage ||
    role.can_set_dangerous_role
  ) {
    throw new Error("Application database role is not isolated");
  }
}

/** Pins one workspace to one transaction and releases the connection after commit or rollback. */
export async function withWorkspaceTransaction<T>(
  pool: Pool,
  workspaceId: string,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!UUID.test(workspaceId)) throw new Error("Invalid workspace ID");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('ieum.workspace_id', $1, true)", [
      workspaceId,
    ]);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
