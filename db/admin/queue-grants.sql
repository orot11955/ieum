-- Run after pg-boss schema installation/migration using the separate migration credential.
-- The runtime role can enqueue and work, but cannot mutate the queue schema.
GRANT USAGE ON SCHEMA pgboss TO ieum_job_relay;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO ieum_job_relay;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA pgboss TO ieum_job_relay;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO ieum_job_relay;
