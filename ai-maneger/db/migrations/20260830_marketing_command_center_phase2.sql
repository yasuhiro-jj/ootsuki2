CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS marketing_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key TEXT NOT NULL,
  name TEXT NOT NULL,
  agency_id TEXT,
  instagram_account_id TEXT,
  gbp_location_id TEXT,
  canva_brand_id TEXT,
  instagram_app_url TEXT,
  gbp_app_url TEXT,
  canva_app_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_stores_tenant
  ON marketing_stores (tenant_key, created_at ASC);

CREATE TABLE IF NOT EXISTS marketing_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key TEXT NOT NULL,
  store_id UUID NOT NULL REFERENCES marketing_stores(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  goal_type TEXT NOT NULL,
  target_value NUMERIC,
  current_value NUMERIC,
  unit TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_goals_store_status
  ON marketing_goals (tenant_key, store_id, status);

CREATE TABLE IF NOT EXISTS marketing_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key TEXT NOT NULL,
  store_id UUID REFERENCES marketing_stores(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_channel TEXT NOT NULL,
  content_theme TEXT NOT NULL,
  priority TEXT NOT NULL,
  target_kpi TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  approval_status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revision_note TEXT,
  metrics_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  evaluation JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE marketing_actions
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES marketing_stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revision_note TEXT;

UPDATE marketing_actions
   SET status = CASE
     WHEN status = 'posted' THEN 'executed'
     WHEN status = 'evaluated' THEN 'completed'
     WHEN status = 'archived' THEN 'rejected'
     WHEN status IN ('proposed', 'approved', 'in_progress', 'executed', 'measuring', 'completed', 'rejected') THEN status
     ELSE 'proposed'
   END;

ALTER TABLE marketing_actions
  DROP CONSTRAINT IF EXISTS marketing_actions_target_channel_check,
  DROP CONSTRAINT IF EXISTS marketing_actions_status_check,
  DROP CONSTRAINT IF EXISTS marketing_actions_priority_check,
  DROP CONSTRAINT IF EXISTS marketing_actions_approval_status_check;

ALTER TABLE marketing_actions
  ADD CONSTRAINT marketing_actions_target_channel_check
    CHECK (target_channel IN ('instagram', 'gbp', 'canva', 'multi')),
  ADD CONSTRAINT marketing_actions_status_check
    CHECK (status IN ('proposed', 'approved', 'in_progress', 'executed', 'measuring', 'completed', 'rejected')),
  ADD CONSTRAINT marketing_actions_priority_check
    CHECK (priority IN ('high', 'medium', 'low')),
  ADD CONSTRAINT marketing_actions_approval_status_check
    CHECK (approval_status IN ('pending', 'approved', 'changes_requested', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_marketing_actions_tenant_created
  ON marketing_actions (tenant_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_actions_store_status
  ON marketing_actions (tenant_key, store_id, status);

CREATE TABLE IF NOT EXISTS marketing_action_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key TEXT NOT NULL,
  action_id UUID NOT NULL REFERENCES marketing_actions(id) ON DELETE CASCADE,
  store_id UUID REFERENCES marketing_stores(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  executed_at TIMESTAMPTZ,
  external_post_id TEXT,
  external_url TEXT,
  metrics_before JSONB,
  metrics_after JSONB,
  result_summary TEXT,
  ai_evaluation TEXT,
  score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE marketing_action_executions
  DROP CONSTRAINT IF EXISTS marketing_action_executions_channel_check;

ALTER TABLE marketing_action_executions
  ADD CONSTRAINT marketing_action_executions_channel_check
    CHECK (channel IN ('instagram', 'gbp', 'canva', 'multi'));

CREATE INDEX IF NOT EXISTS idx_marketing_action_executions_action
  ON marketing_action_executions (tenant_key, action_id, created_at DESC);

CREATE TABLE IF NOT EXISTS marketing_integration_statuses (
  tenant_key TEXT NOT NULL,
  store_id UUID NOT NULL REFERENCES marketing_stores(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  status TEXT NOT NULL,
  last_checked_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_key, store_id, service)
);

ALTER TABLE marketing_goals
  DROP CONSTRAINT IF EXISTS marketing_goals_goal_type_check,
  DROP CONSTRAINT IF EXISTS marketing_goals_status_check;

ALTER TABLE marketing_goals
  ADD CONSTRAINT marketing_goals_goal_type_check
    CHECK (goal_type IN (
      'instagram_reach',
      'instagram_non_follower_reach',
      'gbp_views',
      'gbp_actions',
      'reviews',
      'reservations',
      'line_registrations',
      'sales',
      'custom'
    )),
  ADD CONSTRAINT marketing_goals_status_check
    CHECK (status IN ('active', 'completed', 'paused'));

ALTER TABLE marketing_integration_statuses
  DROP CONSTRAINT IF EXISTS marketing_integration_statuses_service_check,
  DROP CONSTRAINT IF EXISTS marketing_integration_statuses_status_check;

ALTER TABLE marketing_integration_statuses
  ADD CONSTRAINT marketing_integration_statuses_service_check
    CHECK (service IN ('instagram', 'gbp', 'canva')),
  ADD CONSTRAINT marketing_integration_statuses_status_check
    CHECK (status IN ('connected', 'disconnected', 'expired', 'error'));

ALTER TABLE public.marketing_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_action_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_integration_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant can manage own marketing stores" ON public.marketing_stores;
DROP POLICY IF EXISTS "tenant can manage own marketing goals" ON public.marketing_goals;
DROP POLICY IF EXISTS "tenant can manage own marketing actions" ON public.marketing_actions;
DROP POLICY IF EXISTS "tenant can manage own marketing executions" ON public.marketing_action_executions;
DROP POLICY IF EXISTS "tenant can manage own marketing integrations" ON public.marketing_integration_statuses;

CREATE POLICY "tenant can manage own marketing stores"
  ON public.marketing_stores FOR ALL TO authenticated
  USING (tenant_key = current_setting('app.tenant_key', true))
  WITH CHECK (tenant_key = current_setting('app.tenant_key', true));

CREATE POLICY "tenant can manage own marketing goals"
  ON public.marketing_goals FOR ALL TO authenticated
  USING (tenant_key = current_setting('app.tenant_key', true))
  WITH CHECK (tenant_key = current_setting('app.tenant_key', true));

CREATE POLICY "tenant can manage own marketing actions"
  ON public.marketing_actions FOR ALL TO authenticated
  USING (tenant_key = current_setting('app.tenant_key', true))
  WITH CHECK (tenant_key = current_setting('app.tenant_key', true));

CREATE POLICY "tenant can manage own marketing executions"
  ON public.marketing_action_executions FOR ALL TO authenticated
  USING (tenant_key = current_setting('app.tenant_key', true))
  WITH CHECK (tenant_key = current_setting('app.tenant_key', true));

CREATE POLICY "tenant can manage own marketing integrations"
  ON public.marketing_integration_statuses FOR ALL TO authenticated
  USING (tenant_key = current_setting('app.tenant_key', true))
  WITH CHECK (tenant_key = current_setting('app.tenant_key', true));
