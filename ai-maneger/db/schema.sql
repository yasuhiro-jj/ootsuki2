CREATE TABLE IF NOT EXISTS tenant_configs (
  tenant_key TEXT PRIMARY KEY,
  notion_token_enc TEXT NOT NULL,
  project_db_id TEXT NOT NULL,
  ootsuki_project_page_id TEXT NOT NULL,
  daily_sales_db_id TEXT NOT NULL,
  kpi_db_id TEXT NOT NULL,
  memo_db_id TEXT NOT NULL,
  line_report_page_id TEXT NOT NULL,
  product_cost_db_id TEXT NOT NULL,
  weekly_actions_db_id TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_configs_active
  ON tenant_configs (is_active);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  tenant_key TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor', 'admin', 'owner')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_key, principal_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_active
  ON tenant_memberships (tenant_key, principal_id, is_active);

CREATE TABLE IF NOT EXISTS tenant_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_key TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_audit_logs_lookup
  ON tenant_audit_logs (tenant_key, created_at DESC);
