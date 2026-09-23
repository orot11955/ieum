CREATE TABLE "business"."calendar_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'CONFIRMED' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"schedule_kind" text NOT NULL,
	"time_zone" text NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"start_local" text,
	"end_local" text,
	"start_offset_minutes" integer,
	"end_offset_minutes" integer,
	"start_date" date,
	"end_date_exclusive" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_event_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "calendar_event_title_nonempty" CHECK (length(trim("business"."calendar_event"."title")) BETWEEN 1 AND 300),
	CONSTRAINT "calendar_event_description_length" CHECK (length("business"."calendar_event"."description") <= 10000),
	CONSTRAINT "calendar_event_state_check" CHECK ("business"."calendar_event"."state" IN ('CONFIRMED','CANCELED')),
	CONSTRAINT "calendar_event_version_positive" CHECK ("business"."calendar_event"."version" > 0),
	CONSTRAINT "calendar_event_time_zone_length" CHECK (length("business"."calendar_event"."time_zone") BETWEEN 1 AND 100),
	CONSTRAINT "calendar_event_schedule_check" CHECK (("business"."calendar_event"."schedule_kind"='TIMED' AND "business"."calendar_event"."start_at" IS NOT NULL AND "business"."calendar_event"."end_at" IS NOT NULL AND "business"."calendar_event"."start_at"<"business"."calendar_event"."end_at" AND "business"."calendar_event"."start_local" IS NOT NULL AND "business"."calendar_event"."end_local" IS NOT NULL AND "business"."calendar_event"."start_offset_minutes" IS NOT NULL AND "business"."calendar_event"."end_offset_minutes" IS NOT NULL AND "business"."calendar_event"."start_date" IS NULL AND "business"."calendar_event"."end_date_exclusive" IS NULL) OR ("business"."calendar_event"."schedule_kind"='ALL_DAY' AND "business"."calendar_event"."start_date" IS NOT NULL AND "business"."calendar_event"."end_date_exclusive" IS NOT NULL AND "business"."calendar_event"."start_date"<"business"."calendar_event"."end_date_exclusive" AND "business"."calendar_event"."start_at" IS NULL AND "business"."calendar_event"."end_at" IS NULL AND "business"."calendar_event"."start_local" IS NULL AND "business"."calendar_event"."end_local" IS NULL AND "business"."calendar_event"."start_offset_minutes" IS NULL AND "business"."calendar_event"."end_offset_minutes" IS NULL))
);
--> statement-breakpoint
CREATE INDEX "calendar_event_timed_period_idx" ON "business"."calendar_event" USING btree ("workspace_id","start_at","end_at");--> statement-breakpoint
CREATE INDEX "calendar_event_all_day_period_idx" ON "business"."calendar_event" USING btree ("workspace_id","start_date","end_date_exclusive");
--> statement-breakpoint
ALTER TABLE "business"."calendar_event" ADD CONSTRAINT "calendar_event_workspace_fk" FOREIGN KEY (workspace_id) REFERENCES "business"."workspace"(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "business"."calendar_event" OWNER TO "ieum_migrator";
--> statement-breakpoint
REVOKE ALL ON "business"."calendar_event" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON "business"."calendar_event" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (title, description, state, version, schedule_kind, time_zone, start_at, end_at, start_local, end_local, start_offset_minutes, end_offset_minutes, start_date, end_date_exclusive, updated_at) ON "business"."calendar_event" TO "ieum_application";
--> statement-breakpoint
ALTER TABLE "business"."calendar_event" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."calendar_event" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "calendar_event_scope" ON "business"."calendar_event" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
