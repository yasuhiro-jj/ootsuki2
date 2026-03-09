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



サーバーを起動

# ① プロジェクトフォルダへ移動
cd "C:\Users\PC user\OneDrive\Desktop\移行用まとめフォルダー\カーソル　個人\ootsuki2"

# ②（初回のみ）環境作成
conda create -n ootsuki2 python=3.11

# ③ 環境を有効化
conda activate ootsuki2

# ④（初回のみ）依存パッケージをインストール
pip install -r requirements.txt

# ⑤ ローカルサーバ起動（おおつき飲食店BOT）
python main.py ootuki_restaurant



サーバーを起動2


# プロジェクトフォルダに移動
cd "c:\Users\PC user\OneDrive\Desktop\移行用まとめフォルダー\カーソル　個人\ootsuki2"

# conda環境を有効化（使用している場合）
conda activate ootsuki2

# サーバーを起動
python main.py ootuki_restaurant







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

### Q: Gitプッシュでエラーが発生する

A: 以下の手順を確認してください（[Git操作ガイド](#git操作変更のプッシュ)を参照）

### Q: チャットボットが答えられない質問がある

A: [不明キーワードDBへの回答追加方法](#不明キーワードdbへの回答追加)を参照して、標準回答を登録してください

---

## Git操作（変更のプッシュ）

コードを変更した後、GitHubにプッシュする手順です。

### ⚠️ 重要な注意事項

1. **必ずプロジェクトフォルダー直下で作業する**
   - ❌ 間違い: `移行用まとめフォルダー` で作業
   - ✅ 正しい: `ootsuki2` フォルダー直下で作業

2. **GitHubのURLは必ずコピーする**
   - ❌ 間違い: 手入力やプレースホルダー文字列を使用
   - ✅ 正しい: GitHubの「Code」ボタンからHTTPS URLをコピー

### 基本的なプッシュ手順

#### 1. プロジェクトフォルダーに移動

```bash
cd "C:\Users\PC user\OneDrive\Desktop\移行用まとめフォルダー\カーソル　個人\ootsuki2"
```

#### 2. Gitリポジトリの状態確認

```bash
git status
```

既にGitリポジトリが初期化されている場合は、ステップ3に進みます。  
初期化されていない場合は、ステップ3の前に `git init` を実行してください。

#### 3. リモートリポジトリの設定確認

```bash
git remote -v
```

リモートが設定されていない、または間違っている場合は：

1. GitHubでリポジトリページを開く
2. 緑の「**Code**」ボタンをクリック
3. 「**HTTPS**」タブを選択
4. URLをコピー（例: `https://github.com/yasuhiro-jj/ootsuki2.git`）
5. 以下のコマンドで設定：

```bash
# 既存のoriginを削除（エラーが出てもOK）
git remote remove origin

# 正しいURLを設定（コピーしたURLをそのまま貼り付け）
git remote add origin https://github.com/yasuhiro-jj/ootsuki2.git

# 設定確認
git remote -v
```

#### 4. リモート接続の確認

```bash
git ls-remote origin
```

このコマンドが成功すれば、URLと認証は正しく設定されています。  
失敗する場合は、ステップ3を再確認してください。

#### 5. 変更をステージング

```bash
# すべての変更を追加
git add .

# または、特定のファイルだけ追加
git add core/api.py
git add core/unknown_keyword_service.py
```

#### 6. コミット

```bash
git commit -m "feat: 変更内容の説明"
```

コミットメッセージの例：
- `feat: 不明キーワード時に標準回答を優先`
- `fix: バグ修正の内容`
- `docs: ドキュメント更新`

#### 7. プッシュ

```bash
git push -u origin main
```

ブランチ名が `master` の場合は：
```bash
git push -u origin master
```

### よくあるエラーと対処法

#### エラー1: `Repository not found`

**原因**: URLが間違っている、または認証ができていない

**対処法**:
1. GitHubの「Code」ボタンから正しいHTTPS URLをコピー
2. `git remote set-url origin <コピーしたURL>` で再設定
3. `git ls-remote origin` で確認

#### エラー2: `nothing added to commit but untracked files present`

**原因**: `.gitignore` でファイルが無視されている、またはファイルパスが間違っている

**対処法**:
1. `git status` で無視されているファイルを確認
2. 必要なら `git add -f <ファイル名>` で強制追加
3. または `.gitignore` を確認して、無視する必要がないファイルは除外ルールを削除

#### エラー3: `non-fast-forward`

**原因**: リモートに新しいコミットがある

**対処法**:
```bash
# リモートの変更を取得
git fetch origin

# リベースして統合
git pull --rebase origin main

# 再度プッシュ
git push -u origin main
```

#### エラー4: 認証エラー（GitHubログインが求められる）

**対処法**:
```bash
# GitHub CLIがインストールされている場合
gh auth login

# または、ブラウザでGitHubにログインしてから再度試す
```

### クイックリファレンス

```bash
# 1. フォルダー移動
cd "C:\Users\PC user\OneDrive\Desktop\移行用まとめフォルダー\カーソル　個人\ootsuki2"

# 2. 状態確認
git status

# 3. リモート確認
git remote -v

# 4. 変更を追加
git add .

# 5. コミット
git commit -m "変更内容"

# 6. プッシュ
git push -u origin main
```

### 注意事項

- **Notionデータベースの変更はGitプッシュ不要**
  - Notionのデータ変更は、サーバー再起動だけで反映されます
  - Gitプッシュが必要なのは、**コードファイル（.py, .yamlなど）の変更**のみです

- **コミット前に確認**
  - `git status` で変更内容を確認してからコミット
  - 不要なファイル（`.env`, `__pycache__`など）が含まれていないか確認

---

## Notionデータベースの変更と反映方法

Notionデータベースに新しいノードやデータを追加した場合の反映方法について説明します。

### 📊 各データベースの特性

| データベース | 反映方法 | 再起動の必要性 | 備考 |
|------------|---------|--------------|------|
| **不明キーワード記録DB** | 即座に反映 | ❌ 不要 | 毎回Notionから取得（キャッシュなし） |
| **メニューDB** | 即座に反映 | ❌ 不要 | AgentExecutorツールが毎回取得 |
| **店舗情報DB** | 即座に反映 | ❌ 不要 | AgentExecutorツールが毎回取得 |
| **会話ノードDB** | 5分待つ or 再起動 | ⚠️ 推奨 | 5分間のキャッシュあり |
| **会話履歴DB** | 即座に反映 | ❌ 不要 | 書き込み専用（読み取りはしない） |
| **ナレッジベース** | RAG再構築が必要 | ✅ 必須 | `apps/ootuki_restaurant/knowledge/`フォルダのファイル |

### 🎯 推奨アクション

**結論：NotionDBに追記したら、再起動するのが一番確実です**

#### 理由

1. **即座に反映されるDBでも、再起動で確実**
   - 不明キーワードDB、メニューDB、店舗情報DBは毎回Notionから取得するため、理論上は再起動不要
   - ただし、接続エラーやタイムアウトが発生した場合、再起動で確実に反映される

2. **キャッシュがあるDBは再起動が確実**
   - 会話ノードDBは5分間のキャッシュがあるため、再起動すれば即座に反映される
   - 5分待つよりも再起動の方が早い

3. **統一的な運用が簡単**
   - 「NotionDBを変更したら再起動」というルールで統一すれば、迷わない

### 📝 再起動手順

```powershell
# 1. バックエンドサーバーを停止
# ターミナルで Ctrl + C を押す

# 2. プロジェクトフォルダに移動
cd "c:\Users\PC user\OneDrive\Desktop\移行用まとめフォルダー\カーソル　個人\ootsuki2"

# 3. conda環境を有効化（使用している場合）
conda activate ootsuki2

# 4. サーバーを再起動
python main.py ootuki_restaurant



フロントエンドの起動


    cd "c:\Users\PC user\OneDrive\Desktop\移行用まとめフォルダー\カーソル　個人\ootsuki2\frontend"
```


    npm run dev



    
### 🔍 各DBの詳細

#### 1. 不明キーワード記録DB（即座に反映）

- **実装**: `unknown_keyword_service.py`
- **動作**: 毎回`get_all_pages()`でNotionから全レコードを取得
- **反映**: 理論上は即座に反映されるが、**再起動で確実**

#### 2. メニューDB / 店舗情報DB（即座に反映）

- **実装**: `agent_engine.py`のツール（`menu_search`, `store_info_default`）
- **動作**: AgentExecutorがツール呼び出し時に毎回Notionから取得
- **反映**: 理論上は即座に反映されるが、**再起動で確実**

#### 3. 会話ノードDB（5分キャッシュ or 再起動）

- **実装**: `conversation_node_system.py`
- **動作**: 5分間のキャッシュあり。キャッシュ期限切れ後に自動取得
- **反映方法**:
  - **方法1**: 5分待つ（キャッシュ期限切れ後に自動取得）
  - **方法2**: **再起動（推奨）** - 即座に反映される

#### 4. ナレッジベース（RAG再構築が必要）

- **実装**: `chroma_client.py`
- **動作**: 起動時に`apps/ootuki_restaurant/knowledge/`フォルダから読み込み
- **反映方法**:
  ```powershell
  # RAG再構築バッチファイルを実行
  .\rebuild_rag.bat
  
  # または、APIエンドポイントを呼び出す
  # POST /rag/rebuild
  ```
  - その後、サーバー再起動

### ✅ チェックリスト

NotionDBに新しいノードを追加した場合：

- [ ] Notionでノードを作成・編集
- [ ] **バックエンドサーバーを再起動**（推奨・確実）
- [ ] チャットボットでテストして動作確認
- [ ] Gitプッシュは不要（Notionデータの変更はコード変更ではないため）

### 🎯 まとめ

- **NotionDBに追記したら、再起動するのが一番確実**
- Gitプッシュは不要（Notionデータの変更はコード変更ではないため）
- コードファイル（.py, .yamlなど）を変更した場合は、Gitプッシュが必要

---

## 不明キーワードDBへの回答追加

チャットボットが答えられない質問や、特定の質問に対して標準的な回答を返したい場合、**Notionの「📝 不明キーワード記録」データベース**に標準回答を登録できます。

### 🎯 重要な仕組み

**不明キーワード検索は最優先で実行されます**

1. ユーザーが質問を入力
2. **まず不明キーワードDBを検索**（類似度75%以上でマッチ）
3. **マッチした場合**: 登録された「標準回答」をそのまま返す（RAG検索やLLMはスキップ）
4. マッチしなかった場合: 通常のRAG検索やLLMによる回答生成を実行

つまり、**標準回答が登録されている質問には、必ずその標準回答が優先的に返されます**。

### 📋 データベースの場所

- **データベース名**: 「📝 不明キーワード記録」
- **データベースID**: `6cccf26b198645f2b08d71fb9b1d01f0`（`config/ootuki_restaurant.yaml`で設定）

Notionで「不明キーワード記録」を検索して開いてください。

### 📝 必要なプロパティ（カラム）

データベースには以下のプロパティが必要です：

| プロパティ名 | タイプ | 必須 | 説明 |
|------------|--------|------|------|
| **質問内容** | Title | ✅ | ユーザーの質問内容（主キー） |
| **標準回答** | Rich Text | ✅ | **チャットボットが返す回答**（最重要！） |
| **コンテキスト** | Rich Text | ❌ | 質問の背景や補足情報 |
| **ステータス** | Select | ❌ | 対応状況（未対応/対応済/要確認） |
| **日時** | Date | ❌ | 質問の発生日時 |

⚠️ **重要**: 「標準回答」プロパティが存在しない場合は、データベースの右上の「**+**」ボタンから追加してください（タイプ: Text または Rich Text）。

### ✨ 新しいキーワードと標準回答を追加する手順

#### Step 1: Notionでデータベースを開く

1. Notionを開く
2. 「📝 不明キーワード記録」データベースを開く

#### Step 2: 新しいレコードを追加

1. データベースの上部にある「**+ New**」ボタンをクリック
2. または、データベースの最後の行をクリックして新しい行を追加

#### Step 3: プロパティを入力

以下の情報を入力してください：

**✅ 必須項目**

1. **質問内容**（Title）
   - ユーザーが実際に質問する内容を入力
   - 例: 「WiFiのパスワードは？」
   - 例: 「駐車場はありますか？」
   - 例: 「テイクアウトの時間は？」
   - 💡 **ヒント**: 完全一致でなくても、類似度75%以上でマッチします。より具体的な質問内容を登録すると、マッチしやすくなります。

2. **標準回答**（Rich Text）⭐ **最重要**
   - **チャットボットがユーザーに返す回答**を入力
   - 丁寧で親しみやすい口調で記入
   - 例: 「はい、WiFiをご利用いただけます。パスワードは「ootuki2024」です。お食事中にご自由にお使いください。」
   - 例: 「はい、駐車場がございます。店舗の裏側に5台分の駐車スペースがあります。満車の場合は近隣のコインパーキングをご利用ください。」

**❌ 任意項目**

3. **コンテキスト**（Rich Text）
   - 質問の背景や補足情報があれば記入
   - 例: 「テイクアウトメニューについて質問した後」

4. **ステータス**（Select）
   - 「対応済」を選択（回答を追加した場合は対応済み）

5. **日時**（Date）
   - 現在の日時が自動入力されます

#### Step 4: 保存

入力が完了したら、ページ外をクリックするか、`Ctrl+S`（Windows）または`Cmd+S`（Mac）で保存

### 🔍 動作確認

#### 確認方法

1. **サーバーを再起動**（重要！Notionデータベースの変更を反映するため）
   ```bash
   # バックエンドサーバーを停止（Ctrl+C）
   # 再度起動
   python main.py ootuki_restaurant
   ```

2. チャットボットに登録した質問を入力

3. 登録した「標準回答」が返されることを確認

#### 例

**登録した内容:**
- 質問内容: 「WiFiのパスワードは？」
- 標準回答: 「はい、WiFiをご利用いただけます。パスワードは「ootuki2024」です。お食事中にご自由にお使いください。」

**チャットボットでの動作:**
- ユーザー: 「WiFiのパスワードは？」
- ボット: 「はい、WiFiをご利用いただけます。パスワードは「ootuki2024」です。お食事中にご自由にお使いください。」← **標準回答が優先的に返される**

### 💡 標準回答の書き方（ベストプラクティス）

#### ✅ 良い回答の特徴

1. **丁寧で親しみやすい口調**
   - 「はい、〜です。」「〜がございます。」
   - フレンドリーで敬意を保つ

2. **簡潔に要点を伝える**
   - 2〜3文程度にまとめる
   - 不要な情報は含めない

3. **具体的な情報を含める**
   - パスワード、時間、場所など具体的な情報を記載

#### 例：良い回答 vs 悪い回答

✅ **良い例:**
```
はい、WiFiをご利用いただけます。パスワードは「ootuki2024」です。
お食事中にご自由にお使いください。
```

✅ **良い例:**
```
はい、駐車場がございます。店舗の裏側に5台分の駐車スペースがあります。
満車の場合は近隣のコインパーキングをご利用ください。
```

❌ **悪い例:**
```
WiFiあります。
```
（情報が不十分で、ユーザーが困る）

### 🔄 既存のレコードを更新する場合

既に「不明キーワード記録」に記録されている質問に対して回答を追加する場合：

1. 該当するレコードを開く
2. 「標準回答」フィールドに回答を入力
3. 「ステータス」を「対応済」に変更
4. 保存
5. **サーバーを再起動**

### ⚠️ 重要な注意事項

1. **類似度の閾値**: 類似度75%以上でマッチします
   - 完全一致でなくても、似た質問には同じ回答が返されます
   - 例: 「WiFiのパスワードは？」と「WiFiパスワード教えて」は類似度が高ければマッチ

2. **優先順位**: 不明キーワード検索は**最優先**で実行されます
   - マッチした場合は、RAG検索やLLMによる回答生成はスキップされます
   - 標準回答を登録すれば、確実にその回答が返されます

3. **複数の回答**: 同じような質問が複数ある場合、最も類似度が高い回答が返されます

4. **サーバー再起動が必要**: Notionデータベースの変更を反映するには、**バックエンドサーバーを再起動**してください
   - Gitプッシュは不要です（Notionデータベースの変更はコード変更ではないため）

### 📞 問題が発生した場合

#### 回答が返されない場合

1. **プロパティ名の確認**
   - 「標準回答」という名前で正確に入力されているか確認
   - タイプが「Text」または「Rich Text」になっているか確認

2. **データベースIDの確認**
   - `config/ootuki_restaurant.yaml`の`unknown_keywords_db`に正しいIDが設定されているか確認

3. **サーバー再起動の確認**
   - Notionデータベースを変更した後、必ずサーバーを再起動したか確認

4. **サーバーログの確認**
   - サーバーのログに「不明キーワードDB検索成功」というメッセージが表示されているか確認

5. **類似度の確認**
   - 質問内容が完全一致していなくても、類似度75%以上でマッチします
   - より具体的な質問内容を登録すると、マッチしやすくなります

### ✅ チェックリスト

新しいキーワードと標準回答を追加する際のチェックリスト：

- [ ] 「📝 不明キーワード記録」データベースを開いた
- [ ] 「標準回答」プロパティが存在することを確認（なければ追加）
- [ ] 新しいレコードを追加
- [ ] 「質問内容」に入力（必須・具体的に）
- [ ] 「標準回答」に入力（必須・丁寧で具体的に）
- [ ] 「ステータス」を「対応済」に設定
- [ ] 保存
- [ ] **バックエンドサーバーを再起動**（重要！）
- [ ] チャットボットでテストして動作確認

### 🎯 まとめ

- **新しいキーワードや標準回答を追加する場合**: Notionの「不明キーワード記録」DBに追加 → **サーバー再起動のみ**（Gitプッシュ不要）
- **コードを変更した場合**: Gitコミット → Gitプッシュ → デプロイ/サーバー再起動
- **標準回答は最優先**: 登録された標準回答は、RAG検索やLLMよりも優先的に返されます

---

## エージェント機能について

### ootsuki2のエージェント機能（新API実装）

ootsuki2では、**LangChainの新しいエージェントAPI**（`create_openai_tools_agent`）を使用したエージェント機能を実装しています。

#### 実装の特徴

- **使用API**: `langchain.agents.create_openai_tools_agent` + `AgentExecutor`（新API）
- **エージェントタイプ**: OpenAI Functions（ツール呼び出し型）
- **LangChainバージョン**: LangChain 0.3.0以上対応
- **セッション管理**: `AIEngine`で管理（既存のセッション管理を維持）

#### 利用可能なツール

1. **menu_search**: NotionのメニューDBを検索
2. **menu_price_lookup**: メニュー名から価格と特徴を取得
3. **knowledge_base_lookup**: RAGナレッジベースから情報を検索
4. **store_info_default**: 営業時間・アクセスなどの店舗情報を取得

#### 動作の流れ

1. ユーザーが質問を入力
2. セッション履歴を取得して`ChatPromptTemplate`に統合
3. `create_openai_tools_agent`でエージェントを作成
4. AgentExecutorが質問を分析し、必要なツールを自動的に選択・実行
5. ツールの結果を統合して回答を生成
6. セッション履歴に保存

#### 設定方法

`config/ootuki_restaurant.yaml`で有効化：

```yaml
features:
  enable_agent_executor: true  # AgentExecutorを有効化

agent:
  max_iterations: 5  # 最大反復回数
  system_prompt: |
    あなたは「食事処おおつき」のAIスタッフです。
    ...
```

#### 技術的な詳細

**プロンプトテンプレート構造:**
```python
prompt = ChatPromptTemplate.from_messages([
    ("system", system_prompt),
    MessagesPlaceholder(variable_name="chat_history"),  # セッション履歴
    ("human", "{input}"),  # ユーザー入力
    MessagesPlaceholder(variable_name="agent_scratchpad"),  # エージェントの思考過程
])
```

**セッション履歴の統合:**
- `AIEngine.get_session()`から履歴を取得
- `HumanMessage`/`AIMessage`に変換してプロンプトに渡す
- 会話の文脈を保持したままツール呼び出しを実行

**メリット:**
- ✅ 最新のLangChain APIを使用（将来性が高い）
- ✅ 標準化されたエージェント実装
- ✅ セッション履歴を適切に統合
- ✅ 既存のツール定義をそのまま使用可能
- ✅ エラーハンドリングが改善

**注意事項:**
- LangChain 0.3.0以上が必要です
- `requirements.txt`で`langchain>=0.3.0`が指定されていることを確認してください

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
- [ ] **新しいLangChainエージェントAPIへの移行**（検討中）

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

