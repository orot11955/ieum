CREATE TABLE "business"."context_identity_revision" (
	"workspace_id" uuid NOT NULL,
	"context_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"name" text NOT NULL,
	"purpose" text NOT NULL,
	"scope" text NOT NULL,
	"kind" text NOT NULL,
	"state" text NOT NULL,
	"superseded_by_id" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "context_identity_revision_pk" PRIMARY KEY("workspace_id","context_id","revision"),
	CONSTRAINT "context_identity_revision_positive" CHECK ("business"."context_identity_revision"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "business"."context_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"unit_revision" integer NOT NULL,
	"context_id" uuid NOT NULL,
	"role" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_reason" text,
	CONSTRAINT "context_membership_role_check" CHECK ("business"."context_membership"."role" IN ('PRIMARY', 'SECONDARY', 'BACKGROUND')),
	CONSTRAINT "context_membership_end_check" CHECK (("business"."context_membership"."ended_at" IS NULL) = ("business"."context_membership"."ended_reason" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "business"."context_relation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"from_context_id" uuid NOT NULL,
	"to_context_id" uuid NOT NULL,
	"type" text NOT NULL,
	"approved_by_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "context_relation_type_check" CHECK ("business"."context_relation"."type" IN ('PARENT_OF', 'RELATED_TO')),
	CONSTRAINT "context_relation_not_self" CHECK ("business"."context_relation"."from_context_id" <> "business"."context_relation"."to_context_id"),
	CONSTRAINT "context_relation_symmetric_order" CHECK ("business"."context_relation"."type" <> 'RELATED_TO' OR "business"."context_relation"."from_context_id" < "business"."context_relation"."to_context_id")
);
--> statement-breakpoint
CREATE TABLE "business"."context" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"purpose" text NOT NULL,
	"scope" text NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'ACTIVE' NOT NULL,
	"superseded_by_id" uuid,
	"identity_revision" integer DEFAULT 1 NOT NULL,
	"membership_revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "context_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "context_name_nonempty" CHECK (length(trim("business"."context"."name")) BETWEEN 1 AND 200),
	CONSTRAINT "context_purpose_nonempty" CHECK (length(trim("business"."context"."purpose")) BETWEEN 1 AND 2000),
	CONSTRAINT "context_scope_nonempty" CHECK (length(trim("business"."context"."scope")) BETWEEN 1 AND 2000),
	CONSTRAINT "context_kind_check" CHECK ("business"."context"."kind" IN ('TOPIC', 'FLOW', 'PROJECT', 'COLLECTION')),
	CONSTRAINT "context_state_check" CHECK ("business"."context"."state" IN ('ACTIVE', 'ARCHIVED', 'SUPERSEDED')),
	CONSTRAINT "context_versions_positive" CHECK ("business"."context"."identity_revision" > 0 AND "business"."context"."membership_revision" > 0),
	CONSTRAINT "context_superseded_target_check" CHECK (("business"."context"."state" = 'SUPERSEDED') = ("business"."context"."superseded_by_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "business"."thought_relation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"from_unit_id" uuid NOT NULL,
	"from_revision" integer NOT NULL,
	"to_unit_id" uuid NOT NULL,
	"to_revision" integer NOT NULL,
	"type" text NOT NULL,
	"approved_by_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "thought_relation_type_check" CHECK ("business"."thought_relation"."type" IN ('SUPPORTS', 'CONTRADICTS', 'REFINES', 'RESULT_OF', 'RELATED_TO')),
	CONSTRAINT "thought_relation_not_self" CHECK ("business"."thought_relation"."from_unit_id" <> "business"."thought_relation"."to_unit_id" OR "business"."thought_relation"."from_revision" <> "business"."thought_relation"."to_revision"),
	CONSTRAINT "thought_relation_symmetric_order" CHECK ("business"."thought_relation"."type" NOT IN ('CONTRADICTS', 'RELATED_TO') OR ("business"."thought_relation"."from_unit_id", "business"."thought_relation"."from_revision") < ("business"."thought_relation"."to_unit_id", "business"."thought_relation"."to_revision"))
);
--> statement-breakpoint
ALTER TABLE "business"."thought_unit" ADD COLUMN "membership_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "business"."context_identity_revision" ADD CONSTRAINT "context_identity_revision_context_fk" FOREIGN KEY ("workspace_id","context_id") REFERENCES "business"."context"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."context_membership" ADD CONSTRAINT "context_membership_unit_fk" FOREIGN KEY ("workspace_id","unit_id") REFERENCES "business"."thought_unit"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."context_membership" ADD CONSTRAINT "context_membership_unit_revision_fk" FOREIGN KEY ("workspace_id","unit_id","unit_revision") REFERENCES "business"."thought_unit_revision"("workspace_id","unit_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."context_membership" ADD CONSTRAINT "context_membership_context_fk" FOREIGN KEY ("workspace_id","context_id") REFERENCES "business"."context"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."context_relation" ADD CONSTRAINT "context_relation_from_fk" FOREIGN KEY ("workspace_id","from_context_id") REFERENCES "business"."context"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."context_relation" ADD CONSTRAINT "context_relation_to_fk" FOREIGN KEY ("workspace_id","to_context_id") REFERENCES "business"."context"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."thought_relation" ADD CONSTRAINT "thought_relation_from_fk" FOREIGN KEY ("workspace_id","from_unit_id","from_revision") REFERENCES "business"."thought_unit_revision"("workspace_id","unit_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."thought_relation" ADD CONSTRAINT "thought_relation_to_fk" FOREIGN KEY ("workspace_id","to_unit_id","to_revision") REFERENCES "business"."thought_unit_revision"("workspace_id","unit_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "context_membership_active_pair_unique" ON "business"."context_membership" USING btree ("workspace_id","unit_id","context_id") WHERE "business"."context_membership"."ended_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "context_membership_active_primary_unique" ON "business"."context_membership" USING btree ("workspace_id","unit_id") WHERE "business"."context_membership"."ended_at" IS NULL AND "business"."context_membership"."role" = 'PRIMARY';--> statement-breakpoint
CREATE INDEX "context_membership_context_active_idx" ON "business"."context_membership" USING btree ("workspace_id","context_id","ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX "context_relation_active_unique" ON "business"."context_relation" USING btree ("workspace_id","from_context_id","to_context_id","type") WHERE "business"."context_relation"."ended_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "thought_relation_active_unique" ON "business"."thought_relation" USING btree ("workspace_id","from_unit_id","from_revision","to_unit_id","to_revision","type") WHERE "business"."thought_relation"."ended_at" IS NULL;--> statement-breakpoint
ALTER TABLE "business"."thought_unit" ADD CONSTRAINT "thought_unit_membership_version_positive" CHECK ("business"."thought_unit"."membership_version" > 0);
--> statement-breakpoint
ALTER TABLE "business"."context" ADD CONSTRAINT "context_not_self_superseded" CHECK ("business"."context"."superseded_by_id" IS NULL OR "business"."context"."id" <> "business"."context"."superseded_by_id");
--> statement-breakpoint
ALTER TABLE "business"."context" ADD CONSTRAINT "context_workspace_fk" FOREIGN KEY (workspace_id) REFERENCES "business"."workspace"(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "business"."context" ADD CONSTRAINT "context_current_identity_fk" FOREIGN KEY (workspace_id, id, identity_revision) REFERENCES "business"."context_identity_revision"(workspace_id, context_id, revision) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "business"."context" ADD CONSTRAINT "context_superseded_target_fk" FOREIGN KEY (workspace_id, superseded_by_id) REFERENCES "business"."context"(workspace_id, id);
--> statement-breakpoint
ALTER TABLE "business"."context" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."context_identity_revision" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."context_membership" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."context_relation" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."thought_relation" OWNER TO "ieum_migrator";
--> statement-breakpoint
REVOKE ALL ON "business"."context", "business"."context_identity_revision", "business"."context_membership", "business"."context_relation", "business"."thought_relation" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON "business"."context", "business"."context_identity_revision", "business"."context_membership", "business"."context_relation", "business"."thought_relation" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (name, purpose, scope, kind, state, superseded_by_id, identity_revision, membership_revision, updated_at) ON "business"."context" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (ended_at, ended_reason) ON "business"."context_membership" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (ended_at) ON "business"."context_relation", "business"."thought_relation" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (membership_version) ON "business"."thought_unit" TO "ieum_application";
--> statement-breakpoint
ALTER TABLE "business"."context" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."context" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "context_scope" ON "business"."context" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."context_identity_revision" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."context_identity_revision" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "context_identity_revision_scope" ON "business"."context_identity_revision" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."context_membership" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."context_membership" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "context_membership_scope" ON "business"."context_membership" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."context_relation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."context_relation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "context_relation_scope" ON "business"."context_relation" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."thought_relation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."thought_relation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "thought_relation_scope" ON "business"."thought_relation" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
