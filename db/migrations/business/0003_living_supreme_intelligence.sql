CREATE TABLE "business"."capture" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_id" text NOT NULL,
	"title" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_key" text,
	"origin_key" text NOT NULL,
	"state" text DEFAULT 'ACTIVE' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"current_revision" integer DEFAULT 1 NOT NULL,
	"unit_set_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capture_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "capture_title_nonempty" CHECK (length(trim("business"."capture"."title")) BETWEEN 1 AND 300),
	CONSTRAINT "capture_source_kind_check" CHECK ("business"."capture"."source_kind" IN ('manual', 'import')),
	CONSTRAINT "capture_source_key_nonempty" CHECK ("business"."capture"."source_key" IS NULL OR length("business"."capture"."source_key") BETWEEN 1 AND 300),
	CONSTRAINT "capture_import_key_required" CHECK ("business"."capture"."source_kind" <> 'import' OR "business"."capture"."source_key" IS NOT NULL),
	CONSTRAINT "capture_origin_key_nonempty" CHECK (length("business"."capture"."origin_key") BETWEEN 1 AND 400),
	CONSTRAINT "capture_state_check" CHECK ("business"."capture"."state" IN ('ACTIVE', 'ARCHIVED')),
	CONSTRAINT "capture_versions_positive" CHECK ("business"."capture"."version" > 0 AND "business"."capture"."current_revision" > 0 AND "business"."capture"."unit_set_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "business"."capture_revision" (
	"workspace_id" uuid NOT NULL,
	"capture_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"title" text NOT NULL,
	"raw_body" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capture_revision_pk" PRIMARY KEY("workspace_id","capture_id","revision"),
	CONSTRAINT "capture_revision_positive" CHECK ("business"."capture_revision"."revision" > 0),
	CONSTRAINT "capture_revision_title_nonempty" CHECK (length(trim("business"."capture_revision"."title")) BETWEEN 1 AND 300),
	CONSTRAINT "capture_revision_body_nonempty" CHECK (length("business"."capture_revision"."raw_body") BETWEEN 1 AND 1000000)
);
--> statement-breakpoint
CREATE TABLE "business"."thought_unit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"capture_id" uuid NOT NULL,
	"capture_revision" integer NOT NULL,
	"origin_key" text NOT NULL,
	"state" text DEFAULT 'ACTIVE' NOT NULL,
	"current_revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "thought_unit_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "thought_unit_identity_origin_unique" UNIQUE("workspace_id","id","capture_id","capture_revision"),
	CONSTRAINT "thought_unit_state_check" CHECK ("business"."thought_unit"."state" IN ('ACTIVE', 'SUPERSEDED')),
	CONSTRAINT "thought_unit_revision_positive" CHECK ("business"."thought_unit"."current_revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "business"."thought_unit_revision" (
	"workspace_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"capture_id" uuid NOT NULL,
	"capture_revision" integer NOT NULL,
	"source_start" integer NOT NULL,
	"source_end" integer NOT NULL,
	"content_kind" text DEFAULT 'quote' NOT NULL,
	"content_text" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thought_unit_revision_pk" PRIMARY KEY("workspace_id","unit_id","revision"),
	CONSTRAINT "thought_unit_revision_positive" CHECK ("business"."thought_unit_revision"."revision" > 0),
	CONSTRAINT "thought_unit_span_valid" CHECK ("business"."thought_unit_revision"."source_start" >= 0 AND "business"."thought_unit_revision"."source_end" > "business"."thought_unit_revision"."source_start"),
	CONSTRAINT "thought_unit_content_kind_check" CHECK ("business"."thought_unit_revision"."content_kind" IN ('quote', 'paraphrase'))
);
--> statement-breakpoint
ALTER TABLE "business"."capture_revision" ADD CONSTRAINT "capture_revision_capture_fk" FOREIGN KEY ("workspace_id","capture_id") REFERENCES "business"."capture"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."thought_unit" ADD CONSTRAINT "thought_unit_capture_revision_fk" FOREIGN KEY ("workspace_id","capture_id","capture_revision") REFERENCES "business"."capture_revision"("workspace_id","capture_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."thought_unit_revision" ADD CONSTRAINT "thought_unit_revision_unit_fk" FOREIGN KEY ("workspace_id","unit_id","capture_id","capture_revision") REFERENCES "business"."thought_unit"("workspace_id","id","capture_id","capture_revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."thought_unit_revision" ADD CONSTRAINT "thought_unit_revision_capture_fk" FOREIGN KEY ("workspace_id","capture_id","capture_revision") REFERENCES "business"."capture_revision"("workspace_id","capture_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "capture_source_key_unique" ON "business"."capture" USING btree ("workspace_id","source_kind","source_key") WHERE "business"."capture"."source_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "business"."capture" ADD CONSTRAINT "capture_workspace_fk" FOREIGN KEY (workspace_id) REFERENCES "business"."workspace"(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "business"."capture" ADD CONSTRAINT "capture_current_revision_fk" FOREIGN KEY (workspace_id, id, current_revision) REFERENCES "business"."capture_revision"(workspace_id, capture_id, revision) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "business"."thought_unit" ADD CONSTRAINT "thought_unit_current_revision_fk" FOREIGN KEY (workspace_id, id, current_revision) REFERENCES "business"."thought_unit_revision"(workspace_id, unit_id, revision) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "business"."capture" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."capture_revision" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."thought_unit" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."thought_unit_revision" OWNER TO "ieum_migrator";
--> statement-breakpoint
REVOKE ALL ON "business"."capture", "business"."capture_revision", "business"."thought_unit", "business"."thought_unit_revision" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON "business"."capture", "business"."thought_unit" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (title, state, version, current_revision, unit_set_version, updated_at) ON "business"."capture" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (state, superseded_at) ON "business"."thought_unit" TO "ieum_application";
--> statement-breakpoint
GRANT SELECT, INSERT ON "business"."capture_revision", "business"."thought_unit_revision" TO "ieum_application";
--> statement-breakpoint
ALTER TABLE "business"."capture" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."capture" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "capture_scope" ON "business"."capture" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."capture_revision" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."capture_revision" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "capture_revision_scope" ON "business"."capture_revision" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."thought_unit" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."thought_unit" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "thought_unit_scope" ON "business"."thought_unit" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."thought_unit_revision" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."thought_unit_revision" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "thought_unit_revision_scope" ON "business"."thought_unit_revision" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
