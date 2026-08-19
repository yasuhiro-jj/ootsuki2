-- tenant_configs / tenant_memberships / tenant_audit_logs の RLS（最終版）
-- アプリは withTenant 内で set_config('app.tenant_key', ..., true) を実行済み。
--
-- 実行: Supabase SQL Editor（例: https://supabase.com/dashboard/project/<ref>/sql/new）
-- 推奨順: アプリの withTenant 対応をデプロイ済みであること → 本 SQL 実行
--
-- ロールについて:
-- - ポリシーは TO authenticated 。PostgREST + JWT の authenticated 向け。
-- - TENANT_CONFIG_DB_URL が postgres 等の BYPASSRLS ユーザーなら、アプリからは RLS を素通りし、
--   このポリシーは「ダッシュボード上の RLS 充足」と「非特権ロール」の両方を想定した定義。
-- - 将来、アプリ専用の非特権ロールだけを使う場合は、そのロールに必要な GRANT と
--   （必要なら）authenticated と同内容のポリシーを追加してください。

-- 以前の単一ポリシー名（再実行用に削除）
DROP POLICY IF EXISTS tenant_configs_tenant_isolation ON public.tenant_configs;
DROP POLICY IF EXISTS tenant_memberships_tenant_isolation ON public.tenant_memberships;
DROP POLICY IF EXISTS tenant_audit_logs_tenant_isolation ON public.tenant_audit_logs;

ALTER TABLE public.tenant_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_audit_logs ENABLE ROW LEVEL SECURITY;

-- tenant_configs（既存ポリシー再実行対策）
DROP POLICY IF EXISTS "tenant can select own configs" ON public.tenant_configs;
DROP POLICY IF EXISTS "tenant can insert own configs" ON public.tenant_configs;
DROP POLICY IF EXISTS "tenant can update own configs" ON public.tenant_configs;
DROP POLICY IF EXISTS "tenant can delete own configs" ON public.tenant_configs;

CREATE POLICY "tenant can select own configs"
  ON public.tenant_configs FOR SELECT TO authenticated
  USING (tenant_key = current_setting('app.tenant_key', true));

CREATE POLICY "tenant can insert own configs"
  ON public.tenant_configs FOR INSERT TO authenticated
  WITH CHECK (tenant_key = current_setting('app.tenant_key', true));

CREATE POLICY "tenant can update own configs"
  ON public.tenant_configs FOR UPDATE TO authenticated
  USING (tenant_key = current_setting('app.tenant_key', true))
  WITH CHECK (tenant_key = current_setting('app.tenant_key', true));

CREATE POLICY "tenant can delete own configs"
  ON public.tenant_configs FOR DELETE TO authenticated
  USING (tenant_key = current_setting('app.tenant_key', true));

-- tenant_memberships
DROP POLICY IF EXISTS "tenant can select own memberships" ON public.tenant_memberships;
DROP POLICY IF EXISTS "tenant can insert own memberships" ON public.tenant_memberships;
DROP POLICY IF EXISTS "tenant can update own memberships" ON public.tenant_memberships;
DROP POLICY IF EXISTS "tenant can delete own memberships" ON public.tenant_memberships;

CREATE POLICY "tenant can select own memberships"
  ON public.tenant_memberships FOR SELECT TO authenticated
  USING (tenant_key = current_setting('app.tenant_key', true));

CREATE POLICY "tenant can insert own memberships"
  ON public.tenant_memberships FOR INSERT TO authenticated
  WITH CHECK (tenant_key = current_setting('app.tenant_key', true));

CREATE POLICY "tenant can update own memberships"
  ON public.tenant_memberships FOR UPDATE TO authenticated
  USING (tenant_key = current_setting('app.tenant_key', true))
  WITH CHECK (tenant_key = current_setting('app.tenant_key', true));

CREATE POLICY "tenant can delete own memberships"
  ON public.tenant_memberships FOR DELETE TO authenticated
  USING (tenant_key = current_setting('app.tenant_key', true));

-- tenant_audit_logs（UPDATE / DELETE ポリシーは意図的に作らない）
DROP POLICY IF EXISTS "tenant can select own audit logs" ON public.tenant_audit_logs;
DROP POLICY IF EXISTS "tenant can insert own audit logs" ON public.tenant_audit_logs;

CREATE POLICY "tenant can select own audit logs"
  ON public.tenant_audit_logs FOR SELECT TO authenticated
  USING (tenant_key = current_setting('app.tenant_key', true));

CREATE POLICY "tenant can insert own audit logs"
  ON public.tenant_audit_logs FOR INSERT TO authenticated
  WITH CHECK (tenant_key = current_setting('app.tenant_key', true));
