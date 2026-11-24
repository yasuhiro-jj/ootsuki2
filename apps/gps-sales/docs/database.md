# データベース

新規の Neon PostgreSQL に、レビューしたマイグレーションだけを適用する。`drizzle-kit push` は使わない。このリポジトリからは適用していない。

## 生成方法

1. `src/db/schema/domain.ts` は `001_initial_schema.sql` のテーブル、制約、複合外部キー、索引に対応する
2. `src/db/schema/auth.ts` は Better Auth 1.7.12 の `npx auth@1.7.12 generate --adapter drizzle --dialect postgresql` の出力。テーブル名は `user`
3. `npx drizzle-kit generate --name initial_schema` が `src/db/migrations/0000_initial_schema.sql` を書いた

マイグレーションの先頭に `CREATE EXTENSION IF NOT EXISTS pgcrypto` を足した。PostgreSQL 13 以降の `gen_random_uuid()` はコアにもある。末尾に、RLS を有効にしていないという警告を残した。降順索引は Drizzle の `DESC NULLS LAST`。対象列は NOT NULL なので、元 SQL の `DESC` と同じ並びに使える。

課金テーブル `plans`、`subscriptions`、`usage_records` はスキーマだけ。アプリの機能はない。

## テナント制約

- `customers` と `visits` は `(id, organization_id)` が一意
- 訪問、位置、写真、結果は、その複合キーへの外部キーで他社の行と結び付かない
- 訪問の担当者は、同じ企業の `memberships` を参照する
- 認証ユーザー ID は text。`memberships.user_id` から `user.id` への外部キーは元 SQL に無い

RLS は無い。接続文字列はサーバーだけが持つ。すべての読み書きは所属確認のあと、その `organization_id` を条件に含める。

## 適用

新しい Neon プロジェクトの `DATABASE_URL` を `apps/gps-sales/.env.local` に置き、レビュー後に `npx drizzle-kit migrate` を実行する。既存の ootsuki2 や `PLATFORM_DATABASE_URL` には向けない。
