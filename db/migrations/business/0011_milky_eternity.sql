CREATE TABLE "business"."context_successor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_context_id" uuid NOT NULL,
	"target_context_id" uuid NOT NULL,
	"mutation_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "context_successor_not_self" CHECK ("business"."context_successor"."source_context_id"<>"business"."context_successor"."target_context_id")
);
--> statement-breakpoint
CREATE TABLE "business"."structure_mutation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"kind" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"state" text DEFAULT 'APPLIED' NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone,
	CONSTRAINT "structure_mutation_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "structure_mutation_proposal_unique" UNIQUE("workspace_id","proposal_id"),
	CONSTRAINT "structure_mutation_state_check" CHECK ("business"."structure_mutation"."state" IN ('APPLIED','UNDONE'))
);
--> statement-breakpoint
CREATE TABLE "business"."structure_proposal" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"kind" text NOT NULL,
	"source_context_id" uuid NOT NULL,
	"preview" jsonb NOT NULL,
	"signature" text NOT NULL,
	"state" text DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	CONSTRAINT "structure_proposal_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "structure_proposal_signature_hash" CHECK (length("business"."structure_proposal"."signature")=64),
	CONSTRAINT "structure_proposal_kind_check" CHECK ("business"."structure_proposal"."kind" IN ('SPLIT','MERGE','LINK','CREATE_PARENT')),
	CONSTRAINT "structure_proposal_state_check" CHECK ("business"."structure_proposal"."state" IN ('PENDING','APPLIED','EXPIRED','SUPERSEDED'))
);
--> statement-breakpoint
ALTER TABLE "business"."context" DROP CONSTRAINT "context_superseded_target_check";--> statement-breakpoint
ALTER TABLE "business"."context_successor" ADD CONSTRAINT "context_successor_source_fk" FOREIGN KEY ("workspace_id","source_context_id") REFERENCES "business"."context"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."context_successor" ADD CONSTRAINT "context_successor_target_fk" FOREIGN KEY ("workspace_id","target_context_id") REFERENCES "business"."context"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."context_successor" ADD CONSTRAINT "context_successor_mutation_fk" FOREIGN KEY ("workspace_id","mutation_id") REFERENCES "business"."structure_mutation"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."structure_mutation" ADD CONSTRAINT "structure_mutation_proposal_fk" FOREIGN KEY ("workspace_id","proposal_id") REFERENCES "business"."structure_proposal"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."structure_proposal" ADD CONSTRAINT "structure_proposal_source_fk" FOREIGN KEY ("workspace_id","source_context_id") REFERENCES "business"."context"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "context_successor_active_unique" ON "business"."context_successor" USING btree ("workspace_id","source_context_id","target_context_id") WHERE "business"."context_successor"."ended_at" IS NULL;--> statement-breakpoint
ALTER TABLE "business"."context" ADD CONSTRAINT "context_superseded_target_check" CHECK ("business"."context"."state" = 'SUPERSEDED' OR "business"."context"."superseded_by_id" IS NULL);
--> statement-breakpoint
ALTER TABLE "business"."structure_proposal" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."structure_mutation" OWNER TO "ieum_migrator";
--> statement-breakpoint
ALTER TABLE "business"."context_successor" OWNER TO "ieum_migrator";
--> statement-breakpoint
REVOKE ALL ON "business"."structure_proposal", "business"."structure_mutation", "business"."context_successor" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON "business"."structure_proposal", "business"."structure_mutation", "business"."context_successor" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (state,applied_at) ON "business"."structure_proposal" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (state,undone_at,"after") ON "business"."structure_mutation" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (ended_at) ON "business"."context_successor" TO "ieum_application";
--> statement-breakpoint
ALTER TABLE "business"."structure_proposal" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."structure_proposal" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "structure_proposal_scope" ON "business"."structure_proposal" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."structure_mutation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."structure_mutation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "structure_mutation_scope" ON "business"."structure_mutation" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
ALTER TABLE "business"."context_successor" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business"."context_successor" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "context_successor_scope" ON "business"."context_successor" TO "ieum_application" USING (workspace_id::text = current_setting('ieum.workspace_id', true)) WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id', true));
--> statement-breakpoint
CREATE FUNCTION "business"."ensure_context_successor"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, business AS $$
DECLARE scoped_workspace uuid;
DECLARE scoped_context uuid;
DECLARE current_state text;
DECLARE single_target uuid;
BEGIN
  IF TG_TABLE_NAME = 'context' THEN
    scoped_workspace := NEW.workspace_id;
    scoped_context := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    scoped_workspace := OLD.workspace_id;
    scoped_context := OLD.source_context_id;
  ELSE
    scoped_workspace := NEW.workspace_id;
    scoped_context := NEW.source_context_id;
  END IF;
  SELECT state,superseded_by_id INTO current_state,single_target
    FROM business.context WHERE workspace_id=scoped_workspace AND id=scoped_context;
  IF current_state = 'SUPERSEDED' AND single_target IS NULL AND NOT EXISTS (
    SELECT 1 FROM business.context_successor
    WHERE workspace_id=scoped_workspace AND source_context_id=scoped_context AND ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'superseded context requires a successor' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
ALTER FUNCTION "business"."ensure_context_successor"() OWNER TO "ieum_migrator";
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "context_successor_required" AFTER INSERT OR UPDATE ON "business"."context" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "business"."ensure_context_successor"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "context_successor_still_required" AFTER INSERT OR UPDATE OR DELETE ON "business"."context_successor" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "business"."ensure_context_successor"();
