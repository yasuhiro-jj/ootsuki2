# 🚂 Railwayデプロイガイド

## 📋 概要

このガイドでは、おおつきチャットボットをRailwayにデプロイする手順を説明します。

---

## ✅ デプロイ前の準備

### 1. 必要なファイル

以下のファイルが既に作成されています：

- ✅ `Procfile` - Railwayの起動コマンド
- ✅ `runtime.txt` - Pythonバージョン指定
- ✅ `railway.json` - Railway固有の設定
- ✅ `.railwayignore` - デプロイ時に除外するファイル
- ✅ `requirements.txt` - 依存パッケージ一覧

### 2. 環境変数の準備

Railwayのダッシュボードで以下の環境変数を設定する必要があります：

#### 必須環境変数

```
NOTION_API_KEY=your_notion_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

#### オプション環境変数

```
LANGSMITH_API_KEY=your_langsmith_api_key_here
SERPAPI_API_KEY=your_serpapi_api_key_here
PORT=8011  # Railwayでは自動設定されるため通常は不要
```

**注意**: Railwayでは`PORT`環境変数が自動的に設定されるため、手動で設定する必要はありません。

---

## 🚀 デプロイ手順

### 方法1: Railway CLIを使用（推奨）

1. **Railway CLIをインストール**
   ```bash
   npm install -g @railway/cli
   ```

2. **Railwayにログイン**
   ```bash
   railway login
   ```

3. **プロジェクトを初期化**
   ```bash
   cd ootsuki2
   railway init
   ```

4. **環境変数を設定**
   ```bash
   railway variables set NOTION_API_KEY=your_notion_api_key_here
   railway variables set OPENAI_API_KEY=your_openai_api_key_here
   ```

5. **デプロイ**
   ```bash
   railway up
   ```

### 方法2: GitHub連携を使用

1. **GitHubリポジトリにプッシュ**
   ```bash
   git add .
   git commit -m "Railwayデプロイ準備"
   git push origin main
   ```

2. **Railwayダッシュボードで設定**
   - [Railway](https://railway.app)にログイン
   - 「New Project」をクリック
   - 「Deploy from GitHub repo」を選択
   - リポジトリを選択
   - ブランチを選択（通常は`main`）

3. **環境変数を設定**
   - プロジェクトの「Variables」タブを開く
   - 以下の環境変数を追加：
     - `NOTION_API_KEY`
     - `OPENAI_API_KEY`
     - （オプション）`LANGSMITH_API_KEY`
     - （オプション）`SERPAPI_API_KEY`

4. **デプロイ開始**
   - Railwayが自動的にデプロイを開始します
   - ビルドログとデプロイログを確認

---

## 🔧 設定の確認

### ポート番号

Railwayでは`PORT`環境変数が自動的に設定されます。コードは自動的にこの環境変数を優先的に使用します。

### データベースID

NotionデータベースIDは`config/ootuki_restaurant.yaml`に設定されています。必要に応じて環境変数で上書きできます。

---

## 🧪 デプロイ後の確認

### 1. ヘルスチェック

デプロイ後、以下のURLでヘルスチェックを実行：

```
https://your-app-name.railway.app/health
```

期待されるレスポンス：
```json
{
  "status": "healthy",
  "app_name": "ootuki_restaurant",
  "notion_connected": true,
  "ai_ready": true,
  "rag_built": true
}
```

### 2. メインページの確認

```
https://your-app-name.railway.app/
```

チャットボットのUIが表示されることを確認してください。

---

## 🐛 トラブルシューティング

### 問題1: ビルドエラー

**エラーメッセージ**: `ModuleNotFoundError`

**解決方法**:
- `requirements.txt`に必要なパッケージがすべて含まれているか確認
- Railwayのビルドログを確認

### 問題2: 環境変数が設定されていない

**エラーメッセージ**: `⚠️ NOTION_API_KEYが設定されていません`

**解決方法**:
- Railwayダッシュボードの「Variables」タブで環境変数を確認
- 環境変数名が正確か確認（大文字小文字を区別）

### 問題3: ポートエラー

**エラーメッセージ**: `Address already in use`

**解決方法**:
- Railwayでは`PORT`環境変数が自動設定されるため、通常は発生しません
- コードが`PORT`環境変数を優先的に使用するように設定されているか確認

### 問題4: Notion接続エラー

**エラーメッセージ**: `notion_connected: false`

**解決方法**:
- `NOTION_API_KEY`が正しく設定されているか確認
- Notion APIキーが有効か確認
- Notionデータベースのアクセス権限を確認

---

## 📝 重要な注意事項

1. **環境変数の管理**
   - 機密情報（APIキーなど）は環境変数で管理
   - `.env`ファイルはGitにコミットしない（`.railwayignore`に含まれています）

2. **データの永続化**
   - ChromaDBのデータは一時的なストレージに保存されます
   - 永続化が必要な場合は、RailwayのPostgreSQLやVolumeを使用

3. **ログの確認**
   - Railwayダッシュボードの「Deployments」タブでログを確認
   - エラーが発生した場合は、ログを確認して原因を特定

4. **コスト管理**
   - Railwayの無料プランには制限があります
   - 使用量を監視して、必要に応じてプランをアップグレード

---

## 🎉 デプロイ完了

デプロイが成功すると、Railwayが自動的にURLを生成します。このURLをブラウザで開いて、チャットボットが正常に動作することを確認してください。

**Happy Deploying! 🚂🤖**

