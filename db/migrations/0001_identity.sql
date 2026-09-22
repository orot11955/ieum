CREATE TABLE auth_user (
 id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, email_verified boolean NOT NULL DEFAULT false,
 image text, two_factor_enabled boolean DEFAULT false, status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED','DELETION_PENDING')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE TABLE auth_session (
 id text PRIMARY KEY, token text NOT NULL UNIQUE, user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 ip_address text,user_agent text
);
-- statement-breakpoint
CREATE INDEX auth_session_user ON auth_session(user_id);
-- statement-breakpoint
CREATE TABLE auth_account (
 id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL, user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
 access_token text,refresh_token text,id_token text,access_token_expires_at timestamptz,refresh_token_expires_at timestamptz,scope text,password text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(provider_id,account_id)
);
-- statement-breakpoint
CREATE INDEX auth_account_user ON auth_account(user_id);
-- statement-breakpoint
CREATE TABLE auth_verification (
 id text PRIMARY KEY,identifier text NOT NULL,value text NOT NULL,expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE INDEX auth_verification_identifier ON auth_verification(identifier);
-- statement-breakpoint
CREATE TABLE auth_factor (
 id text PRIMARY KEY,secret text NOT NULL,backup_codes text NOT NULL,user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
 verified boolean DEFAULT true,failed_verification_count integer DEFAULT 0,locked_until timestamptz
);
-- statement-breakpoint
CREATE INDEX auth_factor_user ON auth_factor(user_id);
-- statement-breakpoint
CREATE TABLE instance_operator(user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now());
-- statement-breakpoint
CREATE TABLE workspace(id uuid PRIMARY KEY,name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
-- statement-breakpoint
CREATE TABLE workspace_member(
 workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE RESTRICT,user_id text NOT NULL REFERENCES auth_user(id) ON DELETE RESTRICT,
 role text NOT NULL DEFAULT 'OWNER' CHECK(role='OWNER'),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,user_id),UNIQUE(user_id)
);
-- statement-breakpoint
CREATE TABLE invitation(
 id uuid PRIMARY KEY,email text NOT NULL,token_digest text NOT NULL UNIQUE,issued_by text NOT NULL REFERENCES auth_user(id),expires_at timestamptz NOT NULL,
 accepted_at timestamptz,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE TABLE user_preference(
 user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,theme text NOT NULL DEFAULT 'system' CHECK(theme IN ('light','dark','system')),
 timezone text NOT NULL DEFAULT 'Asia/Seoul',core_enabled boolean NOT NULL DEFAULT true,external_ai_allowed boolean NOT NULL DEFAULT false
);
-- statement-breakpoint
CREATE TABLE app_session_state(
 session_id text PRIMARY KEY REFERENCES auth_session(id) ON DELETE CASCADE,last_active_at timestamptz NOT NULL DEFAULT now(),reauth_until timestamptz
);
-- statement-breakpoint
CREATE TABLE instance_audit_event(
 id uuid PRIMARY KEY,actor_id text,action text NOT NULL,target_id text,result text NOT NULL DEFAULT 'SUCCESS',created_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ieum_scoped') THEN CREATE ROLE ieum_scoped NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ieum_runtime') THEN CREATE ROLE ieum_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
END $$;
-- statement-breakpoint
GRANT ieum_scoped TO ieum_runtime;
-- statement-breakpoint
GRANT USAGE ON SCHEMA public TO ieum_runtime,ieum_scoped;
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON auth_user,auth_session,auth_account,auth_verification,auth_factor,app_session_state,invitation,user_preference TO ieum_runtime;
-- statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON workspace,workspace_member,instance_operator TO ieum_runtime;
-- statement-breakpoint
GRANT SELECT,INSERT ON instance_audit_event TO ieum_runtime;
