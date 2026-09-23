CREATE TABLE "business"."extraction_candidate" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"capture_id" uuid NOT NULL,
	"capture_revision" integer NOT NULL,
	"decision_key" text NOT NULL,
	"target_kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"state" text DEFAULT 'CANDIDATE' NOT NULL,
	"target_id" uuid,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "extraction_candidate_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "extraction_candidate_source_decision_unique" UNIQUE("workspace_id","capture_id","capture_revision","decision_key"),
	CONSTRAINT "extraction_candidate_id_hash" CHECK (length("business"."extraction_candidate"."id")=64),
	CONSTRAINT "extraction_candidate_decision_hash" CHECK (length("business"."extraction_candidate"."decision_key")=64),
	CONSTRAINT "extraction_candidate_kind_check" CHECK ("business"."extraction_candidate"."target_kind" IN ('task','event','thought_unit')),
	CONSTRAINT "extraction_candidate_state_check" CHECK ("business"."extraction_candidate"."state" IN ('CANDIDATE','ACCEPTED','REJECTED')),
	CONSTRAINT "extraction_candidate_target_check" CHECK (("business"."extraction_candidate"."state"='ACCEPTED')=("business"."extraction_candidate"."target_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "business"."extraction_candidate" ADD CONSTRAINT "extraction_candidate_capture_revision_fk" FOREIGN KEY ("workspace_id","capture_id","capture_revision") REFERENCES "business"."capture_revision"("workspace_id","capture_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extraction_candidate_capture_idx" ON "business"."extraction_candidate" USING btree ("workspace_id","capture_id","capture_revision");
--> statement-breakpoint
ALTER TABLE "business"."extraction_candidate" OWNER TO "ieum_migrator";
--> statement-breakpoint
REVOKE ALL ON "business"."extraction_candidate" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON "business"."extraction_candidate" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (state,target_id,decided_at) ON "business"."extraction_candidate" TO "ieum_application";
--> statement-breakpoint
ALTER TABLE "business"."extraction_candidate" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."extraction_candidate" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "extraction_candidate_scope" ON "business"."extraction_candidate" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
