CREATE TABLE "business"."judgement_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"unit_id" uuid NOT NULL,
	"unit_revision" integer NOT NULL,
	"state" text DEFAULT 'QUEUED' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "judgement_request_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "judgement_request_revision_positive" CHECK ("business"."judgement_request"."unit_revision">0),
	CONSTRAINT "judgement_request_state_check" CHECK ("business"."judgement_request"."state" IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELED')),
	CONSTRAINT "judgement_request_retry_nonnegative" CHECK ("business"."judgement_request"."retry_count">=0)
);
--> statement-breakpoint
CREATE TABLE "business"."judgement_run" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"input_hash" text NOT NULL,
	"raw_snapshot" jsonb NOT NULL,
	"retrieval" jsonb NOT NULL,
	"measurements" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"stage_latency" jsonb NOT NULL,
	"profile_state" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "judgement_run_input_hash_length" CHECK (length("business"."judgement_run"."input_hash")=64),
	CONSTRAINT "judgement_run_profile_state_check" CHECK ("business"."judgement_run"."profile_state" IN ('FRESH','LAGGING'))
);
--> statement-breakpoint
ALTER TABLE "business"."judgement_run" ADD CONSTRAINT "judgement_run_request_fk" FOREIGN KEY ("workspace_id","request_id") REFERENCES "business"."judgement_request"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business"."judgement_request" ADD CONSTRAINT "judgement_request_unit_revision_fk" FOREIGN KEY ("workspace_id","unit_id","unit_revision") REFERENCES "business"."thought_unit_revision"("workspace_id","unit_id","revision") ON DELETE no action;
--> statement-breakpoint
ALTER TABLE "business"."judgement_request" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."judgement_run" OWNER TO "ieum_migrator";
--> statement-breakpoint
REVOKE ALL ON "business"."judgement_request", "business"."judgement_run" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON "business"."judgement_request", "business"."judgement_run" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (state,retry_count) ON "business"."judgement_request" TO "ieum_application";
--> statement-breakpoint
ALTER TABLE "business"."judgement_request" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."judgement_request" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "judgement_request_scope" ON "business"."judgement_request" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."judgement_run" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."judgement_run" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "judgement_run_scope" ON "business"."judgement_run" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
