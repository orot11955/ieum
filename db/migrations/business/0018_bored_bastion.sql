ALTER TABLE "delivery"."client_credential" ADD COLUMN "issued_authz_version" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION delivery.resolve_credential(p_id uuid,p_token_hash text)
RETURNS TABLE(workspace_id uuid,channel_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,delivery
AS $$
  SELECT c.workspace_id,c.channel_id
  FROM delivery.client_credential c
  JOIN business.user_access ua
    ON ua.user_id=c.created_by_id AND ua.personal_workspace_id=c.workspace_id
   AND ua.state='ACTIVE' AND ua.authz_version=c.issued_authz_version
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
