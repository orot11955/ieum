CREATE TABLE "business"."identity_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"target_id" text,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business"."installation" (
	"id" integer PRIMARY KEY NOT NULL,
	"operator_email" text NOT NULL,
	"operator_user_id" text,
	"state" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "installation_singleton" CHECK ("business"."installation"."id" = 1),
	CONSTRAINT "installation_state_check" CHECK ("business"."installation"."state" in ('PENDING', 'ACTIVE'))
);
--> statement-breakpoint
CREATE TABLE "business"."instance_operator" (
	"user_id" text PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business"."invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_digest" text NOT NULL,
	"email" text NOT NULL,
	"issuer_id" text NOT NULL,
	"claimed_user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business"."user_access" (
	"user_id" text PRIMARY KEY NOT NULL,
	"personal_workspace_id" uuid NOT NULL,
	"state" text DEFAULT 'ACTIVE' NOT NULL,
	"authz_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_access_personal_workspace_unique" UNIQUE("personal_workspace_id"),
	CONSTRAINT "user_access_state_check" CHECK ("business"."user_access"."state" in ('ACTIVE', 'SUSPENDED', 'DELETION_PENDING')),
	CONSTRAINT "user_access_version_positive" CHECK ("business"."user_access"."authz_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "business"."user_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"external_model_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_token_digest_unique" ON "business"."invitation" USING btree ("token_digest");
--> statement-breakpoint
ALTER TABLE "business"."installation" ADD CONSTRAINT "installation_completed_check" CHECK ((state = 'PENDING' AND completed_at IS NULL) OR (state = 'ACTIVE' AND operator_user_id IS NOT NULL AND completed_at IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "business"."invitation" ADD CONSTRAINT "invitation_claim_check" CHECK ((claimed_at IS NULL) = (claimed_user_id IS NULL));
--> statement-breakpoint
ALTER TABLE "business"."invitation" ADD CONSTRAINT "invitation_consumed_check" CHECK (consumed_at IS NULL OR claimed_user_id IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "business"."installation" ADD CONSTRAINT "installation_operator_auth_fk" FOREIGN KEY ("operator_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "business"."user_access" ADD CONSTRAINT "user_access_auth_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "business"."user_access" ADD CONSTRAINT "user_access_workspace_fk" FOREIGN KEY ("personal_workspace_id") REFERENCES "business"."workspace"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "business"."instance_operator" ADD CONSTRAINT "instance_operator_access_fk" FOREIGN KEY ("user_id") REFERENCES "business"."user_access"("user_id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "business"."user_preference" ADD CONSTRAINT "user_preference_access_fk" FOREIGN KEY ("user_id") REFERENCES "business"."user_access"("user_id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "business"."invitation" ADD CONSTRAINT "invitation_issuer_auth_fk" FOREIGN KEY ("issuer_id") REFERENCES "auth"."user"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "business"."invitation" ADD CONSTRAINT "invitation_claimed_auth_fk" FOREIGN KEY ("claimed_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "business"."identity_event" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."installation" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."instance_operator" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."invitation" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."user_access" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."user_preference" OWNER TO "ieum_migrator";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "business"."identity_event", "business"."installation", "business"."instance_operator", "business"."invitation", "business"."user_access", "business"."user_preference" TO "ieum_application";
