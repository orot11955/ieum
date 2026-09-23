CREATE TABLE "business"."task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'TODO' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"due_kind" text DEFAULT 'NONE' NOT NULL,
	"due_date" date,
	"due_at" timestamp with time zone,
	"due_time_zone" text,
	"context_id" uuid,
	"origin_kind" text DEFAULT 'EXPLICIT' NOT NULL,
	"origin_unit_id" uuid,
	"origin_unit_revision" integer,
	"completed_at" timestamp with time zone,
	"completion_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_title_nonempty" CHECK (length(trim("business"."task"."title")) BETWEEN 1 AND 300),
	CONSTRAINT "task_description_length" CHECK (length("business"."task"."description") <= 10000),
	CONSTRAINT "task_state_check" CHECK ("business"."task"."state" IN ('TODO','IN_PROGRESS','ON_HOLD','DONE','CANCELED')),
	CONSTRAINT "task_version_positive" CHECK ("business"."task"."version" > 0),
	CONSTRAINT "task_due_check" CHECK (("business"."task"."due_kind"='NONE' AND "business"."task"."due_date" IS NULL AND "business"."task"."due_at" IS NULL AND "business"."task"."due_time_zone" IS NULL) OR ("business"."task"."due_kind"='DATE' AND "business"."task"."due_date" IS NOT NULL AND "business"."task"."due_at" IS NULL AND "business"."task"."due_time_zone" IS NULL) OR ("business"."task"."due_kind"='INSTANT' AND "business"."task"."due_date" IS NULL AND "business"."task"."due_at" IS NOT NULL AND length("business"."task"."due_time_zone") BETWEEN 1 AND 100)),
	CONSTRAINT "task_origin_kind_check" CHECK ("business"."task"."origin_kind"='EXPLICIT'),
	CONSTRAINT "task_origin_pair_check" CHECK (("business"."task"."origin_unit_id" IS NULL)=("business"."task"."origin_unit_revision" IS NULL)),
	CONSTRAINT "task_completion_check" CHECK (("business"."task"."state"='DONE' AND "business"."task"."completed_at" IS NOT NULL AND "business"."task"."completion_version" IS NOT NULL AND "business"."task"."completion_version">1 AND "business"."task"."completion_version"<="business"."task"."version") OR ("business"."task"."state"<>'DONE' AND "business"."task"."completed_at" IS NULL AND "business"."task"."completion_version" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "business"."task_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"completion_version" integer NOT NULL,
	"capture_id" uuid NOT NULL,
	"created_by_id" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_result_completion_unique" UNIQUE("workspace_id","task_id","completion_version"),
	CONSTRAINT "task_result_completion_positive" CHECK ("business"."task_result"."completion_version">0)
);
--> statement-breakpoint
CREATE TABLE "business"."task_transition" (
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"from_state" text NOT NULL,
	"to_state" text NOT NULL,
	"actor_id" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_transition_pk" PRIMARY KEY("workspace_id","task_id","version"),
	CONSTRAINT "task_transition_version_positive" CHECK ("business"."task_transition"."version">1),
	CONSTRAINT "task_transition_state_check" CHECK ("business"."task_transition"."from_state" IN ('TODO','IN_PROGRESS','ON_HOLD','DONE','CANCELED') AND "business"."task_transition"."to_state" IN ('TODO','IN_PROGRESS','ON_HOLD','DONE','CANCELED') AND "business"."task_transition"."from_state"<>"business"."task_transition"."to_state")
);
--> statement-breakpoint
ALTER TABLE "business"."task" ADD CONSTRAINT "task_context_fk" FOREIGN KEY ("workspace_id","context_id") REFERENCES "business"."context"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."task" ADD CONSTRAINT "task_origin_unit_revision_fk" FOREIGN KEY ("workspace_id","origin_unit_id","origin_unit_revision") REFERENCES "business"."thought_unit_revision"("workspace_id","unit_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."task_result" ADD CONSTRAINT "task_result_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "business"."task"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."task_result" ADD CONSTRAINT "task_result_capture_fk" FOREIGN KEY ("workspace_id","capture_id") REFERENCES "business"."capture"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."task_transition" ADD CONSTRAINT "task_transition_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "business"."task"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business"."task_result" ADD CONSTRAINT "task_result_transition_fk" FOREIGN KEY ("workspace_id","task_id","completion_version") REFERENCES "business"."task_transition"("workspace_id","task_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_workspace_state_updated_idx" ON "business"."task" USING btree ("workspace_id","state","updated_at");--> statement-breakpoint
ALTER TABLE "business"."task_result" ADD CONSTRAINT "task_result_capture_unique" UNIQUE("workspace_id","capture_id");
--> statement-breakpoint
ALTER TABLE "business"."task" ADD CONSTRAINT "task_workspace_fk" FOREIGN KEY (workspace_id) REFERENCES "business"."workspace"(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "business"."task" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."task_transition" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."task_result" OWNER TO "ieum_migrator";
--> statement-breakpoint
REVOKE ALL ON "business"."task", "business"."task_transition", "business"."task_result" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON "business"."task", "business"."task_transition", "business"."task_result" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (title, description, state, version, due_kind, due_date, due_at, due_time_zone, context_id, completed_at, completion_version, updated_at) ON "business"."task" TO "ieum_application";
--> statement-breakpoint
ALTER TABLE "business"."task" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."task" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "task_scope" ON "business"."task" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."task_transition" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."task_transition" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "task_transition_scope" ON "business"."task_transition" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."task_result" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."task_result" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "task_result_scope" ON "business"."task_result" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
