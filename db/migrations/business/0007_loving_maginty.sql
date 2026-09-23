CREATE TABLE "business"."command_dispatch" (
	"outbox_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business"."context_profile_invalidation" (
	"workspace_id" uuid NOT NULL,
	"context_id" uuid NOT NULL,
	"membership_revision" integer NOT NULL,
	"last_outbox_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "context_profile_invalidation_pk" PRIMARY KEY("workspace_id","context_id"),
	CONSTRAINT "context_profile_invalidation_revision_positive" CHECK ("business"."context_profile_invalidation"."membership_revision">0)
);
--> statement-breakpoint
ALTER TABLE "business"."command_dispatch" ADD CONSTRAINT "command_dispatch_outbox_id_command_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "business"."command_outbox"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."context_profile_invalidation" ADD CONSTRAINT "context_profile_invalidation_context_fk" FOREIGN KEY ("workspace_id","context_id") REFERENCES "business"."context"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business"."command_dispatch" ADD CONSTRAINT "command_dispatch_workspace_fk" FOREIGN KEY (workspace_id) REFERENCES "business"."workspace"(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "business"."command_dispatch" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."context_profile_invalidation" OWNER TO "ieum_migrator";
--> statement-breakpoint
REVOKE ALL ON "business"."command_dispatch", "business"."context_profile_invalidation" FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "business" TO "ieum_job_relay";
--> statement-breakpoint
GRANT SELECT ON "business"."command_outbox" TO "ieum_job_relay";
--> statement-breakpoint
GRANT SELECT, INSERT ON "business"."command_dispatch" TO "ieum_job_relay";
--> statement-breakpoint
GRANT SELECT ON "business"."command_dispatch" TO "ieum_application";
--> statement-breakpoint
GRANT SELECT, INSERT ON "business"."context_profile_invalidation" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (membership_revision, last_outbox_id, recorded_at) ON "business"."context_profile_invalidation" TO "ieum_application";
--> statement-breakpoint
ALTER TABLE "business"."command_dispatch" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."command_dispatch" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "command_dispatch_relay" ON "business"."command_dispatch" TO "ieum_job_relay" USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "command_dispatch_scope" ON "business"."command_dispatch" FOR SELECT TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
CREATE POLICY "command_outbox_relay_read" ON "business"."command_outbox" FOR SELECT TO "ieum_job_relay" USING (true);
--> statement-breakpoint
ALTER TABLE "business"."context_profile_invalidation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."context_profile_invalidation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "context_profile_invalidation_scope" ON "business"."context_profile_invalidation" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
