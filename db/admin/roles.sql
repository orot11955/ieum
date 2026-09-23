-- Run as a database administrator after the auth migration and before business migrations.
-- These NOLOGIN roles are privilege groups; deployment credentials are provisioned separately.
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'ieum_migrator',
    'ieum_auth_runtime',
    'ieum_application',
    'ieum_delivery',
    'ieum_job_relay'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
        role_name
      );
    ELSIF EXISTS (
      SELECT 1 FROM pg_roles
      WHERE rolname = role_name
        AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
    ) THEN
      RAISE EXCEPTION 'IEUM privilege role % has unexpected capabilities', role_name;
    END IF;
  END LOOP;
END $$;
