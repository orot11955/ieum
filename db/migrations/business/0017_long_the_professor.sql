CREATE TABLE "delivery"."client_credential" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_id" text NOT NULL,
	"state" text DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_client_credential_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "delivery_client_credential_hash_check" CHECK (length("delivery"."client_credential"."token_hash")=64),
	CONSTRAINT "delivery_client_credential_state_check" CHECK ("delivery"."client_credential"."state" IN ('ACTIVE','REVOKED')),
	CONSTRAINT "delivery_client_credential_expiry_check" CHECK ("delivery"."client_credential"."expires_at">"delivery"."client_credential"."created_at"),
	CONSTRAINT "delivery_client_credential_revoked_check" CHECK (("delivery"."client_credential"."state"='REVOKED')=("delivery"."client_credential"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "delivery"."client_credential" ADD CONSTRAINT "delivery_client_credential_channel_fk" FOREIGN KEY ("workspace_id","channel_id") REFERENCES "business"."publication_channel"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE delivery.client_credential OWNER TO ieum_migrator;
--> statement-breakpoint
REVOKE ALL ON delivery.client_credential FROM PUBLIC;
--> statement-breakpoint
ALTER TABLE delivery.client_credential ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE delivery.client_credential FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY client_credential_application_scope ON delivery.client_credential
  TO ieum_application
  USING (workspace_id::text = current_setting('ieum.workspace_id',true))
  WITH CHECK (workspace_id::text = current_setting('ieum.workspace_id',true));
--> statement-breakpoint
CREATE POLICY client_credential_lookup_owner ON delivery.client_credential
  TO ieum_migrator USING (true);
--> statement-breakpoint
CREATE POLICY workspace_delivery_owner_lookup ON business.workspace
  TO ieum_migrator USING (true);
--> statement-breakpoint
CREATE POLICY workspace_member_delivery_owner_lookup ON business.workspace_member
  TO ieum_migrator USING (true);
--> statement-breakpoint
CREATE POLICY publication_channel_delivery_owner_lookup ON business.publication_channel
  TO ieum_migrator USING (true);
--> statement-breakpoint
CREATE POLICY publication_delivery_owner_lock ON delivery.publication
  TO ieum_migrator USING (true);
--> statement-breakpoint
GRANT SELECT,INSERT ON delivery.client_credential TO ieum_application;
--> statement-breakpoint
GRANT UPDATE (state,revoked_at) ON delivery.client_credential TO ieum_application;
--> statement-breakpoint
GRANT USAGE ON SCHEMA delivery TO ieum_delivery;
--> statement-breakpoint
GRANT SELECT ON delivery.publication,delivery.publication_revision,
  delivery.publication_slug,delivery.publication_asset TO ieum_delivery;
--> statement-breakpoint
CREATE POLICY publication_delivery_scope ON delivery.publication
  TO ieum_delivery
  USING (workspace_id::text=current_setting('ieum.workspace_id',true)
    AND state='PUBLISHED');
--> statement-breakpoint
CREATE POLICY publication_revision_delivery_scope ON delivery.publication_revision
  TO ieum_delivery
  USING (workspace_id::text=current_setting('ieum.workspace_id',true)
    AND EXISTS (
      SELECT 1 FROM delivery.publication p
      WHERE p.workspace_id=publication_revision.workspace_id
        AND p.id=publication_revision.publication_id
        AND p.current_revision=publication_revision.revision
        AND p.state='PUBLISHED'
    ));
--> statement-breakpoint
CREATE POLICY publication_slug_delivery_scope ON delivery.publication_slug
  TO ieum_delivery
  USING (workspace_id::text=current_setting('ieum.workspace_id',true)
    AND EXISTS (
      SELECT 1 FROM delivery.publication p
      WHERE p.workspace_id=publication_slug.workspace_id
        AND p.id=publication_slug.publication_id
        AND p.state='PUBLISHED'
    ));
--> statement-breakpoint
CREATE POLICY publication_asset_delivery_scope ON delivery.publication_asset
  TO ieum_delivery
  USING (workspace_id::text=current_setting('ieum.workspace_id',true)
    AND EXISTS (
      SELECT 1 FROM delivery.publication p
      WHERE p.workspace_id=publication_asset.workspace_id
        AND p.id=publication_asset.publication_id
        AND p.current_revision=publication_asset.revision
        AND p.state='PUBLISHED'
    ));
--> statement-breakpoint
CREATE FUNCTION delivery.resolve_credential(p_id uuid,p_token_hash text)
RETURNS TABLE(workspace_id uuid,channel_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,delivery
AS $$
  SELECT c.workspace_id,c.channel_id
  FROM delivery.client_credential c
  JOIN business.user_access ua
    ON ua.user_id=c.created_by_id AND ua.personal_workspace_id=c.workspace_id
   AND ua.state='ACTIVE'
  JOIN business.workspace w ON w.id=c.workspace_id AND w.state='ACTIVE'
  JOIN business.workspace_member wm
    ON wm.workspace_id=c.workspace_id AND wm.user_id=c.created_by_id
   AND wm.state='ACTIVE' AND wm.role='OWNER'
  JOIN business.publication_channel pc
    ON pc.workspace_id=c.workspace_id AND pc.id=c.channel_id AND pc.state='ACTIVE'
  WHERE c.id=p_id AND c.token_hash=p_token_hash
    AND c.state='ACTIVE' AND c.expires_at>clock_timestamp()
  FOR SHARE OF c,ua,w,wm,pc
$$;
--> statement-breakpoint
ALTER FUNCTION delivery.resolve_credential(uuid,text) OWNER TO ieum_migrator;
--> statement-breakpoint
REVOKE ALL ON FUNCTION delivery.resolve_credential(uuid,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION delivery.resolve_credential(uuid,text) TO ieum_delivery;
--> statement-breakpoint
CREATE FUNCTION delivery.lock_publication(p_workspace_id uuid,p_channel_id uuid,p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,delivery
AS $$
BEGIN
  PERFORM 1 FROM delivery.publication p
  WHERE p.workspace_id=p_workspace_id AND p.channel_id=p_channel_id
    AND p.id=p_id AND p.state='PUBLISHED'
  FOR SHARE OF p;
END $$;
--> statement-breakpoint
ALTER FUNCTION delivery.lock_publication(uuid,uuid,uuid) OWNER TO ieum_migrator;
--> statement-breakpoint
REVOKE ALL ON FUNCTION delivery.lock_publication(uuid,uuid,uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION delivery.lock_publication(uuid,uuid,uuid) TO ieum_delivery;
