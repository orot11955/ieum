CREATE TABLE "business"."transfer_row" (
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"record_kind" text NOT NULL,
	"source_id" uuid NOT NULL,
	"source_revision" integer NOT NULL,
	"state" text DEFAULT 'PENDING' NOT NULL,
	"target_id" uuid,
	"reason_code" text,
	CONSTRAINT "transfer_row_pk" PRIMARY KEY("workspace_id","run_id","record_kind","source_id"),
	CONSTRAINT "transfer_row_revision_check" CHECK ("business"."transfer_row"."source_revision">0),
	CONSTRAINT "transfer_row_state_check" CHECK ("business"."transfer_row"."state" IN ('PENDING','IMPORTED','SKIPPED','FAILED'))
);
--> statement-breakpoint
CREATE TABLE "business"."transfer_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"kind" text NOT NULL,
	"state" text NOT NULL,
	"bundle_hash" text NOT NULL,
	"storage_key" uuid NOT NULL,
	"byte_size" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	CONSTRAINT "transfer_run_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "transfer_run_kind_check" CHECK ("business"."transfer_run"."kind" IN ('EXPORT','IMPORT')),
	CONSTRAINT "transfer_run_state_check" CHECK ("business"."transfer_run"."state" IN ('READY','STAGED','APPLIED','PARTIAL')),
	CONSTRAINT "transfer_run_state_kind_check" CHECK (("business"."transfer_run"."kind"='EXPORT' AND "business"."transfer_run"."state"='READY') OR ("business"."transfer_run"."kind"='IMPORT' AND "business"."transfer_run"."state" IN ('STAGED','APPLIED','PARTIAL'))),
	CONSTRAINT "transfer_run_hash_check" CHECK (length("business"."transfer_run"."bundle_hash")=64),
	CONSTRAINT "transfer_run_size_check" CHECK ("business"."transfer_run"."byte_size">0 AND "business"."transfer_run"."byte_size"<=33554432),
	CONSTRAINT "transfer_run_expiry_check" CHECK ("business"."transfer_run"."expires_at">"business"."transfer_run"."created_at")
);
--> statement-breakpoint
ALTER TABLE "business"."transfer_row" ADD CONSTRAINT "transfer_row_run_fk" FOREIGN KEY ("workspace_id","run_id") REFERENCES "business"."transfer_run"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfer_run_actor_created_idx" ON "business"."transfer_run" USING btree ("workspace_id","actor_id","created_at");
--> statement-breakpoint
ALTER TABLE business.transfer_run ADD CONSTRAINT transfer_run_workspace_fk
  FOREIGN KEY (workspace_id) REFERENCES business.workspace(id);
--> statement-breakpoint
ALTER TABLE business.transfer_run OWNER TO ieum_migrator;
--> statement-breakpoint
ALTER TABLE business.transfer_row OWNER TO ieum_migrator;
--> statement-breakpoint
REVOKE ALL ON business.transfer_run,business.transfer_row FROM PUBLIC;
--> statement-breakpoint
ALTER TABLE business.transfer_run ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE business.transfer_run FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE business.transfer_row ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE business.transfer_row FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY transfer_run_workspace_scope ON business.transfer_run
  TO ieum_application
  USING (workspace_id::text=current_setting('ieum.workspace_id',true))
  WITH CHECK (workspace_id::text=current_setting('ieum.workspace_id',true));
--> statement-breakpoint
CREATE POLICY transfer_row_workspace_scope ON business.transfer_row
  TO ieum_application
  USING (workspace_id::text=current_setting('ieum.workspace_id',true))
  WITH CHECK (workspace_id::text=current_setting('ieum.workspace_id',true));
--> statement-breakpoint
GRANT SELECT,INSERT ON business.transfer_run,business.transfer_row TO ieum_application;
--> statement-breakpoint
GRANT UPDATE (state,applied_at) ON business.transfer_run TO ieum_application;
--> statement-breakpoint
GRANT UPDATE (state,target_id,reason_code) ON business.transfer_row TO ieum_application;
