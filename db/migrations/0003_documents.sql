CREATE TABLE document(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspace(id),kind text NOT NULL CHECK(kind IN ('WIKI','ARTICLE','NOTE')),title text NOT NULL,current_revision integer,created_by text NOT NULL REFERENCES auth_user(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,UNIQUE(workspace_id,id));
-- statement-breakpoint
CREATE TABLE document_draft(workspace_id uuid NOT NULL,document_id uuid NOT NULL,title text NOT NULL,body text NOT NULL DEFAULT '',version integer NOT NULL DEFAULT 1 CHECK(version>0),sources jsonb NOT NULL DEFAULT '[]',public_meta jsonb NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,document_id),FOREIGN KEY(workspace_id,document_id) REFERENCES document(workspace_id,id));
-- statement-breakpoint
CREATE TABLE document_revision(workspace_id uuid NOT NULL,document_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),title text NOT NULL,body text NOT NULL,public_meta jsonb NOT NULL,sources jsonb NOT NULL,manifest_hash text NOT NULL,created_by text NOT NULL REFERENCES auth_user(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,document_id,revision),UNIQUE(workspace_id,document_id,revision,manifest_hash),FOREIGN KEY(workspace_id,document_id) REFERENCES document(workspace_id,id));
-- statement-breakpoint
ALTER TABLE document ADD CONSTRAINT document_current_revision FOREIGN KEY(workspace_id,id,current_revision) REFERENCES document_revision(workspace_id,document_id,revision) DEFERRABLE INITIALLY DEFERRED;
-- statement-breakpoint
CREATE TABLE document_evidence(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,document_id uuid NOT NULL,document_revision integer NOT NULL,unit_id uuid,unit_revision integer,source_id uuid,source_revision integer,source_document_id uuid,source_document_revision integer,claim text NOT NULL DEFAULT '',relation text NOT NULL DEFAULT 'RELATED',FOREIGN KEY(workspace_id,document_id,document_revision) REFERENCES document_revision(workspace_id,document_id,revision),FOREIGN KEY(workspace_id,unit_id,unit_revision) REFERENCES unit_revision(workspace_id,unit_id,revision),FOREIGN KEY(workspace_id,source_id,source_revision) REFERENCES source_revision(workspace_id,source_id,revision),FOREIGN KEY(workspace_id,source_document_id,source_document_revision) REFERENCES document_revision(workspace_id,document_id,revision),CHECK(num_nonnulls(unit_id,source_id,source_document_id)=1),CHECK((unit_id IS NULL)=(unit_revision IS NULL)),CHECK((source_id IS NULL)=(source_revision IS NULL)),CHECK((source_document_id IS NULL)=(source_document_revision IS NULL)));
-- statement-breakpoint
CREATE TABLE document_review(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,document_id uuid NOT NULL,document_revision integer NOT NULL,manifest_hash text NOT NULL,review_no integer NOT NULL,decision text NOT NULL CHECK(decision IN ('READY','CHANGES_REQUIRED')),reviewer_id text NOT NULL REFERENCES auth_user(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,document_id,document_revision,review_no),UNIQUE(workspace_id,document_id,document_revision,id,manifest_hash),FOREIGN KEY(workspace_id,document_id,document_revision,manifest_hash) REFERENCES document_revision(workspace_id,document_id,revision,manifest_hash));
-- statement-breakpoint
CREATE TABLE document_context(workspace_id uuid NOT NULL,document_id uuid NOT NULL,context_id uuid NOT NULL,PRIMARY KEY(workspace_id,document_id,context_id),FOREIGN KEY(workspace_id,document_id) REFERENCES document(workspace_id,id),FOREIGN KEY(workspace_id,context_id) REFERENCES context(workspace_id,id));
-- statement-breakpoint
CREATE TABLE document_tag(workspace_id uuid NOT NULL,document_id uuid NOT NULL,tag_id uuid NOT NULL,PRIMARY KEY(workspace_id,document_id,tag_id),FOREIGN KEY(workspace_id,document_id) REFERENCES document(workspace_id,id),FOREIGN KEY(workspace_id,tag_id) REFERENCES tag(workspace_id,id));
-- statement-breakpoint
CREATE TABLE document_link(workspace_id uuid NOT NULL,from_document_id uuid NOT NULL,to_document_id uuid NOT NULL,PRIMARY KEY(workspace_id,from_document_id,to_document_id),FOREIGN KEY(workspace_id,from_document_id) REFERENCES document(workspace_id,id),FOREIGN KEY(workspace_id,to_document_id) REFERENCES document(workspace_id,id),CHECK(from_document_id<>to_document_id));
-- statement-breakpoint
CREATE TABLE task_origin(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,task_id uuid NOT NULL,unit_id uuid,unit_revision integer,document_id uuid,document_revision integer,FOREIGN KEY(workspace_id,task_id) REFERENCES task(workspace_id,id),FOREIGN KEY(workspace_id,unit_id,unit_revision) REFERENCES unit_revision(workspace_id,unit_id,revision),FOREIGN KEY(workspace_id,document_id,document_revision) REFERENCES document_revision(workspace_id,document_id,revision),CHECK(num_nonnulls(unit_id,document_id)=1),CHECK((unit_id IS NULL)=(unit_revision IS NULL)),CHECK((document_id IS NULL)=(document_revision IS NULL)));
-- statement-breakpoint
CREATE TABLE event_origin(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,event_id uuid NOT NULL,unit_id uuid,unit_revision integer,document_id uuid,document_revision integer,FOREIGN KEY(workspace_id,event_id) REFERENCES calendar_event(workspace_id,id),FOREIGN KEY(workspace_id,unit_id,unit_revision) REFERENCES unit_revision(workspace_id,unit_id,revision),FOREIGN KEY(workspace_id,document_id,document_revision) REFERENCES document_revision(workspace_id,document_id,revision),CHECK(num_nonnulls(unit_id,document_id)=1),CHECK((unit_id IS NULL)=(unit_revision IS NULL)),CHECK((document_id IS NULL)=(document_revision IS NULL)));
-- statement-breakpoint
ALTER TABLE document ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE document FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY document_workspace ON document TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON document TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX document_scope ON document(workspace_id);
-- statement-breakpoint
ALTER TABLE document_draft ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE document_draft FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY document_draft_workspace ON document_draft TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON document_draft TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX document_draft_scope ON document_draft(workspace_id);
-- statement-breakpoint
ALTER TABLE document_revision ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE document_revision FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY document_revision_workspace ON document_revision TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT ON document_revision TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX document_revision_scope ON document_revision(workspace_id);
-- statement-breakpoint
ALTER TABLE document_evidence ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE document_evidence FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY document_evidence_workspace ON document_evidence TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT ON document_evidence TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX document_evidence_scope ON document_evidence(workspace_id);
-- statement-breakpoint
ALTER TABLE document_review ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE document_review FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY document_review_workspace ON document_review TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT ON document_review TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX document_review_scope ON document_review(workspace_id);
-- statement-breakpoint
ALTER TABLE document_context ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE document_context FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY document_context_workspace ON document_context TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON document_context TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX document_context_scope ON document_context(workspace_id);
-- statement-breakpoint
ALTER TABLE document_tag ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE document_tag FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY document_tag_workspace ON document_tag TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON document_tag TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX document_tag_scope ON document_tag(workspace_id);
-- statement-breakpoint
ALTER TABLE document_link ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE document_link FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY document_link_workspace ON document_link TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON document_link TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX document_link_scope ON document_link(workspace_id);
-- statement-breakpoint
ALTER TABLE task_origin ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE task_origin FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY task_origin_workspace ON task_origin TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON task_origin TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX task_origin_scope ON task_origin(workspace_id);
-- statement-breakpoint
ALTER TABLE event_origin ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE event_origin FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY event_origin_workspace ON event_origin TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON event_origin TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX event_origin_scope ON event_origin(workspace_id);
