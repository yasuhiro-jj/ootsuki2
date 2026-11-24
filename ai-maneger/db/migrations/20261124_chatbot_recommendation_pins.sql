-- チャットボット自動おすすめ：オーナーが「出したい商品」を指定する
-- Supabase SQL Editor で実行する。再実行しても壊れない。
--
-- 既存の chatbot_recommendation_exclusions（出さない商品）と対になるテーブル。
-- ここに入れた商品は、粗利・売れ筋の順位に関係なく優先しておすすめに載せる。

CREATE TABLE IF NOT EXISTS public.chatbot_recommendation_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key TEXT NOT NULL,
  menu_page_id TEXT,               -- メニューDBのページID（判明していれば）
  product_name TEXT NOT NULL,      -- 入力された商品名（NFKC正規化して照合する）
  note TEXT NOT NULL DEFAULT '',   -- 指定した理由などのメモ（社内用）
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_recommendation_pins_tenant
  ON public.chatbot_recommendation_pins (tenant_key, created_at DESC);

ALTER TABLE public.chatbot_recommendation_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant can manage own chatbot recommendation pins"
  ON public.chatbot_recommendation_pins;

CREATE POLICY "tenant can manage own chatbot recommendation pins"
  ON public.chatbot_recommendation_pins FOR ALL TO authenticated
  USING (tenant_key = current_setting('app.tenant_key', true))
  WITH CHECK (tenant_key = current_setting('app.tenant_key', true));
