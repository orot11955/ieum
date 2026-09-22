CREATE TABLE source(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspace(id),title text NOT NULL,version integer NOT NULL DEFAULT 1 CHECK(version>0),created_by text NOT NULL REFERENCES auth_user(id),created_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,UNIQUE(workspace_id,id));
-- statement-breakpoint
CREATE TABLE source_revision(workspace_id uuid NOT NULL,source_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),url text,author text NOT NULL DEFAULT '',excerpt text NOT NULL DEFAULT '',interpretation text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,source_id,revision),FOREIGN KEY(workspace_id,source_id) REFERENCES source(workspace_id,id));
-- statement-breakpoint
CREATE TABLE capture(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspace(id),title text NOT NULL,kind text NOT NULL CHECK(kind IN ('NOTE','EXPERIENCE','KNOWLEDGE','QUESTION','RESULT')),version integer NOT NULL DEFAULT 1 CHECK(version>0),created_by text NOT NULL REFERENCES auth_user(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,UNIQUE(workspace_id,id));
-- statement-breakpoint
CREATE TABLE capture_revision(workspace_id uuid NOT NULL,capture_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),body text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,capture_id,revision),FOREIGN KEY(workspace_id,capture_id) REFERENCES capture(workspace_id,id));
-- statement-breakpoint
ALTER TABLE capture ADD CONSTRAINT capture_current_revision FOREIGN KEY(workspace_id,id,version) REFERENCES capture_revision(workspace_id,capture_id,revision) DEFERRABLE INITIALLY DEFERRED;
-- statement-breakpoint
CREATE TABLE thought_unit(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,capture_id uuid NOT NULL,UNIQUE(workspace_id,id),UNIQUE(workspace_id,id,capture_id),FOREIGN KEY(workspace_id,capture_id) REFERENCES capture(workspace_id,id));
-- statement-breakpoint
CREATE TABLE unit_revision(workspace_id uuid NOT NULL,unit_id uuid NOT NULL,revision integer NOT NULL,capture_id uuid NOT NULL,capture_revision integer NOT NULL,start_offset integer NOT NULL CHECK(start_offset>=0),end_offset integer NOT NULL CHECK(end_offset>=start_offset),text text NOT NULL,PRIMARY KEY(workspace_id,unit_id,revision),FOREIGN KEY(workspace_id,unit_id,capture_id) REFERENCES thought_unit(workspace_id,id,capture_id),FOREIGN KEY(workspace_id,capture_id,capture_revision) REFERENCES capture_revision(workspace_id,capture_id,revision));
-- statement-breakpoint
CREATE TABLE capture_source(workspace_id uuid NOT NULL,capture_id uuid NOT NULL,source_id uuid NOT NULL,source_revision integer NOT NULL,PRIMARY KEY(workspace_id,capture_id,source_id),FOREIGN KEY(workspace_id,capture_id) REFERENCES capture(workspace_id,id),FOREIGN KEY(workspace_id,source_id,source_revision) REFERENCES source_revision(workspace_id,source_id,revision));
-- statement-breakpoint
CREATE TABLE context(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspace(id),name text NOT NULL,purpose text NOT NULL,kind text NOT NULL CHECK(kind IN ('TOPIC','FLOW','PROJECT','COLLECTION')),version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,UNIQUE(workspace_id,id));
-- statement-breakpoint
CREATE TABLE context_membership(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,unit_id uuid NOT NULL,context_id uuid NOT NULL,role text NOT NULL CHECK(role IN ('PRIMARY','SECONDARY')),created_at timestamptz NOT NULL DEFAULT now(),ended_at timestamptz,FOREIGN KEY(workspace_id,unit_id) REFERENCES thought_unit(workspace_id,id),FOREIGN KEY(workspace_id,context_id) REFERENCES context(workspace_id,id));
-- statement-breakpoint
CREATE UNIQUE INDEX one_active_unit_context ON context_membership(workspace_id,unit_id,context_id) WHERE ended_at IS NULL;
-- statement-breakpoint
CREATE UNIQUE INDEX one_active_primary ON context_membership(workspace_id,unit_id) WHERE ended_at IS NULL AND role='PRIMARY';
-- statement-breakpoint
CREATE TABLE task(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspace(id),title text NOT NULL,description text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO','IN_PROGRESS','DONE','CANCELED')),due_kind text NOT NULL DEFAULT 'NONE' CHECK(due_kind IN ('NONE','DATE','TIMED')),due_date date,due_at timestamptz,time_zone text,completed_at timestamptz,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,UNIQUE(workspace_id,id),CHECK((due_kind='NONE' AND due_date IS NULL AND due_at IS NULL AND time_zone IS NULL) OR (due_kind='DATE' AND due_date IS NOT NULL AND due_at IS NULL AND time_zone IS NULL) OR (due_kind='TIMED' AND due_date IS NULL AND due_at IS NOT NULL AND time_zone IS NOT NULL)),CHECK((status='DONE')=(completed_at IS NOT NULL)));
-- statement-breakpoint
CREATE TABLE task_result(workspace_id uuid NOT NULL,task_id uuid NOT NULL,capture_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,task_id,capture_id),FOREIGN KEY(workspace_id,task_id) REFERENCES task(workspace_id,id),FOREIGN KEY(workspace_id,capture_id) REFERENCES capture(workspace_id,id));
-- statement-breakpoint
CREATE TABLE calendar_event(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspace(id),title text NOT NULL,kind text NOT NULL CHECK(kind IN ('TIMED','ALL_DAY')),starts_at timestamptz,ends_at timestamptz,time_zone text,start_date date,end_date date,status text NOT NULL DEFAULT 'CONFIRMED' CHECK(status IN ('CONFIRMED','CANCELED')),version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,UNIQUE(workspace_id,id),CHECK((kind='TIMED' AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at>starts_at AND time_zone IS NOT NULL AND start_date IS NULL AND end_date IS NULL) OR (kind='ALL_DAY' AND starts_at IS NULL AND ends_at IS NULL AND time_zone IS NULL AND start_date IS NOT NULL AND end_date IS NOT NULL AND end_date>start_date)));
-- statement-breakpoint
CREATE TABLE task_event(workspace_id uuid NOT NULL,task_id uuid NOT NULL,event_id uuid NOT NULL,PRIMARY KEY(workspace_id,task_id,event_id),FOREIGN KEY(workspace_id,task_id) REFERENCES task(workspace_id,id),FOREIGN KEY(workspace_id,event_id) REFERENCES calendar_event(workspace_id,id));
-- statement-breakpoint
CREATE TABLE tag(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspace(id),name text NOT NULL,UNIQUE(workspace_id,id),UNIQUE(workspace_id,name));
-- statement-breakpoint
CREATE TABLE capture_tag(workspace_id uuid NOT NULL,capture_id uuid NOT NULL,tag_id uuid NOT NULL,PRIMARY KEY(workspace_id,capture_id,tag_id),FOREIGN KEY(workspace_id,capture_id) REFERENCES capture(workspace_id,id),FOREIGN KEY(workspace_id,tag_id) REFERENCES tag(workspace_id,id));
-- statement-breakpoint
CREATE TABLE task_tag(workspace_id uuid NOT NULL,task_id uuid NOT NULL,tag_id uuid NOT NULL,PRIMARY KEY(workspace_id,task_id,tag_id),FOREIGN KEY(workspace_id,task_id) REFERENCES task(workspace_id,id),FOREIGN KEY(workspace_id,tag_id) REFERENCES tag(workspace_id,id));
-- statement-breakpoint
CREATE TABLE task_context(workspace_id uuid NOT NULL,task_id uuid NOT NULL,context_id uuid NOT NULL,PRIMARY KEY(workspace_id,task_id,context_id),FOREIGN KEY(workspace_id,task_id) REFERENCES task(workspace_id,id),FOREIGN KEY(workspace_id,context_id) REFERENCES context(workspace_id,id));
-- statement-breakpoint
CREATE TABLE event_context(workspace_id uuid NOT NULL,event_id uuid NOT NULL,context_id uuid NOT NULL,PRIMARY KEY(workspace_id,event_id,context_id),FOREIGN KEY(workspace_id,event_id) REFERENCES calendar_event(workspace_id,id),FOREIGN KEY(workspace_id,context_id) REFERENCES context(workspace_id,id));
-- statement-breakpoint
CREATE TABLE audit_event(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspace(id),actor_id text NOT NULL,action text NOT NULL,target_type text NOT NULL,target_id text NOT NULL,version integer,command_id uuid,created_at timestamptz NOT NULL DEFAULT now());
-- statement-breakpoint
CREATE TABLE command_receipt(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspace(id),actor_id text NOT NULL,action text NOT NULL,idempotency_key text NOT NULL,request_hash text NOT NULL,response jsonb,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,actor_id,action,idempotency_key));
-- statement-breakpoint
CREATE TABLE judgement_run(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspace(id),capture_id uuid NOT NULL,capture_revision integer NOT NULL,config_version text NOT NULL,snapshot jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,capture_id,capture_revision) REFERENCES capture_revision(workspace_id,capture_id,revision));
-- statement-breakpoint
CREATE TABLE proposal(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,run_id uuid NOT NULL,capture_id uuid NOT NULL,capture_revision integer NOT NULL,context_id uuid NOT NULL,context_version integer NOT NULL,state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','ACCEPTED','REJECTED','DISMISSED','STALE')),score double precision NOT NULL CHECK(score>=0 AND score<=1),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),UNIQUE(workspace_id,run_id,context_id),FOREIGN KEY(workspace_id,run_id) REFERENCES judgement_run(workspace_id,id),FOREIGN KEY(workspace_id,capture_id,capture_revision) REFERENCES capture_revision(workspace_id,capture_id,revision),FOREIGN KEY(workspace_id,context_id) REFERENCES context(workspace_id,id));
-- statement-breakpoint
CREATE TABLE feedback(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,proposal_id uuid NOT NULL,actor_id text NOT NULL,action text NOT NULL CHECK(action IN ('ACCEPT','REJECT','DISMISS')),created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(workspace_id,proposal_id) REFERENCES proposal(workspace_id,id));
-- statement-breakpoint
ALTER TABLE source ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE source FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY source_workspace ON source TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON source TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX source_scope ON source(workspace_id);
-- statement-breakpoint
ALTER TABLE source_revision ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE source_revision FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY source_revision_workspace ON source_revision TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT ON source_revision TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX source_revision_scope ON source_revision(workspace_id);
-- statement-breakpoint
ALTER TABLE capture ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE capture FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY capture_workspace ON capture TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON capture TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX capture_scope ON capture(workspace_id);
-- statement-breakpoint
ALTER TABLE capture_revision ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE capture_revision FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY capture_revision_workspace ON capture_revision TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT ON capture_revision TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX capture_revision_scope ON capture_revision(workspace_id);
-- statement-breakpoint
ALTER TABLE thought_unit ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE thought_unit FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY thought_unit_workspace ON thought_unit TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON thought_unit TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX thought_unit_scope ON thought_unit(workspace_id);
-- statement-breakpoint
ALTER TABLE unit_revision ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE unit_revision FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY unit_revision_workspace ON unit_revision TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT ON unit_revision TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX unit_revision_scope ON unit_revision(workspace_id);
-- statement-breakpoint
ALTER TABLE capture_source ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE capture_source FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY capture_source_workspace ON capture_source TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON capture_source TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX capture_source_scope ON capture_source(workspace_id);
-- statement-breakpoint
ALTER TABLE context ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE context FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY context_workspace ON context TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON context TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX context_scope ON context(workspace_id);
-- statement-breakpoint
ALTER TABLE context_membership ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE context_membership FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY context_membership_workspace ON context_membership TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON context_membership TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX context_membership_scope ON context_membership(workspace_id);
-- statement-breakpoint
ALTER TABLE task ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE task FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY task_workspace ON task TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON task TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX task_scope ON task(workspace_id);
-- statement-breakpoint
ALTER TABLE task_result ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE task_result FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY task_result_workspace ON task_result TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON task_result TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX task_result_scope ON task_result(workspace_id);
-- statement-breakpoint
ALTER TABLE calendar_event ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE calendar_event FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY calendar_event_workspace ON calendar_event TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON calendar_event TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX calendar_event_scope ON calendar_event(workspace_id);
-- statement-breakpoint
ALTER TABLE task_event ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE task_event FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY task_event_workspace ON task_event TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON task_event TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX task_event_scope ON task_event(workspace_id);
-- statement-breakpoint
ALTER TABLE tag ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE tag FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY tag_workspace ON tag TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON tag TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX tag_scope ON tag(workspace_id);
-- statement-breakpoint
ALTER TABLE capture_tag ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE capture_tag FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY capture_tag_workspace ON capture_tag TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON capture_tag TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX capture_tag_scope ON capture_tag(workspace_id);
-- statement-breakpoint
ALTER TABLE task_tag ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE task_tag FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY task_tag_workspace ON task_tag TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON task_tag TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX task_tag_scope ON task_tag(workspace_id);
-- statement-breakpoint
ALTER TABLE task_context ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE task_context FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY task_context_workspace ON task_context TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON task_context TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX task_context_scope ON task_context(workspace_id);
-- statement-breakpoint
ALTER TABLE event_context ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE event_context FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY event_context_workspace ON event_context TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON event_context TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX event_context_scope ON event_context(workspace_id);
-- statement-breakpoint
ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE audit_event FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY audit_event_workspace ON audit_event TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT ON audit_event TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX audit_event_scope ON audit_event(workspace_id);
-- statement-breakpoint
ALTER TABLE command_receipt ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE command_receipt FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY command_receipt_workspace ON command_receipt TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON command_receipt TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX command_receipt_scope ON command_receipt(workspace_id);
-- statement-breakpoint
ALTER TABLE judgement_run ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE judgement_run FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY judgement_run_workspace ON judgement_run TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT ON judgement_run TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX judgement_run_scope ON judgement_run(workspace_id);
-- statement-breakpoint
ALTER TABLE proposal ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE proposal FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY proposal_workspace ON proposal TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON proposal TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX proposal_scope ON proposal(workspace_id);
-- statement-breakpoint
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE feedback FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY feedback_workspace ON feedback TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT ON feedback TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX feedback_scope ON feedback(workspace_id);
-- statement-breakpoint
GRANT SELECT(id,status) ON auth_user TO ieum_scoped;
-- statement-breakpoint
GRANT SELECT ON workspace_member,app_session_state TO ieum_scoped;
