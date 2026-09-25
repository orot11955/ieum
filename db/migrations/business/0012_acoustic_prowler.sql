CREATE TABLE "business"."document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"state" text DEFAULT 'ACTIVE' NOT NULL,
	"latest_revision" integer DEFAULT 0 NOT NULL,
	"link_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "document_kind_check" CHECK ("business"."document"."kind" IN ('WIKI','ARTICLE','NOTE')),
	CONSTRAINT "document_title_check" CHECK (length(trim("business"."document"."title")) BETWEEN 1 AND 300),
	CONSTRAINT "document_state_check" CHECK ("business"."document"."state" IN ('ACTIVE','ARCHIVED')),
	CONSTRAINT "document_revisions_check" CHECK ("business"."document"."latest_revision" >= 0 AND "business"."document"."link_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "business"."document_draft" (
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_draft_pk" PRIMARY KEY("workspace_id","document_id"),
	CONSTRAINT "document_draft_version_positive" CHECK ("business"."document_draft"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "business"."document_link" (
	"workspace_id" uuid NOT NULL,
	"from_document_id" uuid NOT NULL,
	"to_document_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_link_pk" PRIMARY KEY("workspace_id","from_document_id","to_document_id"),
	CONSTRAINT "document_link_not_self" CHECK ("business"."document_link"."from_document_id" <> "business"."document_link"."to_document_id")
);
--> statement-breakpoint
CREATE TABLE "business"."document_revision" (
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"draft_version" integer,
	"restored_from_revision" integer,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_revision_pk" PRIMARY KEY("workspace_id","document_id","revision"),
	CONSTRAINT "document_revision_positive" CHECK ("business"."document_revision"."revision" > 0),
	CONSTRAINT "document_revision_hash_length" CHECK (length("business"."document_revision"."content_hash") = 64),
	CONSTRAINT "document_revision_draft_positive" CHECK ("business"."document_revision"."draft_version" IS NULL OR "business"."document_revision"."draft_version" > 0),
	CONSTRAINT "document_revision_origin_check" CHECK (("business"."document_revision"."draft_version" IS NULL) <> ("business"."document_revision"."restored_from_revision" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "business"."document_draft" ADD CONSTRAINT "document_draft_document_fk" FOREIGN KEY ("workspace_id","document_id") REFERENCES "business"."document"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."document_link" ADD CONSTRAINT "document_link_from_fk" FOREIGN KEY ("workspace_id","from_document_id") REFERENCES "business"."document"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."document_link" ADD CONSTRAINT "document_link_to_fk" FOREIGN KEY ("workspace_id","to_document_id") REFERENCES "business"."document"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."document_revision" ADD CONSTRAINT "document_revision_document_fk" FOREIGN KEY ("workspace_id","document_id") REFERENCES "business"."document"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."document_revision" ADD CONSTRAINT "document_revision_restore_fk" FOREIGN KEY ("workspace_id","document_id","restored_from_revision") REFERENCES "business"."document_revision"("workspace_id","document_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_workspace_kind_updated_idx" ON "business"."document" USING btree ("workspace_id","kind","updated_at");
--> statement-breakpoint
ALTER TABLE "business"."document" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."document_draft" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."document_revision" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."document_link" OWNER TO "ieum_migrator";
--> statement-breakpoint
REVOKE ALL ON "business"."document", "business"."document_draft", "business"."document_revision", "business"."document_link" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON "business"."document", "business"."document_draft", "business"."document_revision", "business"."document_link" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (title,state,latest_revision,link_version,updated_at) ON "business"."document" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (version,content,updated_at) ON "business"."document_draft" TO "ieum_application";
--> statement-breakpoint
GRANT DELETE ON "business"."document_link" TO "ieum_application";
--> statement-breakpoint
ALTER TABLE "business"."document" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."document" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "document_scope" ON "business"."document" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."document_draft" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."document_draft" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "document_draft_scope" ON "business"."document_draft" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."document_revision" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."document_revision" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "document_revision_scope" ON "business"."document_revision" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."document_link" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."document_link" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "document_link_scope" ON "business"."document_link" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
