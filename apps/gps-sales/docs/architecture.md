# アーキテクチャ

```text
Browser -> Route Handler / Server Action -> session -> membership check -> service -> repository -> Neon
```

アプリの場所は `apps/gps-sales`。リポジトリ直下の `docs/` にはチャットボットの要件とアーキテクチャが既にある。同じ5ファイル名をそこに置くと別製品の文書が混ざるため、このアプリの中に置いた。`apps/` は Python の業種別パッケージだが、ディレクトリ名 `gps-sales` はハイフンを含むので Python モジュールにはならない。

## 既存リポジトリ

調査時点の別アプリは触っていない。

- `frontend/`: Next.js 15.5.15、port 3000。Notion 連携チャット
- `admin-portal/`: Next.js 15.5.15、port 3001
- `ai-maneger/`: Next.js 14.2、port 3002。独自ログイン
- `platform_custom/`: Python の JWT と `PLATFORM_DATABASE_URL`
- ルートの `.env.example` はチャットボット用。このアプリは `apps/gps-sales/.env.example`

`DATABASE_URL` は未設定だった。Neon にも既存 DB にも接続していない。

## 採用バージョン

package-lock が固定する。実装時に公式の安定版を確認した。

- Next.js 16.4.1、React 19.3.0、TypeScript strict、Tailwind CSS 4
- shadcn 4.22.1（既定プリセット。部品は `@base-ui/react`）
- Drizzle ORM 0.45.4、drizzle-kit 0.31.11
- Better Auth 1.7.12。Drizzle アダプタは `better-auth/adapters/drizzle` の `drizzleAdapter`
- Zod 4.6.7、React Hook Form 7.90、Vitest 5、PGlite 0.5（テスト専用）
- `@neondatabase/serverless` 1.2.0 の Pool。トランザクションを使うため HTTP ドライバではない

このアプリは port 3003。`cacheComponents` は有効だが、テナントデータに `use cache` は付けない。

## 認証

Better Auth のテーブルは `user`、`session`、`account`、`verification`。CLI で生成した。`users` テーブルは作らない。organization プラグインは使わない。所属は `memberships`。

`AUTH_SECRET` を Better Auth の `secret` に渡す。`BETTER_AUTH_URL` が base URL。

## ディレクトリ

- `src/lib/auth/` セッションとロール
- `src/db/` クライアント、スキーマ、マイグレーション
- `src/modules/organizations`、`customers`、`access`、`audit`
- `src/lib/geo/` 座標と精度の警告（50m 超は警告であり拒否ではない）
- `src/lib/storage/` オブジェクトキー。R2 への通信は未実装
- `src/components/` shadcn の UI と画面部品

API は `GET /api/me`、組織の作成と更新、顧客 CRUD、メンバーの一覧・招待・承諾・更新・削除。訪問、写真、地図、PDF の API はまだない。

ロールは `owner`、`admin`、`manager`、`staff`。メンバー管理は owner と admin。スタッフの訪問編集は自分の行だけ、という関数だけ用意し、訪問 API にはまだ繋いでいない。
