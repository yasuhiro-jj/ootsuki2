# 公開Notion直接回答の固定テンプレート化

## 背景

PR #16 の直接回答を Railway で検証したところ、公開Notion知識の候補に既存の提案LLM生成が混ざり、根拠のない食材・人気表現・追加質問・LINE誘導が最終応答へ入る可能性が確認された。

## 修正方針

- 公開Notion知識による直接回答は LLM 生成を使わない。
- メニュー有無と価格は、公開スナップショットの `name` と `price` だけで固定テンプレートを作る。
- 営業時間は、公開FAQスナップショットの `answer` 本文だけを返す。
- 価格がないメニュー、曖昧一致、低 confidence、guard 拒否、例外時は既存ルーターへフォールバックする。
- 直接回答採用時は HTTP `/chat` と WebSocket の両方で早期 return し、既存のおすすめ提案追撃や LINE フッター生成を通さない。

## 直接回答テンプレート

- 商品有無: `はい、{商品名}（{価格}円）をご用意しています。`
- 価格: `{商品名}は{価格}円です。`
- 営業時間: 公開FAQの回答本文のみ

一言紹介は、公開知識に保存されている場合だけ将来追加できる。ただし現段階では固定テンプレートのみを採用し、説明文は付与しない。

## ログ

直接回答採用時は、HTTP/WebSocket ともに quality log の `referenced_sources` へ次を記録する。

- `response_source=public_notion`
- `planner_intent`
- `planner_confidence`
- `candidate_type`
- `candidate_source`
- `fallback_reason`
- `guard_result`
- `actual_response`

WebSocket の送信ペイロードにも `response_source=public_notion` を含める。

## Feature Flag

実応答切替は既存の `ENABLE_PUBLIC_NOTION_KNOWLEDGE_DIRECT_RESPONSES` を使い、初期値は引き続き `false`。本修正では Railway の環境変数や本番 flag は変更しない。
