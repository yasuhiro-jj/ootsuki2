-- AI会社OS: 承認・却下・保留の保存
-- Supabase SQL Editor で実行する。再実行しても壊れない。

CREATE TABLE IF NOT EXISTS public.os_task_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_title TEXT NOT NULL,
  agent_key TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason_text TEXT,
  hold_until DATE,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT os_task_decisions_decision_check
    CHECK (decision IN ('approve', 'modify', 'hold', 'reject'))
);

CREATE INDEX IF NOT EXISTS idx_os_task_decisions_tenant_decided
  ON public.os_task_decisions (tenant_key, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_os_task_decisions_tenant_task
  ON public.os_task_decisions (tenant_key, task_id, decided_at DESC);

ALTER TABLE public.os_task_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant can manage own os task decisions" ON public.os_task_decisions;

CREATE POLICY "tenant can manage own os task decisions"
  ON public.os_task_decisions FOR ALL TO authenticated
  USING (tenant_key = current_setting('app.tenant_key', true))
  WITH CHECK (tenant_key = current_setting('app.tenant_key', true));
