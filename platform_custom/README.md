# ootsuki2 Platform API

SaaSプラットフォーム管理API

## セットアップ

### 1. PostgreSQLのインストール

```bash
# Windowsの場合
# https://www.postgresql.org/download/windows/ からインストーラーをダウンロード

# または Docker を使用
docker run --name ootsuki-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15
```

### 2. データベースの作成

```bash
# PostgreSQLに接続
psql -U postgres

# データベースを作成
CREATE DATABASE ootsuki_platform;

# 確認
\l

# 終了
\q
```

### 3. 環境変数の設定

```bash
# .env.platform ファイルを作成
cp .env.platform.example .env.platform

# .env.platform を編集
# - PLATFORM_DATABASE_URL
# - JWT_SECRET_KEY
# - ADMIN_EMAIL
# - ADMIN_PASSWORD
```

### 4. 依存パッケージのインストール

```bash
# プラットフォーム用の仮想環境を作成（推奨）
python -m venv venv-platform
source venv-platform/bin/activate  # Windows: venv-platform\Scripts\activate

# または既存のconda環境を使用
conda activate ootsuki2

# 依存パッケージをインストール
pip install -r platform/requirements.txt
```

### 5. マイグレーション実行

```bash
# プロジェクトルートから実行
python -m platform.database.migrations
```

### 6. サーバー起動

```bash
# プロジェクトルートから実行
python -m platform.platform_api

# または
uvicorn platform.platform_api:app --host 0.0.0.0 --port 8000 --reload
```

## API エンドポイント

### 認証

- `POST /api/users/login` - ログイン

### 組織管理

- `POST /api/organizations` - 組織作成
- `GET /api/organizations` - 組織一覧
- `GET /api/organizations/{id}` - 組織詳細
- `PUT /api/organizations/{id}` - 組織更新
- `DELETE /api/organizations/{id}` - 組織削除

### ユーザー管理

- `POST /api/users` - ユーザー作成
- `GET /api/users` - ユーザー一覧
- `GET /api/users/me` - 現在のユーザー情報
- `GET /api/users/{id}` - ユーザー詳細
- `PUT /api/users/{id}` - ユーザー更新
- `DELETE /api/users/{id}` - ユーザー削除

### テナント設定

- `POST /api/tenant-configs` - テナント設定作成
- `GET /api/tenant-configs/{org_id}` - テナント設定取得
- `PUT /api/tenant-configs/{id}` - テナント設定更新
- `DELETE /api/tenant-configs/{id}` - テナント設定削除

## 開発

### デモデータの投入

```python
# platform/database/migrations.py を編集
# seed_demo_data(db) のコメントを解除

# マイグレーション再実行
python -m platform.database.migrations
```

デモアカウント:
- Email: `demo@example.com`
- Password: `demo123`

### API ドキュメント

サーバー起動後、以下のURLでSwagger UIにアクセス:

```
http://localhost:8000/docs
```

## テスト

```bash
# ログインテスト
curl -X POST http://localhost:8000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"demo123"}'

# 組織一覧取得（要認証）
curl -X GET http://localhost:8000/api/organizations \
  -H "Authorization: Bearer <access_token>"
```

## トラブルシューティング

### PostgreSQL接続エラー

```
sqlalchemy.exc.OperationalError: could not connect to server
```

対処法:
1. PostgreSQLが起動しているか確認
2. `.env.platform` の `PLATFORM_DATABASE_URL` が正しいか確認
3. データベース `ootsuki_platform` が作成されているか確認

### マイグレーションエラー

```
sqlalchemy.exc.ProgrammingError: relation "organizations" already exists
```

対処法:
1. データベースをリセット（開発環境のみ）
```sql
DROP DATABASE ootsuki_platform;
CREATE DATABASE ootsuki_platform;
```
2. マイグレーション再実行

## ライセンス

MIT License
