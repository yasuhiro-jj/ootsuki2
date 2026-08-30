-- chatbot チャネル（ootsuki2 会話ボットのNotion会話ノードDB連携）を追加。
-- 既存データ・既存カラムには一切触れない。制約の再作成のみ。

ALTER TABLE marketing_actions
  DROP CONSTRAINT IF EXISTS marketing_actions_target_channel_check;

ALTER TABLE marketing_actions
  ADD CONSTRAINT marketing_actions_target_channel_check
    CHECK (target_channel IN ('instagram', 'gbp', 'canva', 'chatbot', 'multi'));

ALTER TABLE marketing_action_executions
  DROP CONSTRAINT IF EXISTS marketing_action_executions_channel_check;

ALTER TABLE marketing_action_executions
  ADD CONSTRAINT marketing_action_executions_channel_check
    CHECK (channel IN ('instagram', 'gbp', 'canva', 'chatbot', 'multi'));

ALTER TABLE marketing_integration_statuses
  DROP CONSTRAINT IF EXISTS marketing_integration_statuses_service_check;

ALTER TABLE marketing_integration_statuses
  ADD CONSTRAINT marketing_integration_statuses_service_check
    CHECK (service IN ('instagram', 'gbp', 'canva', 'chatbot'));
