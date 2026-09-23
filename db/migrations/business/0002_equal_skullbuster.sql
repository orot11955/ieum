CREATE TABLE "business"."command_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"before_version" integer,
	"after_version" integer,
	"changed_field_names" text[] NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business"."command_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload_ref" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business"."command_receipt" (
	"workspace_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"command_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"payload_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "command_receipt_pk" PRIMARY KEY("workspace_id","actor_id","kind","idempotency_key"),
	CONSTRAINT "command_receipt_command_id_unique" UNIQUE("command_id"),
	CONSTRAINT "command_receipt_kind_nonempty" CHECK (length("business"."command_receipt"."kind") BETWEEN 1 AND 100),
	CONSTRAINT "command_receipt_key_length" CHECK (length("business"."command_receipt"."idempotency_key") BETWEEN 8 AND 128),
	CONSTRAINT "command_receipt_hash_length" CHECK (length("business"."command_receipt"."payload_hash") = 64)
);
--> statement-breakpoint
ALTER TABLE "business"."user_preference" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "business"."user_preference" ADD CONSTRAINT "user_preference_version_positive" CHECK (version > 0);
--> statement-breakpoint
ALTER TABLE "business"."command_audit" ADD CONSTRAINT "command_audit_action_nonempty" CHECK (length(action) BETWEEN 1 AND 100);
--> statement-breakpoint
ALTER TABLE "business"."command_outbox" ADD CONSTRAINT "command_outbox_event_type_nonempty" CHECK (length(event_type) BETWEEN 1 AND 100);
--> statement-breakpoint
ALTER TABLE "business"."command_receipt" ADD CONSTRAINT "command_receipt_workspace_fk" FOREIGN KEY (workspace_id) REFERENCES "business"."workspace"(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "business"."command_audit" ADD CONSTRAINT "command_audit_workspace_fk" FOREIGN KEY (workspace_id) REFERENCES "business"."workspace"(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "business"."command_outbox" ADD CONSTRAINT "command_outbox_workspace_fk" FOREIGN KEY (workspace_id) REFERENCES "business"."workspace"(id) ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "command_audit_workspace_created_idx" ON "business"."command_audit" (workspace_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX "command_outbox_workspace_created_idx" ON "business"."command_outbox" (workspace_id, created_at DESC);
--> statement-breakpoint
ALTER TABLE "business"."command_receipt" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."command_audit" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."command_outbox" OWNER TO "ieum_migrator";
--> statement-breakpoint
REVOKE ALL ON "business"."command_receipt", "business"."command_audit", "business"."command_outbox" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON "business"."command_receipt", "business"."command_audit", "business"."command_outbox" TO "ieum_application";
--> statement-breakpoint
ALTER TABLE "business"."command_receipt" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."command_receipt" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "command_receipt_scope" ON "business"."command_receipt" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."command_audit" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."command_audit" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "command_audit_scope" ON "business"."command_audit" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."command_outbox" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."command_outbox" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "command_outbox_scope" ON "business"."command_outbox" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
