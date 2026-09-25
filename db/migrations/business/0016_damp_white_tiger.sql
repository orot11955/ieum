CREATE SCHEMA "delivery";
--> statement-breakpoint
CREATE TABLE "delivery"."publication" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"current_revision" integer,
	"state" text NOT NULL,
	"access_epoch" integer NOT NULL,
	"current_slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_publication_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "delivery_publication_workspace_channel_id_unique" UNIQUE("workspace_id","id","channel_id"),
	CONSTRAINT "delivery_publication_state_check" CHECK ("delivery"."publication"."state" IN ('PUBLISHED','WITHDRAWN')),
	CONSTRAINT "delivery_publication_published_pointer_check" CHECK ("delivery"."publication"."state"<>'PUBLISHED' OR "delivery"."publication"."current_revision" IS NOT NULL),
	CONSTRAINT "delivery_publication_epoch_positive" CHECK ("delivery"."publication"."access_epoch">0)
);
--> statement-breakpoint
CREATE TABLE "delivery"."publication_asset" (
	"workspace_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"public_asset_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"byte_size" integer NOT NULL,
	"content_hash" text NOT NULL,
	CONSTRAINT "delivery_publication_asset_pk" PRIMARY KEY("workspace_id","publication_id","revision","public_asset_id"),
	CONSTRAINT "delivery_publication_asset_position_unique" UNIQUE("workspace_id","publication_id","revision","position"),
	CONSTRAINT "delivery_publication_asset_hash_check" CHECK (length("delivery"."publication_asset"."content_hash")=64)
);
--> statement-breakpoint
CREATE TABLE "delivery"."publication_revision" (
	"workspace_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"body_format" text DEFAULT 'markdown' NOT NULL,
	"manifest_hash" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_publication_revision_pk" PRIMARY KEY("workspace_id","publication_id","revision"),
	CONSTRAINT "delivery_publication_revision_format_check" CHECK ("delivery"."publication_revision"."body_format"='markdown'),
	CONSTRAINT "delivery_publication_revision_hash_check" CHECK (length("delivery"."publication_revision"."manifest_hash")=64)
);
--> statement-breakpoint
CREATE TABLE "delivery"."publication_slug" (
	"workspace_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"publication_id" uuid NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	CONSTRAINT "delivery_publication_slug_pk" PRIMARY KEY("workspace_id","channel_id","slug")
);
--> statement-breakpoint
CREATE TABLE "business"."document_review" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"sequence" integer NOT NULL,
	"manifest_hash" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"decision" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_review_revision_id_unique" UNIQUE("workspace_id","document_id","revision","id"),
	CONSTRAINT "document_review_sequence_unique" UNIQUE("workspace_id","document_id","revision","sequence"),
	CONSTRAINT "document_review_decision_check" CHECK ("business"."document_review"."decision" IN ('READY','CHANGES_REQUIRED')),
	CONSTRAINT "document_review_hash_check" CHECK (length("business"."document_review"."manifest_hash")=64),
	CONSTRAINT "document_review_sequence_positive" CHECK ("business"."document_review"."sequence">0)
);
--> statement-breakpoint
CREATE TABLE "business"."publication" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"current_revision" integer,
	"state" text DEFAULT 'WITHDRAWN' NOT NULL,
	"access_epoch" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "publication_workspace_document_id_unique" UNIQUE("workspace_id","id","document_id"),
	CONSTRAINT "publication_workspace_channel_id_unique" UNIQUE("workspace_id","id","channel_id"),
	CONSTRAINT "publication_document_channel_unique" UNIQUE("workspace_id","channel_id","document_id"),
	CONSTRAINT "publication_state_check" CHECK ("business"."publication"."state" IN ('PUBLISHED','WITHDRAWN')),
	CONSTRAINT "publication_published_pointer_check" CHECK ("business"."publication"."state"<>'PUBLISHED' OR "business"."publication"."current_revision" IS NOT NULL),
	CONSTRAINT "publication_epoch_positive" CHECK ("business"."publication"."access_epoch">0)
);
--> statement-breakpoint
CREATE TABLE "business"."publication_asset" (
	"workspace_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"public_asset_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"content_hash" text NOT NULL,
	CONSTRAINT "publication_asset_pk" PRIMARY KEY("workspace_id","publication_id","revision","public_asset_id"),
	CONSTRAINT "publication_asset_position_unique" UNIQUE("workspace_id","publication_id","revision","position"),
	CONSTRAINT "publication_asset_hash_check" CHECK (length("business"."publication_asset"."content_hash")=64)
);
--> statement-breakpoint
CREATE TABLE "business"."publication_channel" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"state" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_channel_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "publication_channel_workspace_name_unique" UNIQUE("workspace_id","name"),
	CONSTRAINT "publication_channel_state_check" CHECK ("business"."publication_channel"."state" IN ('ACTIVE','DISABLED'))
);
--> statement-breakpoint
CREATE TABLE "business"."publication_revision" (
	"workspace_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"document_id" uuid NOT NULL,
	"document_revision" integer NOT NULL,
	"review_id" uuid NOT NULL,
	"manifest_hash" text NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_revision_pk" PRIMARY KEY("workspace_id","publication_id","revision"),
	CONSTRAINT "publication_revision_positive" CHECK ("business"."publication_revision"."revision">0),
	CONSTRAINT "publication_revision_hash_check" CHECK (length("business"."publication_revision"."manifest_hash")=64)
);
--> statement-breakpoint
CREATE TABLE "business"."publication_slug" (
	"workspace_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"publication_id" uuid NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	CONSTRAINT "publication_slug_pk" PRIMARY KEY("workspace_id","channel_id","slug")
);
--> statement-breakpoint
ALTER TABLE "delivery"."publication_asset" ADD CONSTRAINT "delivery_publication_asset_revision_fk" FOREIGN KEY ("workspace_id","publication_id","revision") REFERENCES "delivery"."publication_revision"("workspace_id","publication_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery"."publication_revision" ADD CONSTRAINT "delivery_publication_revision_publication_fk" FOREIGN KEY ("workspace_id","publication_id") REFERENCES "delivery"."publication"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery"."publication_slug" ADD CONSTRAINT "delivery_publication_slug_publication_fk" FOREIGN KEY ("workspace_id","publication_id","channel_id") REFERENCES "delivery"."publication"("workspace_id","id","channel_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."document_review" ADD CONSTRAINT "document_review_revision_fk" FOREIGN KEY ("workspace_id","document_id","revision") REFERENCES "business"."document_revision"("workspace_id","document_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."publication" ADD CONSTRAINT "publication_channel_fk" FOREIGN KEY ("workspace_id","channel_id") REFERENCES "business"."publication_channel"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."publication" ADD CONSTRAINT "publication_document_fk" FOREIGN KEY ("workspace_id","document_id") REFERENCES "business"."document"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."publication_asset" ADD CONSTRAINT "publication_asset_revision_fk" FOREIGN KEY ("workspace_id","publication_id","revision") REFERENCES "business"."publication_revision"("workspace_id","publication_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."publication_asset" ADD CONSTRAINT "publication_asset_public_fk" FOREIGN KEY ("workspace_id","public_asset_id") REFERENCES "business"."public_asset"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."publication_channel" ADD CONSTRAINT "publication_channel_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "business"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."publication_revision" ADD CONSTRAINT "publication_revision_publication_fk" FOREIGN KEY ("workspace_id","publication_id","document_id") REFERENCES "business"."publication"("workspace_id","id","document_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."publication_revision" ADD CONSTRAINT "publication_revision_document_fk" FOREIGN KEY ("workspace_id","document_id","document_revision") REFERENCES "business"."document_revision"("workspace_id","document_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."publication_revision" ADD CONSTRAINT "publication_revision_review_fk" FOREIGN KEY ("workspace_id","document_id","document_revision","review_id") REFERENCES "business"."document_review"("workspace_id","document_id","revision","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."publication_slug" ADD CONSTRAINT "publication_slug_publication_fk" FOREIGN KEY ("workspace_id","publication_id","channel_id") REFERENCES "business"."publication"("workspace_id","id","channel_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_publication_slug_one_current_idx" ON "delivery"."publication_slug" USING btree ("workspace_id","publication_id") WHERE "delivery"."publication_slug"."is_current";--> statement-breakpoint
CREATE UNIQUE INDEX "publication_slug_one_current_idx" ON "business"."publication_slug" USING btree ("workspace_id","publication_id") WHERE "business"."publication_slug"."is_current";
--> statement-breakpoint
ALTER TABLE business.publication ADD CONSTRAINT publication_current_revision_fk
  FOREIGN KEY (workspace_id,id,current_revision)
  REFERENCES business.publication_revision(workspace_id,publication_id,revision);
--> statement-breakpoint
ALTER TABLE delivery.publication ADD CONSTRAINT delivery_publication_current_revision_fk
  FOREIGN KEY (workspace_id,id,current_revision)
  REFERENCES delivery.publication_revision(workspace_id,publication_id,revision);
--> statement-breakpoint
ALTER SCHEMA delivery OWNER TO ieum_migrator;
--> statement-breakpoint
REVOKE ALL ON SCHEMA delivery FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA delivery TO ieum_application;
--> statement-breakpoint
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'publication_channel','document_review','publication','publication_revision',
    'publication_slug','publication_asset'
  ] LOOP
    EXECUTE format('ALTER TABLE business.%I OWNER TO ieum_migrator',relation_name);
    EXECUTE format('REVOKE ALL ON business.%I FROM PUBLIC',relation_name);
    EXECUTE format('ALTER TABLE business.%I ENABLE ROW LEVEL SECURITY',relation_name);
    EXECUTE format('ALTER TABLE business.%I FORCE ROW LEVEL SECURITY',relation_name);
    EXECUTE format(
      'CREATE POLICY %I ON business.%I TO ieum_application USING (workspace_id::text = current_setting(''ieum.workspace_id'',true)) WITH CHECK (workspace_id::text = current_setting(''ieum.workspace_id'',true))',
      relation_name || '_scope',relation_name
    );
  END LOOP;
  FOREACH relation_name IN ARRAY ARRAY[
    'publication','publication_revision','publication_slug','publication_asset'
  ] LOOP
    EXECUTE format('ALTER TABLE delivery.%I OWNER TO ieum_migrator',relation_name);
    EXECUTE format('REVOKE ALL ON delivery.%I FROM PUBLIC',relation_name);
    EXECUTE format('ALTER TABLE delivery.%I ENABLE ROW LEVEL SECURITY',relation_name);
    EXECUTE format('ALTER TABLE delivery.%I FORCE ROW LEVEL SECURITY',relation_name);
    EXECUTE format(
      'CREATE POLICY %I ON delivery.%I TO ieum_application USING (workspace_id::text = current_setting(''ieum.workspace_id'',true)) WITH CHECK (workspace_id::text = current_setting(''ieum.workspace_id'',true))',
      relation_name || '_scope',relation_name
    );
  END LOOP;
END $$;
--> statement-breakpoint
GRANT SELECT, INSERT ON business.publication_channel,business.document_review,
  business.publication,business.publication_revision,business.publication_slug,
  business.publication_asset TO ieum_application;
--> statement-breakpoint
GRANT SELECT, INSERT ON delivery.publication,delivery.publication_revision,
  delivery.publication_slug,delivery.publication_asset TO ieum_application;
--> statement-breakpoint
GRANT UPDATE (state,current_revision,access_epoch,updated_at) ON business.publication TO ieum_application;
--> statement-breakpoint
GRANT UPDATE (is_current) ON business.publication_slug TO ieum_application;
--> statement-breakpoint
GRANT UPDATE (state,current_revision,access_epoch,current_slug,updated_at) ON delivery.publication TO ieum_application;
--> statement-breakpoint
GRANT UPDATE (is_current) ON delivery.publication_slug TO ieum_application;
