CREATE TABLE "business"."asset" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"uploader_id" text NOT NULL,
	"original_name" text NOT NULL,
	"declared_mime" text NOT NULL,
	"expected_size" integer NOT NULL,
	"state" text DEFAULT 'PENDING' NOT NULL,
	"rejection_code" text,
	"original_storage_key" text,
	"detected_mime" text,
	"byte_size" integer,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "asset_state_check" CHECK ("business"."asset"."state" IN ('PENDING','VERIFIED','REJECTED','DELETED')),
	CONSTRAINT "asset_expected_size_check" CHECK ("business"."asset"."expected_size">0 AND "business"."asset"."expected_size"<=20971520),
	CONSTRAINT "asset_content_hash_check" CHECK ("business"."asset"."content_hash" IS NULL OR length("business"."asset"."content_hash")=64)
);
--> statement-breakpoint
CREATE TABLE "business"."document_asset_draft" (
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "document_asset_draft_pk" PRIMARY KEY("workspace_id","document_id","asset_id"),
	CONSTRAINT "document_asset_draft_position_unique" UNIQUE("workspace_id","document_id","position"),
	CONSTRAINT "document_asset_draft_position_check" CHECK ("business"."document_asset_draft"."position">=0)
);
--> statement-breakpoint
CREATE TABLE "business"."document_asset_revision" (
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"asset_id" uuid NOT NULL,
	"public_asset_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"original_hash" text NOT NULL,
	"derivative_hash" text NOT NULL,
	CONSTRAINT "document_asset_revision_pk" PRIMARY KEY("workspace_id","document_id","revision","asset_id"),
	CONSTRAINT "document_asset_revision_position_unique" UNIQUE("workspace_id","document_id","revision","position"),
	CONSTRAINT "document_asset_revision_position_check" CHECK ("business"."document_asset_revision"."position">=0),
	CONSTRAINT "document_asset_revision_hash_check" CHECK (length("business"."document_asset_revision"."original_hash")=64 AND length("business"."document_asset_revision"."derivative_hash")=64)
);
--> statement-breakpoint
CREATE TABLE "business"."public_asset" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_asset_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"byte_size" integer NOT NULL,
	"content_hash" text NOT NULL,
	"transform_revision" text NOT NULL,
	"width" integer,
	"height" integer,
	"state" text DEFAULT 'VERIFIED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_asset_workspace_source_unique" UNIQUE("workspace_id","source_asset_id"),
	CONSTRAINT "public_asset_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "public_asset_state_check" CHECK ("business"."public_asset"."state" IN ('VERIFIED','DISABLED')),
	CONSTRAINT "public_asset_size_check" CHECK ("business"."public_asset"."byte_size">0 AND "business"."public_asset"."byte_size"<=20971520),
	CONSTRAINT "public_asset_hash_check" CHECK (length("business"."public_asset"."content_hash")=64)
);
--> statement-breakpoint
ALTER TABLE "business"."document_asset_draft" ADD CONSTRAINT "document_asset_draft_document_fk" FOREIGN KEY ("workspace_id","document_id") REFERENCES "business"."document"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."document_asset_draft" ADD CONSTRAINT "document_asset_draft_asset_fk" FOREIGN KEY ("workspace_id","asset_id") REFERENCES "business"."asset"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."document_asset_revision" ADD CONSTRAINT "document_asset_revision_document_fk" FOREIGN KEY ("workspace_id","document_id","revision") REFERENCES "business"."document_revision"("workspace_id","document_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."document_asset_revision" ADD CONSTRAINT "document_asset_revision_asset_fk" FOREIGN KEY ("workspace_id","asset_id") REFERENCES "business"."asset"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."document_asset_revision" ADD CONSTRAINT "document_asset_revision_public_fk" FOREIGN KEY ("workspace_id","public_asset_id") REFERENCES "business"."public_asset"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."public_asset" ADD CONSTRAINT "public_asset_source_fk" FOREIGN KEY ("workspace_id","source_asset_id") REFERENCES "business"."asset"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_workspace_state_created_idx" ON "business"."asset" USING btree ("workspace_id","state","created_at");
--> statement-breakpoint
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'asset','public_asset','document_asset_draft','document_asset_revision'
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
GRANT SELECT, INSERT ON "business"."asset", "business"."public_asset", "business"."document_asset_draft", "business"."document_asset_revision" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (state,rejection_code,original_storage_key,detected_mime,byte_size,content_hash,updated_at) ON "business"."asset" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (state) ON "business"."public_asset" TO "ieum_application";
--> statement-breakpoint
GRANT DELETE ON "business"."document_asset_draft" TO "ieum_application";
