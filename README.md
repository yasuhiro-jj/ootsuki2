# ootsuki2 フレームワーク

## 概要

**ootsuki2** は、業種別のチャットボットを簡単に構築できる汎用的なフレームワークです。

- 飲食店
- 保険比較
- 士業（行政書士、税理士等）
- 不動産
- その他あらゆる業種

に対応したAIチャットボットを、設定ファイルとプロンプトを変更するだけで作成できます。

## 主な機能

✅ **汎用的なフレームワーク**: core/ に共通機能を集約
✅ **業種別アプリ**: apps/ で業種固有の処理を実装
✅ **YAML設定**: config/ で簡単に設定変更
✅ **RAG検索**: ChromaDB + OpenAI Embeddings
✅ **Notion連携**: Notionデータベースとの連携
✅ **LangGraph**: 会話フロー制御（意図検出・条件分岐）
✅ **LangSmith**: トレーシング・モニタリング機能
✅ **FastAPI**: 高速で信頼性の高いAPIフレームワーク
✅ **レスポンシブUI**: PC・スマホ対応のチャットUI

## プロジェクト構造

```
ootsuki2/
├── core/                          # 共通フレームワーク
│   ├── config_loader.py           # YAML設定読み込み
│   ├── notion_client.py           # Notion API連携
│   ├── chroma_client.py           # RAG検索エンジン
│   ├── ai_engine.py               # GPT処理エンジン
│   └── api.py                     # FastAPI基盤
│
├── apps/                          # 業種別アプリ
│   ├── ootuki_restaurant/         # おおつき飲食店
│   │   ├── prompts.py             # 業種固有プロンプト
│   │   ├── notion_schema.py       # DB構造定義
│   │   └── knowledge/             # ナレッジベース
│   ├── insurance/                 # 保険比較（将来）
│   └── legal/                     # 士業（将来）
│
├── config/                        # 設定ファイル
│   ├── ootuki_restaurant.yaml
│   ├── insurance.yaml
│   └── legal.yaml
│
├── templates/                     # UI
│   └── base_chat.html             # 共通チャットUI
│
├── main.py                        # エントリーポイント
└── requirements.txt               # 依存パッケージ
```

## セットアップ

### 1. 環境準備

```bash
# Anaconda環境の作成（推奨）
conda create -n ootsuki2 python=3.11
conda activate ootsuki2

# または venv
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

### 2. 依存パッケージのインストール

```bash
pip install -r requirements.txt
```

### 3. 環境変数の設定

`.env` ファイルを作成し、以下を設定：

```env
# OpenAI API Key（必須）
OPENAI_API_KEY=sk-...

# Notion API Key（オプション）
NOTION_API_KEY=secret_...

# LangSmith（オプション）
LANGSMITH_API_KEY=...

# SerpAPI（オプション）
SERPAPI_API_KEY=...
```

### 4. 設定ファイルの編集

`config/ootuki_restaurant.yaml` を編集：

```yaml
notion:
  database_ids:
    menu_db: "あなたのメニューDB ID"
    store_db: "あなたの店舗DB ID"
```

### 5. ナレッジベースの準備

`apps/ootuki_restaurant/knowledge/` にマークダウンファイルを配置：

- `menu.md`: メニュー情報
- `store_info.md`: 店舗情報

## 使い方

### 起動

```bash
# おおつき飲食店BOT
python main.py ootuki_restaurant

# 保険比較BOT（将来）
python main.py insurance

# 士業BOT（将来）
python main.py legal
```

### アクセス

ブラウザで以下にアクセス：

```
http://localhost:8000
```

### API エンドポイント

- `GET /`: チャットUI
- `POST /chat`: チャット処理
- `POST /session`: セッション作成
- `GET /session/{session_id}`: セッション情報取得
- `DELETE /session/{session_id}`: セッション削除
- `POST /rag/rebuild`: RAG再構築
- `GET /rag/status`: RAG状態確認
- `GET /health`: ヘルスチェック

## 新しい業種の追加方法

### 1. アプリディレクトリを作成

```bash
mkdir -p apps/my_business/knowledge
```

### 2. プロンプトを作成

`apps/my_business/prompts.py`:

```python
SYSTEM_PROMPT = """
あなたは〇〇業界の専門家AIです。
...
"""
```

### 3. 設定ファイルを作成

`config/my_business.yaml`:

```yaml
project_name: "My Business BOT"
server:
  port: 8001
# ...
```

### 4. ナレッジベースを配置

`apps/my_business/knowledge/` にマークダウンファイルを配置

### 5. 起動

```bash
python main.py my_business
```

## 技術スタック

- **Python 3.11+**
- **FastAPI**: Webフレームワーク
- **LangChain**: AI処理フレームワーク
- **LangGraph**: 会話フロー制御
- **LangSmith**: トレーシング・モニタリング
- **OpenAI GPT-4**: 言語モデル
- **ChromaDB**: ベクトルデータベース
- **Notion API**: データベース連携
- **YAML**: 設定管理

## ライセンス

MIT License

## 開発者

ootsuki2 framework by BHN.jp

---

## トラブルシューティング

### Q: OPENAI_API_KEY が設定されていないエラー

A: `.env` ファイルに `OPENAI_API_KEY` を設定してください

### Q: 設定ファイルが見つからないエラー

A: `config/{app_name}.yaml` が存在することを確認してください

### Q: Chroma初期化エラー

A: `data/chroma/` ディレクトリを削除して再起動してください

```bash
rm -rf data/chroma
python main.py ootuki_restaurant
```

### Q: Notion連携エラー

A: Notion API Key とデータベースIDが正しいか確認してください

---

## 今後の展開

- [ ] 保険比較BOTの実装
- [ ] 士業BOTの実装
- [ ] 不動産BOTの実装
- [ ] 音声入力対応
- [ ] 多言語対応
- [ ] Docker対応
- [ ] クラウドデプロイ対応
- [ ] **LangGraphによる次ステップ自動推論機能**（実装予定）

### LangGraphによる次ステップ自動推論機能

**概要：**  
ユーザーの入力とState（状態）を基に、AIが次に必要なステップを自動判断し、適切な質問や提案を出す機能を実装予定。

**主な機能：**
- **State管理**: `user_input`, `user_goal`, `extracted_info`, `missing_info`, `next_action`, `step`, `history` を管理
- **次アクション推論ノード**: Stateを分析し、以下のアクションから最適な1つを自動選択
  - `ask_detail`: 情報が足りない場合、追加質問を生成
  - `propose_solution`: 提案に進む
  - `clarify_goal`: 目的を明確にする必要がある場合
  - `generate_result`: レシピ・診断・回答を生成
  - `offer_alternative`: 別案を提示
- **Conditional Edge**: `next_action`の結果に応じて自動分岐
- **情報抽出ノード**: ユーザー入力から必要情報を抽出
- **提案ノード**: 状況に応じた回答・提案を生成

**実装予定ファイル構成：**
```
src/
  graph/
    state.py              # State型定義
    nodes/
      extract_info.py     # 情報抽出ノード
      next_action.py      # 次アクション推論ノード
      ask_detail.py       # 追加質問ノード
      propose_solution.py # 提案ノード
      generate_result.py  # 結果生成ノード
    workflow.py           # LangGraphワークフロー定義
  main.py
```

**技術的な特徴：**
- AIがStateを見て自動的に「次に何をすべきか」を判断
- 不足情報がある場合は自動的に質問を生成
- 情報が揃ったら自動的に最終回答に進む
- 会話の文脈をStateで保持し、適切なタイミングで提案や質問を行う

---

**Happy Chatbotting! 🤖**

