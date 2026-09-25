CREATE TABLE "business"."generation_application" (
	"workspace_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"base_draft_version" integer NOT NULL,
	"resulting_draft_version" integer NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_application_pk" PRIMARY KEY("workspace_id","request_id","proposal_id"),
	CONSTRAINT "generation_application_versions_check" CHECK ("business"."generation_application"."base_draft_version">0 AND "business"."generation_application"."resulting_draft_version"="business"."generation_application"."base_draft_version"+1)
);
--> statement-breakpoint
CREATE TABLE "business"."generation_artifact" (
	"workspace_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"output" jsonb NOT NULL,
	"diff" jsonb NOT NULL,
	"source_manifest" jsonb NOT NULL,
	"input_hash" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"estimated_cost_microusd" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_artifact_pk" PRIMARY KEY("workspace_id","request_id"),
	CONSTRAINT "generation_artifact_hash_check" CHECK (length("business"."generation_artifact"."input_hash")=64),
	CONSTRAINT "generation_artifact_usage_check" CHECK ("business"."generation_artifact"."input_tokens">=0 AND "business"."generation_artifact"."output_tokens">=0 AND "business"."generation_artifact"."estimated_cost_microusd">=0)
);
--> statement-breakpoint
CREATE TABLE "business"."generation_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"document_id" uuid NOT NULL,
	"pack_id" uuid NOT NULL,
	"pack_revision" integer NOT NULL,
	"draft_version" integer NOT NULL,
	"mode" text NOT NULL,
	"source_indices" jsonb NOT NULL,
	"target_block_ids" jsonb NOT NULL,
	"state" text DEFAULT 'QUEUED' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"model_id" text NOT NULL,
	"prompt_revision" text NOT NULL,
	"input_hash" text NOT NULL,
	"max_input_tokens" integer NOT NULL,
	"max_output_tokens" integer NOT NULL,
	"max_cost_microusd" integer NOT NULL,
	"reserved_cost_microusd" integer NOT NULL,
	"actual_cost_microusd" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_request_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "generation_request_state_check" CHECK ("business"."generation_request"."state" IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELED','STALE')),
	CONSTRAINT "generation_request_mode_check" CHECK ("business"."generation_request"."mode" IN ('outline','refine','draft')),
	CONSTRAINT "generation_request_positive" CHECK ("business"."generation_request"."pack_revision">0 AND "business"."generation_request"."draft_version">0 AND "business"."generation_request"."max_input_tokens">0 AND "business"."generation_request"."max_output_tokens">0 AND "business"."generation_request"."max_cost_microusd">0 AND "business"."generation_request"."reserved_cost_microusd">0 AND "business"."generation_request"."retry_count">=0 AND ("business"."generation_request"."actual_cost_microusd" IS NULL OR "business"."generation_request"."actual_cost_microusd">=0)),
	CONSTRAINT "generation_request_hash_check" CHECK (length("business"."generation_request"."input_hash")=64)
);
--> statement-breakpoint
ALTER TABLE "business"."generation_application" ADD CONSTRAINT "generation_application_request_fk" FOREIGN KEY ("workspace_id","request_id") REFERENCES "business"."generation_request"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."generation_application" ADD CONSTRAINT "generation_application_document_fk" FOREIGN KEY ("workspace_id","document_id") REFERENCES "business"."document"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."generation_artifact" ADD CONSTRAINT "generation_artifact_request_fk" FOREIGN KEY ("workspace_id","request_id") REFERENCES "business"."generation_request"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."generation_request" ADD CONSTRAINT "generation_request_document_fk" FOREIGN KEY ("workspace_id","document_id") REFERENCES "business"."document"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."generation_request" ADD CONSTRAINT "generation_request_pack_document_fk" FOREIGN KEY ("workspace_id","pack_id","document_id") REFERENCES "business"."evidence_pack"("workspace_id","id","document_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business"."generation_request" ADD CONSTRAINT "generation_request_pack_revision_fk" FOREIGN KEY ("workspace_id","pack_id","pack_revision") REFERENCES "business"."evidence_pack_revision"("workspace_id","pack_id","revision") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'generation_request','generation_artifact','generation_application'
  ] LOOP
    EXECUTE format('ALTER TABLE business.%I OWNER TO ieum_migrator', relation_name);
    EXECUTE format('REVOKE ALL ON business.%I FROM PUBLIC', relation_name);
    EXECUTE format('ALTER TABLE business.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE business.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format(
      'CREATE POLICY %I ON business.%I TO ieum_application USING (workspace_id::text = current_setting(''ieum.workspace_id'', true)) WITH CHECK (workspace_id::text = current_setting(''ieum.workspace_id'', true))',
      relation_name || '_scope', relation_name
    );
  END LOOP;
END $$;
--> statement-breakpoint
GRANT SELECT, INSERT ON "business"."generation_request", "business"."generation_artifact", "business"."generation_application" TO "ieum_application";
--> statement-breakpoint
GRANT UPDATE (state,retry_count,error_code,actual_cost_microusd,updated_at) ON "business"."generation_request" TO "ieum_application";
