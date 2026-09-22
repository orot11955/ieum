CREATE TABLE publication_channel(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspace(id),name text NOT NULL DEFAULT '기본 블로그',active boolean NOT NULL DEFAULT true,delivery_blocked boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),UNIQUE(workspace_id));
-- statement-breakpoint
CREATE TABLE publication(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,channel_id uuid NOT NULL,document_id uuid NOT NULL,current_revision integer,status text NOT NULL DEFAULT 'WITHDRAWN' CHECK(status IN ('PUBLISHED','WITHDRAWN')),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),UNIQUE(workspace_id,id,document_id,channel_id),UNIQUE(workspace_id,channel_id,document_id),FOREIGN KEY(workspace_id,document_id) REFERENCES document(workspace_id,id),FOREIGN KEY(workspace_id,channel_id) REFERENCES publication_channel(workspace_id,id),CHECK(status<>'PUBLISHED' OR current_revision IS NOT NULL));
-- statement-breakpoint
CREATE TABLE publication_revision(workspace_id uuid NOT NULL,publication_id uuid NOT NULL,revision integer NOT NULL,channel_id uuid NOT NULL,document_id uuid NOT NULL,document_revision integer NOT NULL,review_id uuid NOT NULL,manifest_hash text NOT NULL,title text NOT NULL,body text NOT NULL,summary text NOT NULL,author text NOT NULL,tags jsonb NOT NULL,sources jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,publication_id,revision),UNIQUE(workspace_id,publication_id,document_id,channel_id,revision),FOREIGN KEY(workspace_id,publication_id,document_id,channel_id) REFERENCES publication(workspace_id,id,document_id,channel_id),FOREIGN KEY(workspace_id,document_id,document_revision,review_id,manifest_hash) REFERENCES document_review(workspace_id,document_id,document_revision,id,manifest_hash));
-- statement-breakpoint
ALTER TABLE publication ADD CONSTRAINT publication_current_revision FOREIGN KEY(workspace_id,id,document_id,channel_id,current_revision) REFERENCES publication_revision(workspace_id,publication_id,document_id,channel_id,revision) DEFERRABLE INITIALLY DEFERRED;
-- statement-breakpoint
CREATE TABLE publication_slug(workspace_id uuid NOT NULL,channel_id uuid NOT NULL,slug text NOT NULL,publication_id uuid NOT NULL,is_current boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,channel_id,slug),FOREIGN KEY(workspace_id,channel_id) REFERENCES publication_channel(workspace_id,id),FOREIGN KEY(workspace_id,publication_id) REFERENCES publication(workspace_id,id));
-- statement-breakpoint
CREATE UNIQUE INDEX publication_one_current_slug ON publication_slug(workspace_id,publication_id) WHERE is_current;
-- statement-breakpoint
CREATE TABLE delivery_client(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,channel_id uuid NOT NULL,name text NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,channel_id) REFERENCES publication_channel(workspace_id,id));
-- statement-breakpoint
CREATE TABLE delivery_key(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,client_id uuid NOT NULL,key_digest text NOT NULL UNIQUE,prefix text NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz,last_used_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(workspace_id,client_id) REFERENCES delivery_client(workspace_id,id));
-- statement-breakpoint
ALTER TABLE publication_channel ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE publication_channel FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY publication_channel_workspace ON publication_channel TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON publication_channel TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX publication_channel_scope ON publication_channel(workspace_id);
-- statement-breakpoint
ALTER TABLE publication ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE publication FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY publication_workspace ON publication TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON publication TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX publication_scope ON publication(workspace_id);
-- statement-breakpoint
ALTER TABLE publication_revision ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE publication_revision FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY publication_revision_workspace ON publication_revision TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT ON publication_revision TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX publication_revision_scope ON publication_revision(workspace_id);
-- statement-breakpoint
ALTER TABLE publication_slug ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE publication_slug FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY publication_slug_workspace ON publication_slug TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON publication_slug TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX publication_slug_scope ON publication_slug(workspace_id);
-- statement-breakpoint
ALTER TABLE delivery_client ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE delivery_client FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY delivery_client_workspace ON delivery_client TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON delivery_client TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX delivery_client_scope ON delivery_client(workspace_id);
-- statement-breakpoint
ALTER TABLE delivery_key ENABLE ROW LEVEL SECURITY;
-- statement-breakpoint
ALTER TABLE delivery_key FORCE ROW LEVEL SECURITY;
-- statement-breakpoint
CREATE POLICY delivery_key_workspace ON delivery_key TO ieum_scoped USING(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=nullif(current_setting('ieum.workspace_id',true),'')::uuid);
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON delivery_key TO ieum_scoped;
-- statement-breakpoint
CREATE INDEX delivery_key_scope ON delivery_key(workspace_id);
-- statement-breakpoint
CREATE POLICY publication_channel_runtime ON publication_channel TO ieum_runtime USING(true) WITH CHECK(true);
-- statement-breakpoint
GRANT SELECT ON publication_channel TO ieum_runtime;
-- statement-breakpoint
CREATE POLICY delivery_client_runtime ON delivery_client TO ieum_runtime USING(true) WITH CHECK(true);
-- statement-breakpoint
GRANT SELECT ON delivery_client TO ieum_runtime;
-- statement-breakpoint
CREATE POLICY delivery_key_runtime ON delivery_key TO ieum_runtime USING(true) WITH CHECK(true);
-- statement-breakpoint
GRANT SELECT ON delivery_key TO ieum_runtime;
-- statement-breakpoint
GRANT UPDATE(last_used_at) ON delivery_key TO ieum_runtime;
-- statement-breakpoint
CREATE VIEW public_delivery WITH (security_barrier=true) AS
SELECT p.id,p.channel_id,p.current_revision AS revision,r.title,r.body,r.summary,r.author,r.tags,r.sources,s.slug,p.created_at AS published_at,p.updated_at
FROM publication p JOIN publication_revision r ON r.workspace_id=p.workspace_id AND r.publication_id=p.id AND r.revision=p.current_revision
JOIN publication_channel c ON c.workspace_id=p.workspace_id AND c.id=p.channel_id
JOIN publication_slug s ON s.workspace_id=p.workspace_id AND s.publication_id=p.id AND s.is_current
WHERE p.status='PUBLISHED' AND c.active AND NOT c.delivery_blocked;
-- statement-breakpoint
GRANT SELECT ON public_delivery TO ieum_runtime;
