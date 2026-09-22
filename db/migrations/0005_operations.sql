CREATE TABLE asset(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspace(id),name text NOT NULL,media_type text NOT NULL CHECK(media_type IN ('text/plain','text/markdown')),size_bytes integer NOT NULL CHECK(size_bytes>=0 AND size_bytes<=1048576),checksum text NOT NULL,storage_key uuid NOT NULL UNIQUE,state text NOT NULL DEFAULT 'VERIFIED' CHECK(state IN ('VERIFIED','TRASHED')),created_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,UNIQUE(workspace_id,id));
-- statement-breakpoint
CREATE TABLE document_asset(workspace_id uuid NOT NULL,document_id uuid NOT NULL,asset_id uuid NOT NULL,PRIMARY KEY(workspace_id,document_id,asset_id),FOREIGN KEY(workspace_id,document_id) REFERENCES document(workspace_id,id),FOREIGN KEY(workspace_id,asset_id) REFERENCES asset(workspace_id,id));
-- statement-breakpoint
CREATE TABLE job(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspace(id),actor_id text NOT NULL,kind text NOT NULL CHECK(kind IN ('EXPORT','REBUILD_PROFILE')),state text NOT NULL DEFAULT 'QUEUED' CHECK(state IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELED')),attempt integer NOT NULL DEFAULT 0,lease_token uuid,lease_until timestamptz,error_code text,result_key text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id));
-- statement-breakpoint
CREATE TABLE job_attempt(workspace_id uuid NOT NULL,job_id uuid NOT NULL,attempt integer NOT NULL,lease_token uuid NOT NULL,state text NOT NULL,started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,error_code text,PRIMARY KEY(workspace_id,job_id,attempt),FOREIGN KEY(workspace_id,job_id) REFERENCES job(workspace_id,id));
-- statement-breakpoint
CREATE TABLE notification(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,user_id text NOT NULL,title text NOT NULL,job_id uuid,read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,user_id) REFERENCES workspace_member(workspace_id,user_id),FOREIGN KEY(workspace_id,job_id) REFERENCES job(workspace_id,id),UNIQUE(job_id,user_id));
-- statement-breakpoint
CREATE TABLE data_transfer(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspace(id),actor_id text NOT NULL,manifest_hash text NOT NULL,payload jsonb NOT NULL,state text NOT NULL DEFAULT 'PREVIEW' CHECK(state IN ('PREVIEW','APPLIED','EXPIRED')),created_at timestamptz NOT NULL DEFAULT now(),applied_at timestamptz,UNIQUE(workspace_id,id));
-- statement-breakpoint
ALTER TABLE asset ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE asset FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY asset_workspace ON asset TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON asset TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX asset_scope ON asset(workspace_id);
-- statement-breakpoint
ALTER TABLE document_asset ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE document_asset FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY document_asset_workspace ON document_asset TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON document_asset TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX document_asset_scope ON document_asset(workspace_id);
-- statement-breakpoint
ALTER TABLE job ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE job FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY job_workspace ON job TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON job TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX job_scope ON job(workspace_id);
-- statement-breakpoint
ALTER TABLE job_attempt ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE job_attempt FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY job_attempt_workspace ON job_attempt TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON job_attempt TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX job_attempt_scope ON job_attempt(workspace_id);
-- statement-breakpoint
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE notification FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY notification_workspace ON notification TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON notification TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX notification_scope ON notification(workspace_id);
-- statement-breakpoint
ALTER TABLE data_transfer ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE data_transfer FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY data_transfer_workspace ON data_transfer TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON data_transfer TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX data_transfer_scope ON data_transfer(workspace_id);
-- statement-breakpoint
CREATE POLICY job_runtime ON job TO ieum_runtime USING(true) WITH CHECK(true);
-- statement-breakpoint
GRANT SELECT ON job TO ieum_runtime;
