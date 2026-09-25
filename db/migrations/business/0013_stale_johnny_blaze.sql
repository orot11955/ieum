CREATE TABLE "business"."document_workbench" (
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"current_revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_workbench_pk" PRIMARY KEY("workspace_id","document_id"),
	CONSTRAINT "document_workbench_revision_nonnegative" CHECK ("business"."document_workbench"."current_revision">=0)
);
--> statement-breakpoint
CREATE TABLE "business"."document_workbench_revision" (
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"pack_id" uuid NOT NULL,
	"pack_revision" integer NOT NULL,
	"draft_version" integer NOT NULL,
	"purpose" text NOT NULL,
	"audience" text NOT NULL,
	"outline" jsonb NOT NULL,
	"claims" jsonb NOT NULL,
	"source_manifest" jsonb NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_workbench_revision_pk" PRIMARY KEY("workspace_id","document_id","revision"),
	CONSTRAINT "document_workbench_revision_positive" CHECK ("business"."document_workbench_revision"."revision">0 AND "business"."document_workbench_revision"."pack_revision">0 AND "business"."document_workbench_revision"."draft_version">0),
	CONSTRAINT "document_workbench_purpose_check" CHECK ("business"."document_workbench_revision"."purpose" IN ('guide','experiment_note','decision_record','comparison')),
	CONSTRAINT "document_workbench_audience_check" CHECK (length(trim("business"."document_workbench_revision"."audience")) BETWEEN 1 AND 300)
);
--> statement-breakpoint
CREATE TABLE "business"."evidence_pack" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"current_revision" integer DEFAULT 1 NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_pack_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "evidence_pack_document_identity_unique" UNIQUE("workspace_id","id","document_id"),
	CONSTRAINT "evidence_pack_revision_positive" CHECK ("business"."evidence_pack"."current_revision">0)
);
--> statement-breakpoint
CREATE TABLE "business"."evidence_pack_revision" (
	"workspace_id" uuid NOT NULL,
	"pack_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"manifest" jsonb NOT NULL,
	"manifest_hash" text NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_pack_revision_pk" PRIMARY KEY("workspace_id","pack_id","revision"),
	CONSTRAINT "evidence_pack_revision_positive" CHECK ("business"."evidence_pack_revision"."revision">0),
	CONSTRAINT "evidence_pack_revision_hash_check" CHECK (length("business"."evidence_pack_revision"."manifest_hash")=64)
);
--> statement-breakpoint
CREATE TABLE "business"."external_excerpt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_id" text NOT NULL,
	"state" text DEFAULT 'ACTIVE' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"current_revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_excerpt_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "external_excerpt_state_check" CHECK ("business"."external_excerpt"."state" IN ('ACTIVE','DELETED')),
	CONSTRAINT "external_excerpt_versions_positive" CHECK ("business"."external_excerpt"."version">0 AND "business"."external_excerpt"."current_revision">0)
);
--> statement-breakpoint
CREATE TABLE "business"."external_excerpt_revision" (
	"workspace_id" uuid NOT NULL,
	"excerpt_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"author" text NOT NULL,
	"published_at" date,
	"excerpt" text NOT NULL,
	"content_hash" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_excerpt_revision_pk" PRIMARY KEY("workspace_id","excerpt_id","revision"),
	CONSTRAINT "external_excerpt_revision_positive" CHECK ("business"."external_excerpt_revision"."revision">0),
	CONSTRAINT "external_excerpt_revision_title_check" CHECK (length(trim("business"."external_excerpt_revision"."title")) BETWEEN 1 AND 300),
	CONSTRAINT "external_excerpt_revision_url_check" CHECK (length("business"."external_excerpt_revision"."url") BETWEEN 1 AND 2000),
	CONSTRAINT "external_excerpt_revision_author_check" CHECK (length(trim("business"."external_excerpt_revision"."author")) BETWEEN 1 AND 300),
	CONSTRAINT "external_excerpt_revision_excerpt_check" CHECK (length("business"."external_excerpt_revision"."excerpt") BETWEEN 1 AND 200000),
	CONSTRAINT "external_excerpt_revision_hash_check" CHECK (length("business"."external_excerpt_revision"."content_hash")=64)
);
--> statement-breakpoint
ALTER TABLE "business"."document_workbench" ADD CONSTRAINT "document_workbench_document_fk" FOREIGN KEY ("workspace_id","document_id") REFERENCES "business"."document"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."document_workbench_revision" ADD CONSTRAINT "document_workbench_revision_workbench_fk" FOREIGN KEY ("workspace_id","document_id") REFERENCES "business"."document_workbench"("workspace_id","document_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."document_workbench_revision" ADD CONSTRAINT "document_workbench_revision_pack_document_fk" FOREIGN KEY ("workspace_id","pack_id","document_id") REFERENCES "business"."evidence_pack"("workspace_id","id","document_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."document_workbench_revision" ADD CONSTRAINT "document_workbench_revision_pack_fk" FOREIGN KEY ("workspace_id","pack_id","pack_revision") REFERENCES "business"."evidence_pack_revision"("workspace_id","pack_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."evidence_pack" ADD CONSTRAINT "evidence_pack_document_fk" FOREIGN KEY ("workspace_id","document_id") REFERENCES "business"."document"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."evidence_pack_revision" ADD CONSTRAINT "evidence_pack_revision_pack_fk" FOREIGN KEY ("workspace_id","pack_id") REFERENCES "business"."evidence_pack"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."external_excerpt_revision" ADD CONSTRAINT "external_excerpt_revision_excerpt_fk" FOREIGN KEY ("workspace_id","excerpt_id") REFERENCES "business"."external_excerpt"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'external_excerpt','external_excerpt_revision',
    'evidence_pack','evidence_pack_revision',
    'document_workbench','document_workbench_revision'
  ] LOOP
    EXECUTE format('ALTER TABLE business.%I OWNER TO ieum_migrator', relation_name);
    EXECUTE format('REVOKE ALL ON business.%I FROM PUBLIC', relation_name);
    EXECUTE format('ALTER TABLE business.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE business.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format(
      'CREATE POLICY %I ON business.%I TO ieum_application USING (workspace_id::text = current_setting(''ieum.workspace_id'', true)) WITH CHECK (workspace_id::text = current_setting(''ieum.workspace_id'', true))',
      relation_name || '_scope', relation_name
    );
  END LOOP;
END $$;
--> statement-breakpoint
GRANT SELECT, INSERT ON "business"."external_excerpt", "business"."external_excerpt_revision", "business"."evidence_pack", "business"."evidence_pack_revision", "business"."document_workbench", "business"."document_workbench_revision" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (state,version,current_revision,updated_at) ON "business"."external_excerpt" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (current_revision) ON "business"."evidence_pack" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (current_revision,updated_at) ON "business"."document_workbench" TO "ieum_application";
