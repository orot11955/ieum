CREATE TABLE "business"."transfer_origin" (
	"workspace_id" uuid NOT NULL,
	"record_kind" text NOT NULL,
	"source_workspace_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_revision" integer NOT NULL,
	"target_id" uuid NOT NULL,
	CONSTRAINT "transfer_origin_pk" PRIMARY KEY("workspace_id","record_kind","source_workspace_id","source_id"),
	CONSTRAINT "transfer_origin_revision_check" CHECK ("business"."transfer_origin"."source_revision">0)
);
--> statement-breakpoint
ALTER TABLE business.transfer_origin ADD CONSTRAINT transfer_origin_workspace_fk
  FOREIGN KEY (workspace_id) REFERENCES business.workspace(id);
--> statement-breakpoint
ALTER TABLE business.transfer_origin OWNER TO ieum_migrator;
--> statement-breakpoint
REVOKE ALL ON business.transfer_origin FROM PUBLIC;
--> statement-breakpoint
ALTER TABLE business.transfer_origin ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE business.transfer_origin FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY transfer_origin_workspace_scope ON business.transfer_origin
  TO ieum_application
  USING (workspace_id::text=current_setting('ieum.workspace_id',true))
  WITH CHECK (workspace_id::text=current_setting('ieum.workspace_id',true));
--> statement-breakpoint
GRANT SELECT,INSERT ON business.transfer_origin TO ieum_application;
