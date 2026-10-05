-- AI Manager × おおつきチャットボット 自動連携
-- AI Manager が生成した販売戦略をチャットボットが読むための共有テーブル。
-- Supabase SQL Editor で実行する。再実行しても壊れない。
--
-- 【重要】本番への適用は CEO（渡邉泰弘）の承認後に行うこと。

CREATE TABLE IF NOT EXISTS public.chatbot_sales_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key TEXT NOT NULL,
  strategy_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,          -- SalesStrategyPayload と同じ形
  source_summary JSONB NOT NULL,   -- 対象月・行数・日次売上の最終日付・除外件数など（社内用）
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  generated_by TEXT NOT NULL DEFAULT 'ai_manager_auto',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chatbot_sales_strategies_status_check
    CHECK (status IN ('draft', 'shadow', 'published', 'superseded', 'failed')),
  CONSTRAINT chatbot_sales_strategies_unique_strategy
    UNIQUE (tenant_key, strategy_id)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_sales_strategies_tenant_status
  ON public.chatbot_sales_strategies (tenant_key, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.chatbot_recommendation_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key TEXT NOT NULL,
  menu_page_id TEXT,               -- メニューDBのページID（推奨）
  product_name TEXT,               -- 名前でも可（NFKC正規化して比較する）
  reason TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chatbot_recommendation_exclusions_target_check
    CHECK (menu_page_id IS NOT NULL OR product_name IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_recommendation_exclusions_tenant
  ON public.chatbot_recommendation_exclusions (tenant_key);

-- 既存の marketing_* テーブルと同じく、app.tenant_key による行レベル制限をかける。
ALTER TABLE public.chatbot_sales_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_recommendation_exclusions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant can manage own chatbot sales strategies"
  ON public.chatbot_sales_strategies;
DROP POLICY IF EXISTS "tenant can manage own chatbot recommendation exclusions"
  ON public.chatbot_recommendation_exclusions;

CREATE POLICY "tenant can manage own chatbot sales strategies"
  ON public.chatbot_sales_strategies FOR ALL TO authenticated
  USING (tenant_key = current_setting('app.tenant_key', true))
  WITH CHECK (tenant_key = current_setting('app.tenant_key', true));

CREATE POLICY "tenant can manage own chatbot recommendation exclusions"
  ON public.chatbot_recommendation_exclusions FOR ALL TO authenticated
  USING (tenant_key = current_setting('app.tenant_key', true))
  WITH CHECK (tenant_key = current_setting('app.tenant_key', true));

-- ---------------------------------------------------------------------------
-- チャットボット（Railway）用の読み取り専用ロール
--
-- 【重要】下記は CEO 承認後に、パスワードを実際の値に置き換えてから実行すること。
-- パスワードはリポジトリにコミットしない。発行後は Railway の
-- CHATBOT_STRATEGY_DB_URL にのみ設定する。
-- ---------------------------------------------------------------------------
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatbot_strategy_reader') THEN
--     CREATE ROLE chatbot_strategy_reader LOGIN PASSWORD '＜ここに発行したパスワード＞';
--   END IF;
-- END
-- $$;
--
-- GRANT USAGE ON SCHEMA public TO chatbot_strategy_reader;
-- GRANT SELECT ON public.chatbot_sales_strategies TO chatbot_strategy_reader;
-- GRANT SELECT ON public.chatbot_recommendation_exclusions TO chatbot_strategy_reader;
--
-- -- 公開済みの戦略だけを読めるようにする。
-- DROP POLICY IF EXISTS "chatbot reader can read published strategies"
--   ON public.chatbot_sales_strategies;
-- CREATE POLICY "chatbot reader can read published strategies"
--   ON public.chatbot_sales_strategies FOR SELECT TO chatbot_strategy_reader
--   USING (status = 'published');
--
-- DROP POLICY IF EXISTS "chatbot reader can read exclusions"
--   ON public.chatbot_recommendation_exclusions;
-- CREATE POLICY "chatbot reader can read exclusions"
--   ON public.chatbot_recommendation_exclusions FOR SELECT TO chatbot_strategy_reader
--   USING (true);
