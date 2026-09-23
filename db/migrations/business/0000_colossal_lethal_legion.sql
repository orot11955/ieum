CREATE SCHEMA "business";
--> statement-breakpoint
CREATE TABLE "business"."workspace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"personal_owner_id" text NOT NULL,
	"state" text DEFAULT 'ACTIVE' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_personal_owner_id_unique" UNIQUE("personal_owner_id"),
	CONSTRAINT "workspace_state_check" CHECK ("business"."workspace"."state" in ('ACTIVE', 'SUSPENDED', 'DELETION_PENDING')),
	CONSTRAINT "workspace_version_positive" CHECK ("business"."workspace"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "business"."workspace_member" (
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'OWNER' NOT NULL,
	"state" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_member_pk" PRIMARY KEY("workspace_id","user_id"),
	CONSTRAINT "workspace_member_role_check" CHECK ("business"."workspace_member"."role" in ('OWNER', 'EDITOR', 'VIEWER')),
	CONSTRAINT "workspace_member_state_check" CHECK ("business"."workspace_member"."state" in ('ACTIVE', 'SUSPENDED'))
);
--> statement-breakpoint
ALTER TABLE "business"."workspace_member" ADD CONSTRAINT "workspace_member_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "business"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business"."workspace" ADD CONSTRAINT "workspace_personal_owner_auth_fk" FOREIGN KEY ("personal_owner_id") REFERENCES "auth"."user"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "business"."workspace_member" ADD CONSTRAINT "workspace_member_user_auth_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "business"."workspace" ADD CONSTRAINT "workspace_owner_member_fk" FOREIGN KEY ("id", "personal_owner_id") REFERENCES "business"."workspace_member"("workspace_id", "user_id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE INDEX "workspace_member_user_id_idx" ON "business"."workspace_member" ("user_id");
--> statement-breakpoint
ALTER SCHEMA "business" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."workspace" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."workspace_member" OWNER TO "ieum_migrator";
--> statement-breakpoint
REVOKE ALL ON SCHEMA "business" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA "business" FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "business" TO "ieum_application";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "business" TO "ieum_application";
--> statement-breakpoint
GRANT USAGE ON SCHEMA "auth" TO "ieum_auth_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "auth" TO "ieum_auth_runtime";
--> statement-breakpoint
ALTER TABLE "business"."workspace" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."workspace" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_scope" ON "business"."workspace" TO "ieum_application" USING ("id"::text = current_setting('ieum.workspace_id', true)) WITH CHECK ("id"::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."workspace_member" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."workspace_member" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_member_scope" ON "business"."workspace_member" TO "ieum_application" USING ("workspace_id"::text = current_setting('ieum.workspace_id', true)) WITH CHECK ("workspace_id"::text = current_setting('ieum.workspace_id', true));
