# 📤 Gitプッシュガイド

## ✅ プッシュすべきファイル（Railwayデプロイ用）

### 🚀 Railwayデプロイに必須のファイル

以下のファイルは**必ず**プッシュしてください：

```
✅ Procfile                    # Railway起動コマンド
✅ runtime.txt                 # Pythonバージョン指定
✅ railway.json                # Railway設定
✅ requirements.txt            # 依存パッケージ
✅ main.py                     # メインエントリーポイント
✅ README.md                   # プロジェクト説明
✅ RAILWAY_DEPLOY.md          # デプロイガイド
```

### 📁 アプリケーションコード

```
✅ core/                       # コア機能（すべて）
✅ apps/                       # アプリケーションコード（すべて）
✅ config/                     # 設定ファイル（すべて）
✅ templates/                  # HTMLテンプレート（すべて）
✅ static/                     # 静的ファイル（すべて）
```

### 📝 設定ファイル

```
✅ .gitignore                  # Git除外設定
✅ .railwayignore              # Railway除外設定（参考用）
```

---

## ❌ プッシュしないファイル

### 🔒 機密情報

```
❌ .env                        # 環境変数（APIキーなど）
❌ .env.local                  # ローカル環境変数
❌ *.key                       # 秘密鍵ファイル
❌ *.pem                       # 証明書ファイル
```

### 🗑️ 一時ファイル・ビルド成果物

```
❌ __pycache__/                # Pythonキャッシュ
❌ *.pyc                       # コンパイル済みPythonファイル
❌ *.pyo
❌ *.pyd
❌ *.so
❌ *.egg
❌ *.egg-info/
❌ dist/                       # 配布物
❌ build/                      # ビルド成果物
```

### 📊 データ・ログファイル

```
❌ data/                       # データファイル（ChromaDBなど）
❌ *.log                       # ログファイル
❌ backup/                     # バックアップファイル
```

### 🧪 テスト・デバッグファイル

```
❌ test_*.py                   # テストファイル
❌ debug_*.py                  # デバッグスクリプト
❌ check_*.py                  # チェックスクリプト
❌ analyze_*.py                # 分析スクリプト
❌ demo_*.py                   # デモスクリプト
❌ quick_*.py                   # クイックテスト
```

### 🛠️ 開発用スクリプト

```
❌ *.bat                       # Windowsバッチファイル
❌ *.sh                        # Shellスクリプト
❌ create_*.py                  # 作成スクリプト
❌ set_*.py                     # 設定スクリプト
❌ register_*.py                # 登録スクリプト
❌ run_*.py                     # 実行スクリプト
❌ start_*.py                   # 起動スクリプト
❌ restart_*.py                 # 再起動スクリプト
❌ backup_*.py                  # バックアップスクリプト
```

### 📚 ドキュメント（一部）

```
❌ *.md                        # マークダウンファイル（README.md以外）
✅ README.md                   # プロジェクト説明（例外）
✅ RAILWAY_DEPLOY.md          # デプロイガイド（例外）
```

**注意**: ドキュメントファイル（`.md`）は通常プッシュしませんが、`README.md`と`RAILWAY_DEPLOY.md`は例外です。

### 🗂️ その他

```
❌ ootsuki2_backup_*/          # バックアップディレクトリ
❌ おおつきチャットボット/      # 別プロジェクト
❌ .vscode/                    # VS Code設定
❌ .idea/                      # IntelliJ設定
❌ .Python                     # Python設定
```

---

## 📋 Gitコマンド例

### 1. ステージング（必要なファイルのみ）

```bash
# Railwayデプロイに必要なファイルを追加
git add Procfile
git add runtime.txt
git add railway.json
git add requirements.txt
git add main.py
git add README.md
git add RAILWAY_DEPLOY.md
git add .gitignore
git add .railwayignore

# アプリケーションコードを追加
git add core/
git add apps/
git add config/
git add templates/
git add static/

# 変更された設定ファイルを追加
git add core/config_loader.py
```

### 2. 一括追加（.gitignoreに従う）

```bash
# .gitignoreに従って自動的に除外される
git add .
```

### 3. コミット

```bash
git commit -m "Railwayデプロイ準備: 必要なファイルを追加"
```

### 4. プッシュ

```bash
git push origin main
```

---

## 🔍 確認コマンド

### プッシュ前に確認

```bash
# ステージングされたファイルを確認
git status

# コミットされるファイルの一覧を確認
git diff --cached --name-only
```

### .gitignoreの確認

```bash
# .gitignoreに従って除外されているか確認
git check-ignore -v <ファイル名>
```

---

## ⚠️ 重要な注意事項

1. **`.env`ファイルは絶対にプッシュしない**
   - APIキーなどの機密情報が含まれています
   - Railwayでは環境変数として設定してください

2. **`data/`ディレクトリはプッシュしない**
   - ChromaDBのデータは一時的なものです
   - Railwayでは再構築されます

3. **テストファイルはプッシュしない**
   - デプロイには不要です
   - ローカル開発用です

4. **バッチファイル（`.bat`）はプッシュしない**
   - Windows専用のスクリプトです
   - Railwayでは不要です

---

## 📝 推奨されるプッシュ手順

### ステップ1: 変更を確認

```bash
git status
```

### ステップ2: 必要なファイルのみ追加

```bash
# Railwayデプロイに必要なファイル
git add Procfile runtime.txt railway.json requirements.txt main.py
git add README.md RAILWAY_DEPLOY.md
git add .gitignore .railwayignore

# アプリケーションコード
git add core/ apps/ config/ templates/ static/

# 変更されたファイル
git add core/config_loader.py
```

### ステップ3: コミット

```bash
git commit -m "Railwayデプロイ準備完了"
```

### ステップ4: プッシュ

```bash
git push origin main
```

---

## ✅ チェックリスト

プッシュ前に以下を確認してください：

- [ ] `.env`ファイルが含まれていない
- [ ] `data/`ディレクトリが含まれていない
- [ ] `__pycache__/`が含まれていない
- [ ] `*.bat`ファイルが含まれていない
- [ ] `test_*.py`ファイルが含まれていない
- [ ] `Procfile`が含まれている
- [ ] `requirements.txt`が含まれている
- [ ] `main.py`が含まれている
- [ ] `core/`ディレクトリが含まれている
- [ ] `apps/`ディレクトリが含まれている
- [ ] `config/`ディレクトリが含まれている

---

**準備完了！** 上記の手順に従ってプッシュしてください。🚀

