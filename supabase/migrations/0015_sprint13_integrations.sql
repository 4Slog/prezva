-- Sprint 13: Integration infrastructure (T-116)

CREATE TYPE integration_status AS ENUM ('awaiting_credentials', 'available', 'connected', 'error');

-- Per-org integration config
CREATE TABLE IF NOT EXISTS org_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status integration_status NOT NULL DEFAULT 'awaiting_credentials',
  encrypted_refresh_token text,
  scopes text[],
  directionality_preferences jsonb DEFAULT '{}',
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, provider)
);

-- Unified integration error log
CREATE TABLE IF NOT EXISTS integration_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  operation text NOT NULL,
  error_code text,
  error_message text,
  context jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_integrations_org_idx ON org_integrations(org_id);
CREATE INDEX IF NOT EXISTS org_integrations_provider_idx ON org_integrations(provider);
CREATE INDEX IF NOT EXISTS integration_errors_org_idx ON integration_errors(org_id, provider);

ALTER TABLE org_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_integrations_service_only" ON org_integrations USING (true) WITH CHECK (true);

ALTER TABLE integration_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integration_errors_service_only" ON integration_errors USING (true) WITH CHECK (true);
