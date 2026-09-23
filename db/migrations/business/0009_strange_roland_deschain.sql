CREATE TABLE "business"."judgement_exposure" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"exposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "judgement_exposure_workspace_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "business"."judgement_feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"exposure_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"kind" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "judgement_feedback_proposal_unique" UNIQUE("workspace_id","proposal_id"),
	CONSTRAINT "judgement_feedback_kind_check" CHECK ("business"."judgement_feedback"."kind" IN ('ACCEPTED','REJECTED','DISMISSED'))
);
--> statement-breakpoint
CREATE TABLE "business"."judgement_proposal" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_request_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"unit_id" uuid NOT NULL,
	"unit_revision" integer NOT NULL,
	"context_id" uuid NOT NULL,
	"role" text NOT NULL,
	"operations" jsonb NOT NULL,
	"operations_hash" text NOT NULL,
	"state" text DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "judgement_proposal_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "judgement_proposal_revision_positive" CHECK ("business"."judgement_proposal"."unit_revision">0),
	CONSTRAINT "judgement_proposal_role_check" CHECK ("business"."judgement_proposal"."role" IN ('PRIMARY','SECONDARY','BACKGROUND')),
	CONSTRAINT "judgement_proposal_state_check" CHECK ("business"."judgement_proposal"."state" IN ('PENDING','ACCEPTED','REJECTED','DISMISSED','EXPIRED','SUPERSEDED')),
	CONSTRAINT "judgement_proposal_hash_length" CHECK (length("business"."judgement_proposal"."operations_hash")=64)
);
--> statement-breakpoint
ALTER TABLE "business"."judgement_exposure" ADD CONSTRAINT "judgement_exposure_proposal_fk" FOREIGN KEY ("workspace_id","proposal_id") REFERENCES "business"."judgement_proposal"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."judgement_feedback" ADD CONSTRAINT "judgement_feedback_proposal_fk" FOREIGN KEY ("workspace_id","proposal_id") REFERENCES "business"."judgement_proposal"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."judgement_feedback" ADD CONSTRAINT "judgement_feedback_exposure_fk" FOREIGN KEY ("workspace_id","exposure_id") REFERENCES "business"."judgement_exposure"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."judgement_proposal" ADD CONSTRAINT "judgement_proposal_run_fk" FOREIGN KEY ("workspace_id","run_request_id") REFERENCES "business"."judgement_request"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business"."judgement_proposal" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."judgement_exposure" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."judgement_feedback" OWNER TO "ieum_migrator";
--> statement-breakpoint
REVOKE ALL ON "business"."judgement_proposal", "business"."judgement_exposure", "business"."judgement_feedback" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON "business"."judgement_proposal", "business"."judgement_exposure", "business"."judgement_feedback" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (state,responded_at) ON "business"."judgement_proposal" TO "ieum_application";
--> statement-breakpoint
ALTER TABLE "business"."judgement_proposal" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."judgement_proposal" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "judgement_proposal_scope" ON "business"."judgement_proposal" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."judgement_exposure" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."judgement_exposure" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "judgement_exposure_scope" ON "business"."judgement_exposure" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."judgement_feedback" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."judgement_feedback" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "judgement_feedback_scope" ON "business"."judgement_feedback" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
