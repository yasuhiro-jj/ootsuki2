# AI Maneger

Notion のプロジェクトDBを正本として使う、`ootsuki2` 配下の管理アプリMVPです。

## 画面

運用の単一入口は `/dashboard` です（日次入力・週次レビュー・CSV 取込・AI 関連はここに集約）。

- `/` → `/dashboard` にリダイレクト
- `/dashboard` ダッシュボード（日次入力、週次レビュー、CSV、AI運用アシスタント、エージェントハブ）
- `/daily-input` `/reviews` → `/dashboard` にリダイレクト（旧URL互換）
- `/projects` プロジェクト一覧
- `/projects/[id]` プロジェクト詳細
- `/projects/[id]/edit` プロジェクト更新

## 環境変数

`.env.local.example` を `.env.local` にコピーして設定します。

- `NOTION_API_KEY`
- `NOTION_PROJECT_DB_ID`
- `NOTION_OOTSUKI_PROJECT_PAGE_ID`
- `NOTION_OOTSUKI_DAILY_SALES_DB_ID`
- `NOTION_OOTSUKI_KPI_DB_ID`
- `NOTION_OOTSUKI_MEMO_DB_ID`
- `NOTION_OOTSUKI_LINE_REPORT_PAGE_ID`
- `NOTION_OOTSUKI_PRODUCT_COST_DB_ID`
- `NOTION_OOTSUKI_WEEKLY_ACTIONS_DB_ID`
- `NEXT_PUBLIC_APP_NAME`
- `APP_AUTH_SESSION_SECRET`
- `APP_AUTH_USERS_JSON`
- `AUTH_BOOTSTRAP_OWNER_IDS`（任意: tenant membership の初期 owner 投入）
- `AUTH_BOOTSTRAP_DEMO_VIEWER_IDS`（任意: `demo` tenant の閲覧ユーザー投入）

`NOTION_API_TOKEN` もフォールバックとして利用できます。

個別ユーザー認証を必ず設定します。`APP_AUTH_SESSION_SECRET` と `APP_AUTH_USERS_JSON` が設定されていると、ログイン後のセッションで画面と `/api/*` の両方に認証がかかります。

### 認証情報の置き場所

実際のユーザーID / パスワードは `**AUTH_CREDENTIALS.md**` にまとめています（リポジトリを公開する場合は必ずローテーションしてください）。

### `.env.local` の注意（重要）

`APP_AUTH_USERS_JSON` の `passwordHash` は `scrypt$...$...` 形式で `**$` が含まれます**。  
Next.js の環境変数展開で壊れないよう、`.env.local` では `**$` を `\$` にエスケープ**してください。

### デモ閲覧ユーザー（`demo-viewer`）

（デモ）
[https://ootsuki-ai-maneger.vercel.app/login?tenant=demo](https://ootsuki-ai-maneger.vercel.app/login?tenant=demo) 

顧客にデモだけ見せたい場合は、`demo` tenant 用の閲覧ユーザーを使います。

- ログインURLは必ず `**?tenant=demo` 付き**から入る  
例: `http://localhost:3002/login?tenant=demo`
- 認証情報は `AUTH_CREDENTIALS.md` の `**demo-viewer`** を参照
- `TENANT_CONFIG_STORE_ENABLED=true` の場合、`demo-viewer` を `demo` tenant の `viewer` として登録するために `npm run seed:tenant-config` を実行します  
（`demo` 側の Notion トークン未設定でも、membership だけは投入できるようにしてあります）

AI運用アシスタント（`/api/agent-chat`）を本番でも使う場合は、次も設定します。

- `OPENAI_API_KEY`（未設定だとダッシュボード上のチャットは無効表示）
- 任意: `OPENAI_MODEL`（既定は `gpt-4o-mini`）
- 任意: `OPENAI_TEMPERATURE`（0〜2、未設定時はアプリ側の既定値）

## デモ環境（Notion）

本番とは **アプリのコードや仕様は同じ**にし、**データの出どころだけデモ用 Notion** に切り替える運用です。

- **Notion 側**: 本番と **同じ DB／ページ構成**（プロパティ名・型・リレーション）を保ち、**数値・レコード内容だけデモ用**（架空データ）にする。
- **接続**: `.env.local`（または Vercel のプレビュー環境など）の `NOTION_API_KEY` と、上記「環境変数」に列挙した **各 `NOTION_*_ID` を、デモ用ワークスペースの ID に差し替える**。Notion の共有 URL は多くの場合 **1 リソース分**に過ぎないため、**本アプリが要求する全 DB／ページ分**の ID を個別に取得する。
- **インテグレーション**: デモ用の各 DB／ページに、使うインテグレーションを **接続**する（本番用トークンと分けるかは運用次第）。
- **タイミング**: **本番環境の挙動・データを少し検証してから**、デモ用ワークスペースの複製・整備を進めると安全。

### デモ切替の実務手順（Runbook）

デモ切替の実運用は、以下の 3 ファイルを順に使うと漏れを防げます。

- 台帳: `docs/notion-demo/env-inventory.md`
- 構築チェック: `docs/notion-demo/demo-workspace-checklist.md`
- 切替/復旧手順: `docs/notion-demo/cutover-runbook.md`

デモ用の環境変数テンプレートは `.env.demo.example` です。ローカルのデモ確認時は、`.env.local` にデモ値を反映したあと、次を実行します。

```bash
npm run check:notion-env
```

`check:notion-env` は demo モードで Notion の必須キーを検証し、`NOTION_ENV_LABEL=demo` の未設定や ID 形式の誤りを検出します。

## マルチテナント / デモサイトの使い方

このアプリでは、同じコードを使いながら `ootsuki` と `demo` を切り替えて運用します。

- `ootsuki`: 本番運用の tenant
- `demo`: 顧客向けデモや検証用の tenant

考え方は「アプリは同じ、接続先データだけ tenant ごとに分ける」です。`demo` は本番の見た目や操作感を保ちつつ、参照先の Notion データだけをデモ用に切り替えて使います。

### ふだんの使い分け

- 日常運用は `ootsuki` で使う
- 顧客説明、検証、画面確認は `demo` で使う
- 権限管理や監査ログの確認は `ootsuki` の `admin` / `owner` で行う

### tenant の切り替え方

```text
http://localhost:3002/dashboard?tenant=ootsuki
http://localhost:3002/dashboard?tenant=demo
```

本番を Vercel にデプロイしている場合の例（プロジェクトに付いたドメインが `ai-maneger.vercel.app` のとき）:

```text
https://ai-maneger.vercel.app/dashboard
https://ai-maneger.vercel.app/dashboard?tenant=ootsuki
```

プロジェクトへ

cd "C:\Users\PC user\OneDrive\Desktop\移行用まとめフォルダー\カーソル　個人\ootsuki2\ai-maneger"

codex
　　↓
C:\Users\PC user\OneDrive\Desktop\移行用まとめフォルダー\カーソル　個人\ootsuki2\ai-maneger

npm run dev

[http://localhost:3002/login?tenant=demo](http://localhost:3002/login?tenant=demo)

項目	値
ユーザー ID
demo-viewer
パスワード
qhV7g8Myl5Mg9FR9n2lXEA
ログインは ?tenant=demo 付きから行います。

（デモ）
[https://ootsuki-ai-maneger.vercel.app/login?tenant=demo](https://ootsuki-ai-maneger.vercel.app/login?tenant=demo) 

AUTH_CREDENTIALS.md には ootsuki 専用の別ユーザー名は書かれておらず、本番運用側で使うのは 管理者 owner です（「管理者（ローカル開発用）」として記載）。

項目	値
  owner
ユーザー ID　nre03851
ootsuki で開くときは、たとえば次のように tenant=ootsuki を付けたログイン URL を使います。

ootsuki を見たいとき:
[https://ootsuki-ai-maneger.vercel.app/login?tenant=ootsuki](https://ootsuki-ai-maneger.vercel.app/login?tenant=ootsuki)

- `**/dashboard` のみ（クエリなし）** — テナントは下記「段階2: tenant 自動判定」の優先順（`?tenant` → ヘッダ → Cookie → ホスト名 → `.env`）で決まります。`*.vercel.app` のような標準ホスト名だけではホストから `ootsuki` / `demo` は決まらないため、**本番の `ootsuki` を確実に見たい**ときは次のクエリ付きを推奨します。
- `**?tenant=ootsuki` 付き** — 本番 tenant `**ootsuki` を明示**し、`tenant_key` Cookie に保存されます。`demo` を開いたあとに本番へ戻す、ブックマークで常に `ootsuki` に揃える、といった用途に向きます。

上記は **デプロイ先が2つあるわけではなく**、同じダッシュボードに対して **tenant をクエリで明示するかどうか**の違いです。

一度切り替えると `tenant_key` Cookie に保存されるため、その後の画面遷移や API 呼び出しでも同じ tenant が維持されます。

画面右上のバッジに、現在の `tenant / principal / role` が表示されます。デモ確認の前には、ここが `demo` になっていることを必ず確認してください。

### デモサイトとして使うときの流れ

1. `demo` 用 Notion に本番と同じスキーマの DB / ページを用意する
2. `demo` tenant の Notion ID とトークンを設定する
3. `http://localhost:3002/dashboard?tenant=demo` を開く
4. 右上バッジで `tenant=demo` を確認する
5. ダッシュボードやプロジェクト画面をそのままデモに使う

DB 設定ストアを有効にしている場合は、`demo` の Notion 設定は PostgreSQL の `tenant_configs` に保存します。未有効時は `.env.local` の `NOTION_DEMO`_* にフォールバックします。

`demo` tenant は **本番 `ootsuki` の Notion 設定へフォールバックしません**。`NOTION_DEMO`_* または `tenant_configs` の `demo` 設定が不足している場合は、未設定のまま失敗させる前提です。

### どこまで tenant ごとに分かれているか

- Notion の接続先
- API の tenant 判定
- API の tenant / role 認可
- membership
- 監査ログ

そのため、`demo` を使っている限り、更新先も監査ログも `demo` tenant 側として扱われます。

### 管理画面の使い方

管理画面は `\/admin\/tenant-access` です。ここでは次を確認できます。

- tenant 設定の登録状況
- membership 一覧と更新
- 監査ログの閲覧
- 監査ログの検索、期間フィルタ、CSV 出力

この画面は `ootsuki` tenant の `admin` / `owner` 向けです。`demo` tenant で開いても管理操作はさせない前提で設計しています。

### おすすめ運用

- 本番確認は `ootsuki`
- 顧客向け表示確認は `demo`
- デモ前チェックは `check:notion-env -- --tenant=demo`
- membership や監査確認は `ootsuki` で行う

「本番に触らずに見せたい・試したい」作業は、基本的に `demo` tenant で実施すると安全です。

### デモ前チェックリスト

顧客提示や確認作業の前に、以下を上から順に確認します。

#### 最低限ここだけ（急ぐとき）

- `?tenant=demo` 付き URL で入った
- 右上バッジが `demo` になっている
- `demo-viewer` の role が `viewer` である
- demo 画面に本番データ（実名・売上・内部メモ）が出ていない
- 管理操作が demo でできない（`/admin/tenant-access` で弾かれる）
- `demo` が `ootsuki` にフォールバックしない

#### tenant 分離

- `?tenant=demo` 付き URL で必ず入る
- 右上バッジが `tenant=demo` になっている
- `demo` で開いたあと画面遷移しても `tenant_key` が維持される
- シークレットモードでも `tenant=demo` 指定時の挙動が想定どおり

#### データ分離

- Notion の DB / Page ID が demo 用になっている
- demo 用 Notion トークンが本番用と分離されている
- 画面上の数値・案件名・メモが顧客提示用の内容になっている
- 本番固有の実名・売上・内部メモが残っていない
- `demo` 設定不足があるとき `ootsuki` にフォールバックしない

#### 権限制御

- `demo-viewer` でログインできる
- `demo-viewer` の role が `viewer` になっている
- `demo-viewer` で更新系操作（日次入力・週次レビューなど）ができない
- `demo-viewer` で `/admin/tenant-access` を開けない
- `demo` tenant で管理 API が `403` になる

#### 画面・表示

- `/dashboard` が demo 用データで表示される
- CSV 取込・AI補助の文言が顧客向けに問題ない
- 「管理用」「内部用」と分かる表示が demo に出ていない
- 右上の `tenant / principal / role` 表示が demo になっている

#### 顧客提示前

- デモ URL を `?tenant=demo` 付きでブックマークしている
- ログイン情報が demo 用（`demo-viewer`）だけになっている
- 直前に `check:notion-env -- --tenant=demo` を通した
- 顧客に見せる導線を一通り自分で通した
- 画面キャプチャや説明に本番名義が出ない

## セキュリティ運用（マルチテナント）

マルチテナント運用で必須にする運用基準は次を参照してください。

- 運用基準: `docs/security/tenant-security-operations.md`
- Supabase RLS ハードニング: `docs/security/supabase-rls-hardening.md`
- ローテーション記録テンプレート: `docs/security/key-rotation-log-template.md`
- PR 必須チェックテンプレート: `.github/pull_request_template.md`

### 2026-04-22 時点の Supabase Security Advisor 対応状況

Security Advisor で出ていた `RLS disabled in public` は解消済みです。現時点の運用前提は次のとおりです。

- `public.tenant_memberships`
- `public.tenant_configs`
- `public.tenant_audit_logs`

上記3テーブルは **RLS enabled + no policy** を安全側の初期状態として採用しています。  
さらに `anon` / `authenticated` / `public` の broad grant は外しており、クライアントから直接公開しない前提で運用します。

`public.inventory_items` は、以前あった `all users` / `true` の permissive policy を削除済みです。現在は **RLS enabled + no policy** のため、使い道を再確認するまでは閉じたままにします。

### この状態での運用ルール

- `tenant_memberships` / `tenant_configs` / `tenant_audit_logs` は **サーバー経由のみ**で扱う
- ブラウザや `supabase-js` から直接読ませない
- `tenant_configs` は機密台帳として扱い、一般ユーザーに直接見せない
- `tenant_audit_logs` は append-only 前提で、`UPDATE` / `DELETE` を許可しない方針を維持する
- `inventory_items` は利用経路が確定するまで policy を追加しない

### 次にやる優先順位

1. **今日すぐやること**
  - `docs/security/supabase-rls-hardening.md` の動作確認SQLを実行し、RLS と grant の状態を保存する
  - `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public ...` を入れ、今後の新規 table / sequence の broad grant を防ぐ
2. **今週やること**
  - `inventory_items` の利用経路を確認し、client 直参照ではなく server API 経由に寄せるか判断する
  - `tenant_configs` の private schema 移行方針を決める
  - `principal_id` と将来の Supabase Auth ID の対応方針を決める
3. **将来の理想構成**
  - `tenant_configs` は `private` schema へ移す
  - `tenant_memberships` は正本として維持しつつ、必要なら view / RPC 経由で最小公開する
  - `tenant_audit_logs` は server API または専用 RPC 経由の read のみに限定する

### 4つの `RLS Enabled No Policy` の扱い

- **このままでよい**
  - `tenant_memberships`
  - `tenant_configs`
  - `tenant_audit_logs`
- **利用経路を確認してから判断**
  - `inventory_items`

現状の `AI Maneger` 実装では、上の3テーブルをクライアントへ直接公開する必要はありません。  
そのため、no policy のまま閉じておくのが安全です。`inventory_items` だけは、今後使うなら server API 経由を第一候補にし、どうしても direct access が必要な場合だけ最小権限の policy を別途設計します。

### `inventory_items` の基本方針

- 第一候補: **server API 経由に寄せる**
- 直接公開する場合でも、`public` / `authenticated` 全開放はしない
- policy を作るなら、`tenant_key` や `group_id` などの所有境界が明確になってから最小限で作る

### 補足

Security Advisor に残る `Leaked Password Protection Disabled` は、現プランでは `Prevent use of leaked passwords` が有効化できないための warning です。  
現時点では DB 設計上の重大警告は概ね解消済みで、以後は「必要なものだけ最小公開」を守って運用します。

## 段階1: 設定ストア化（DB保存 + envフォールバック）

テナント設定を DB に保存する段階1を導入済みです。`TENANT_CONFIG_STORE_ENABLED=false` の間は従来どおり `.env` のみで動作し、既存本番運用を維持できます。

### 使う環境変数

- `TENANT_CONFIG_STORE_ENABLED` (`true` / `false`)
- `TENANT_CONFIG_DB_URL` (PostgreSQL 接続文字列)
- `APP_CONFIG_ENCRYPTION_KEY` (テナントトークン暗号化キー)

Supabase を使う場合の取得手順は [docs/tenant-config-supabase.md](docs/tenant-config-supabase.md) を参照してください。

### 初期化手順

```bash
npm install
npm run migrate:tenant-config
TENANT_CONFIG_STORE_ENABLED=true npm run seed:tenant-config
```

### 動作確認

```bash
npm run check:notion-env -- --tenant=demo
npm run check:notion-env -- --tenant=ootsuki
```

DB に設定が無い場合は自動で tenant ごとの `.env` 値へフォールバックします。`demo` は `NOTION_DEMO_*` のみを参照し、本番 `ootsuki` 値は使いません。

### テナントが増えるときの対策（いつでも参照できるメモ）

Vercel の環境変数に `NOTION_*` をテナントの数だけ増やすと運用が重くなるため、**増やす前に**次を検討してください。


| 施策                  | 内容                                                                                                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **設定を DB に寄せる（推奨）** | 上記「段階1」を有効にし、テナント固有のトークン・各 DB ID を `**tenant_configs`（PostgreSQL）** に保存する。ローカル／本番の `.env` には共通の接続情報（`TENANT_CONFIG_DB_URL`・`APP_CONFIG_ENCRYPTION_KEY` など）だけを置ける。詳細は [docs/tenant-config-supabase.md](docs/tenant-config-supabase.md)。 |
| **長期的には**           | `TenantKey` を固定ユニオンではなく **任意の文字列**にし、`tenant_configs` を正とする運用へ移行する（コードのリファクタが別途必要）。現状 README の「SaaS 化のロードマップ」の方向と同じ。                                                                                                                   |


#### Supabase（PostgreSQL）を用意する最短手順

業務データはこれまでどおり Notion。Supabase の DB は **テナント接続情報の台帳**として使う。

1. [Supabase](https://supabase.com/dashboard) でプロジェクト作成。
2. **Project Settings → Database → Connection string（URI）** を取得し、パスワードを埋める。
3. `.env.local`（本番は Vercel の Environment Variables）に `TENANT_CONFIG_STORE_ENABLED=true`・`TENANT_CONFIG_DB_URL`・`APP_CONFIG_ENCRYPTION_KEY`（32文字以上のランダム。**Notion のトークンとは別**）を設定。
4. ルートで `npm run migrate:tenant-config` → `npm run seed:tenant-config` → `npm run check:notion-env -- --tenant=demo` などで確認。

詳細・トラブルシュート（IPv6／Pooler）は [docs/tenant-config-supabase.md](docs/tenant-config-supabase.md) に一元化済み。

#### コードを増やして「3テナント目」を入れるとき触る場所（現状コードは `TenantKey == "ootsuki" \| "demo"` の二択）

新しい名前（例: `clientb`）を **型にもルーティングにも** 足す場合のチェックリスト。実際の名前はプロジェクトで統一すること。


| 区分         | 主なファイル                                                                                    | 変更内容                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 型          | `lib/tenant-config/types.ts`                                                              | `TenantKey` に 3つ目を追加                                                                 |
| 解決・環境      | `lib/tenant-config/service.ts`                                                            | `normalizeTenantKey`、`getEnvTenantNotionConfig`、`build`*（新テナント用の `NOTION_`* プレフィックス） |
| Middleware | `middleware.ts`                                                                           | 同上の許可キー／ホスト名ルール                                                                      |
| API の検証    | `app/api/admin/tenant-config/route.ts`、`tenant-memberships` など `validateTenantKey` が二択の箇所 | 3値に拡張                                                                                |
| 管理 UI      | `app/admin/tenant-access/page.tsx`、`components/admin/tenant-membership-manager.tsx`       | プルダウン／フィルタ                                                                           |
| Scripts    | `scripts/seed-tenant-config.ts`、`scripts/check-notion-env.ts`                             | 対象 tenant のリスト                                                                       |
| 画面分岐       | `app/dashboard/page.tsx` など                                                               | `tenant === "demo"` など二択だと誤表示になるため要調整                                                |
| 許可リスト      | `TENANT_READ_ALLOWLIST` 等の環境変数                                                            | `段階3` の説明どおり CSV で追記可否を確認                                                            |


**注意:** 「3つ目」を **環境変数だけ**で増やしても、`normalizeTenantKey` が弾けばログイン済みでもテナントとして認められません。上表と **allowlist** をセットで見直してください。

## 段階2: tenant 自動判定

テナント判定は次の優先順で行います。

1. URL クエリ `?tenant=demo` / `?tenant=ootsuki`
2. リクエストヘッダ `x-tenant-key`
3. `tenant_key` Cookie
4. ホスト名 (`demo.`* / `ootsuki.`*)
5. `.env` (`NOTION_ACTIVE_TENANT` / `NOTION_ENV_LABEL`)

ローカルで切り替えるときは、たとえば次の URL を開くと `tenant_key` Cookie に保存されます。

```text
http://localhost:3002/dashboard?tenant=demo
```

ホスト名で切り替えたい場合は `TENANT_HOST_MAP` に JSON か `host=tenant` のカンマ区切りで設定できます。

## 段階3: API tenant 認可ガード

API ルートは `tenant` を特定できない場合に失敗し、さらに操作種別ごとの allowlist を確認します。

- `TENANT_READ_ALLOWLIST` 既定: `ootsuki,demo`
- `TENANT_WRITE_ALLOWLIST` 既定: `ootsuki,demo`
- `TENANT_ADMIN_ALLOWLIST` 既定: `ootsuki`

たとえば `demo` では管理APIを使わせたくない場合、既定のままで `GET/POST /api/admin/tenant-config` は `403` になります。

### 段階3.5: user / role ベース認可

`tenant_memberships` テーブルに `principalId -> tenant -> role` を保存し、API は次のロールで認可します。

- `read`: `viewer` / `editor` / `admin` / `owner`
- `write`: `editor` / `admin` / `owner`
- `admin`: `admin` / `owner`

初期 owner をまとめて投入したい場合は、`AUTH_BOOTSTRAP_OWNER_IDS=user1,user2` を設定して `seed:tenant-config` を実行します。

`demo` tenant の閲覧専用ユーザーをまとめて投入したい場合は、`AUTH_BOOTSTRAP_DEMO_VIEWER_IDS=demo-viewer` を設定して `seed:tenant-config` を実行します（`demo` tenant に `viewer` ロールで登録されます）。

ヘッダー右上には、現在の `tenant / principal / role` を表示します。role は `tenant_memberships` の値のみを使い、暫定許可の fallback は使いません。

管理者向けの簡易 UI は `\/admin\/tenant-access` です。`ootsuki` tenant の `admin` / `owner` のみ開けます。

### 段階6: 監査ログ

主要な更新系 API は `tenant_audit_logs` に監査ログを書き込みます。現時点では次を記録します。

- 日次入力
- 日次一括入力
- 週次レビュー
- 週次アクション
- 週次サマリー更新
- tenant 設定更新
- tenant membership 更新

`/admin/tenant-access` の下部に「直近の監査ログ」を表示します。`tenant` / `action` 複数選択 / 期間 / 検索語で絞り込みでき、日時の並び順も切り替えられます。`Details` 列で件数や対象週などの要約を確認でき、現在の絞り込み条件のまま `CSV 出力` も可能です。

この段階で、ローカル運用としては以下が利用可能です。

- tenant 自動判定
- API の tenant / role 認可
- tenant / principal / role の画面表示
- membership 管理 UI
- 監査ログの保存と閲覧
- 監査ログの期間フィルタ
- 監査ログの CSV 出力
- 監査ログの検索

## 実行

```bash
cd "/mnt/c/Users/PC user/OneDrive/Desktop/移行用まとめフォルダー/カーソル　個人/ootsuki2/ai-maneger"
npm install
npm run dev
```

### `/_next/static/...` が 404 になり UI が真っ白・崩れるとき

開発中に `**GET /_next/static/chunks/... 404**` が出て、画面が素の HTML のままになる場合は、次のどれかで直ることが多いです。

1. **開発サーバを一回止めて**（`Ctrl+C`）、**ブラウザをスーパーリロード**（`Ctrl+Shift+R`）してから再度 `npm run dev` で起動する。
2. `**.next` を消してから起動**する: `npm run dev:clean`（`.next` を削除してから `next dev` を起動します）。
3. プロジェクトが **OneDrive 配下**にあると、ビルド成果物の同期でチャンクが欠けることがあります。症状が続く場合は、リポジトリを **OneDrive 外のローカルフォルダ**に置くことを検討してください。

通常の開発は `**npm run dev`** のみでよく、毎回 `.next` を消す必要はありません（以前は起動時に毎回削除しており、Windows 環境で 404 と繋がりやすかったため変更済み）。

PowerShell では、**パスは必ず1行**にしてください（途中改行すると `cd` が失敗し、別フォルダで `npm run start` が走って `Missing script: "start"` になります）。

```powershell
cd "C:\Users\PC user\OneDrive\Desktop\移行用まとめフォルダー\カーソル　個人\ootsuki2\ai-maneger"
npm run build
npm run start
```

`npm run start` は本番モード（`next start`）で、事前に `npm run build` が必要です。普段の開発は `npm run dev`（下の「再開手順」と同じ）で十分です。

開発サーバーは `http://localhost:3002` で起動します。

## 再開手順

翌日に作業を再開するときは、以下だけで開始できます。

```powershell
cd "C:\Users\PC user\OneDrive\Desktop\移行用まとめフォルダー\カーソル　個人\ootsuki2\ai-maneger"
npm run dev
```

その後、ブラウザで `http://localhost:3002` を開きます。

## Vercel へのデプロイ

### 前提

- この Next.js アプリ（`ai-maneger`）が **Git リポジトリとして Vercel に接続できる**こと（GitHub / GitLab / Bitbucket など）。
- 本番でも使う **Notion インテグレーション** と **環境変数** を用意しておくこと。

### ダッシュボードから接続する手順

1. [Vercel](https://vercel.com/) にログインし、**Add New… → Project** でリポジトリをインポートする。
2. **Root Directory** を設定する。
  - リポジトリのルートがこの `ai-maneger` フォルダと同じなら、そのまま（空または `.`）。
  - リポジトリのルートが上位フォルダの場合は、**Settings → General → Root Directory** に、このアプリのパス（例: `カーソル　個人/ootsuki2/ai-maneger` など、実際の相対パス）を指定する。
3. **Framework Preset** は `Next.js` のまま。ビルドは通常次で足りる。
  - Install Command: `npm install`（既定）
  - Build Command: `npm run build`（既定）
  - Output: Next.js 既定（変更不要）
4. **Environment Variables** に、ローカルの `.env.local` と同じキーを登録する（本番・プレビューどちらに入れるかは用途に合わせて選択）。
  - 必須（Notion）: `NOTION_API_KEY`、`NOTION_PROJECT_DB_ID`、`NOTION_OOTSUKI_PROJECT_PAGE_ID`、`NOTION_OOTSUKI_DAILY_SALES_DB_ID`、`NOTION_OOTSUKI_KPI_DB_ID`、`NOTION_OOTSUKI_MEMO_DB_ID`、`NOTION_OOTSUKI_LINE_REPORT_PAGE_ID`、`NOTION_OOTSUKI_PRODUCT_COST_DB_ID`、`NOTION_OOTSUKI_WEEKLY_ACTIONS_DB_ID`
  - 必須（個別認証）: `APP_AUTH_SESSION_SECRET`、`APP_AUTH_USERS_JSON`
  - 推奨: `NEXT_PUBLIC_APP_NAME`
  - 任意: `NOTION_API_TOKEN`（`NOTION_API_KEY` の代わり／併用のフォールバック）
  - AIチャットを本番で使う場合: `OPENAI_API_KEY`、および必要なら `OPENAI_MODEL` / `OPENAI_TEMPERATURE`
5. **Deploy** を実行する。完了後に表示される URL のトップは `/dashboard` にリダイレクトする。
6. Notion でエラーになる場合は、**そのインテグレーションが対象DB・ページに接続されているか**、本番ドメインまわりは不要（Notion はサーバーから API 呼び出し）であることを確認する。

### CLI でデプロイする手順（任意）

プロジェクトルートで [Vercel CLI](https://vercel.com/docs/cli) を入れたうえで:

```bash
cd "（ai-maneger へのパス）"
npm install
npx vercel        # プレビュー
npx vercel --prod # 本番
```

初回はブラウザでログインとプロジェクト紐づけを求められる。環境変数はダッシュボードの **Settings → Environment Variables** で後からでも追加・変更できる。

### 補足

- `package.json` の `start` は `--port 3002` だが、**Vercel ではプラットフォームがポートを割り当てる**ため、本番では `next start` の既定動作に任せる想定で問題ない（ビルドは `next build` のみ使用）。
- シークレットはリポジトリにコミットせず、必ず Vercel の環境変数にだけ置く。
- 本番で常に `ootsuki` tenant で開きたい場合は、ブックマークを `https://（付与されたドメイン）/dashboard?tenant=ootsuki` にするとよい（詳細は上の「マルチテナント / デモサイトの使い方」→「tenant の切り替え方」）。

## SaaS 化のロードマップ（方向性）

複数テナント向けサービスに広げる場合の**狙いと進め方のメモ**です（現状の MVP は単一ワークスペース前提の `.env` 固定）。

### コンセプト

- **このアプリの UI と API** をプロダクトの中心に据える。
- **データの正本**はお客様の Notion に置いたまま、読み書きは **Notion API** で行う。
- **DB のプロパティ名・型・DB 同士のつながり**はこちらが定義し（下の「Notion 前提」と整合）、お客様には **同じスキーマで Notion 上に DB を用意**してもらう。
- 別ソース（スプレッドシート等）から取り込む場合は、**こちらが定めたプロパティへマッピング**して Notion に書き込む想定にできる。

### テナントごとに必要になる情報

お客様ごとに次をアプリ側で保持する（**ソースに直書きせず**、設定ストアや管理画面経由で登録する想定）。


| 項目                                                  | 役割                                            |
| --------------------------------------------------- | --------------------------------------------- |
| **インテグレーションのシークレット**（Internal Integration Secret 等） | そのお客様のワークスペースで Notion API を呼ぶための認証            |
| **データベース ID / ページ ID**                              | Notion の URL に含まれる ID で、どの DB・どのページを対象にするかを特定 |


プロパティ名が完全一致しない運用に耐えるなら、**テナント別のプロパティマッピング**（表示名 → 内部キー）を設ける選択肢がある。

### Notion AI について

業務データの読み書きの前提は **Notion の DB とインテグレーション（API）** である。**Notion AI**（チャット補助など）は必須ではなく、必要に応じて併用、程度の位置づけでよい。

### 技術的に足りるようになること（ざっくり段階）

1. **設定のマルチテナント化** — 現状の環境変数相当を、テナント ID に紐づく設定（暗号化保存）へ移す。
2. **接続の登録フロー** — 管理画面やオンボーディングで、シークレットと各 DB/ページ ID を安全に登録・更新できるようにする。
3. **認可** — ログインユーザとテナントの対応、API ルートで「そのテナントの Notion だけ」を触ることの保証。
4. **運用** — Notion API のレート制限、障害時の挙動、監査・サポートのしやすさ（必要なら公開インテグレーション＋OAuth を検討）。

### 現状コードとの関係

プロパティと型が **README の前提と揃っていれば**、今の UI と `lib/notion` まわりのロジックは **再利用しやすい**。SaaS 化の主な差分は、**「1 セットの `.env`」を「テナントごとの接続情報＋認可」に置き換えること**になる。

## Cursor 運用メモ

- 今後の実装・保守・運用整理は `Cursor` を前提に進める
- 通常運用の入口は `/dashboard`
- `daily-input` と `reviews` は補助ページではなく、現在は `/dashboard` へ集約済み
- 開発中に `Next.js` のキャッシュ破損で表示が崩れることがあるため、その場合は `npm run dev` ではなく `npm run build && npm run start` の確認も候補にする
- 画面上の CSV 取込、AI運用アシスタント、エージェント呼び出しハブはすべて `/dashboard` から使う

もし画面に Notion 関連のエラーが出た場合は、次を確認します。

- `.env.local` に `NOTION_API_KEY` と `NOTION_PROJECT_DB_ID` が入っているか
- `.env.local` に `NOTION_OOTSUKI_PROJECT_PAGE_ID` `NOTION_OOTSUKI_DAILY_SALES_DB_ID` `NOTION_OOTSUKI_KPI_DB_ID` `NOTION_OOTSUKI_MEMO_DB_ID` `NOTION_OOTSUKI_LINE_REPORT_PAGE_ID` `NOTION_OOTSUKI_PRODUCT_COST_DB_ID` `NOTION_OOTSUKI_WEEKLY_ACTIONS_DB_ID` が入っているか
- 対象の Notion プロジェクトDBに、そのインテグレーションが接続されているか

## 現在の状態

- `/dashboard` を運用の単一入口として使用
- `日次入力 -> 日次売上DB保存 -> 週次集計更新` はダッシュボードから実行可能
- 日次KPI CSV をダッシュボードから取込可能
- 商品分析 CSV をダッシュボードから取込可能
- 商品分析 CSV は現在「分析表示のみ」で、粗利率へは自動反映しない
- AI運用アシスタントは Notion データを前提に相談可能
- エージェント呼び出しハブは依頼入力と回答表示が可能
- `npm run build` は通過済み

## 作業ログ

### 2026-04-15

本日は公開前の安全確認として、API 認証まわりを点検しました。

**対応済み**

- `.env.local.example` の `NOTION_API_KEY` を実トークンではなくダミー値に変更。
- `middleware.ts` を追加し、Basic 認証で画面と `/api/`* をまとめて保護するようにした。
- `.env.local.example` に `APP_AUTH_SESSION_SECRET` / `APP_AUTH_USERS_JSON` を追加。
- README の環境変数・Vercel デプロイ手順に Basic 認証の設定を追記。
- `npm run lint` 通過。
- `npm run build` 通過。

**現在の判断**

- ローカルで自分だけが使う段階では、この状態でいったん問題なし。
- Vercel など外部公開する場合は、必ず本番環境変数に `APP_AUTH_SESSION_SECRET` と `APP_AUTH_USERS_JSON` を設定する。
- パスワードは `npm run hash:password -- <password>` でハッシュ化してから `APP_AUTH_USERS_JSON` に設定する。

**次回再開時の確認**

1. `.env.local` に `APP_AUTH_SESSION_SECRET` / `APP_AUTH_USERS_JSON` が入っているか確認。
2. `npm run build` 後、`npm run start` で `http://localhost:3002` を開き、Basic 認証が表示されるか確認。
3. Vercel に出す場合は、Environment Variables に Notion / OpenAI / Basic 認証の値を入れてからデプロイする。

### 2026-04-14

本日のダッシュボード周りの変更メモです。翌日はこの節を見れば続きから着手できます。

**今週の判断材料**

- Notion の最新判断メモまたは週次レビュー（更新日が新しい方）を上部に表示。
- その下にエージェント提案（`/api/agent-chat`）で「要点・関連数字・次アクション」を JSON で返させ、確認用下書きに反映する UI を追加。
- 下書き欄の見出しとラベル（「確認用下書き（必要ならコピペ利用）」「タイトル」「要点」「関連数字」「次アクション」）は**残す**。入力欄の**初期値は空欄**。

**売上早見表**

- 「今週の判断材料」付近に `売上早見表` カードを追加。
- 表示月をセレクトで切り替え可能。
- **日次売上**: 日次売上 DB のレコード（`KpiSnapshotEntry.date` が付く行）から一覧。昨対比は日次の `salesYoY` があれば表示。
- **週次売上**: KPI スナップショット DB の「週次集計」行を、選択月の範囲で集計して表示。昨対比は前年同週の週次行があれば計算し、なければ `salesYoY` をフォールバック。
- **当月累計売上・昨対比**: KPI DB に「月次売上」系の行があればそれを優先し、なければ選択月の日次合算。
- 日次・週次 KPI の Notion クエリは **ページングで全件取得**（100 件制限で履歴が欠ける問題の回避）。
- 月候補は日次の日付に加え、週次・月次サマリ行の `週開始` の年月も含めて生成（日次がまだ少ない月でも過去月を選べるようにするため）。

**LINE 配信**

- `LineCopyCard` をクライアントコンポーネント化し、従来の「現在の配信文」表示に加えて、エージェントで `title` / `body` を提案・下書き編集・コピーできるようにした。
- `OPENAI_API_KEY` 未設定時は提案ボタン無効とメッセージ表示（`enabled` はダッシュボードの `agentChatEnabled` と連動）。

**運用上の注意**

- 本番モード（`npm run start`）ではコード変更後に **必ず `npm run build` してからサーバ再起動**しないと、UI が古いままに見えることがある。

### （続き）売上早見表の拡張

README「次にやること」のうち、**売上早見表に客数・客単価を出す**件を実装しました。

- **日次売上**テーブル: 列を追加（客数・客単価）。客単価は DB 値が無い場合は売上÷客数で算出。
- **週次売上**テーブル: KPI 週次行の客数・客単価を同様に表示。
- **当月累計**の見出し横: 売上に加え、当月の客数合計と客単価（月次サマリ行がある場合はその値、なければ日次の合算から算出）を表示。

## Notion 前提

KPI DB では以下のプロパティ名を前提にしています。

- `粗利率(%)`
- `LINE登録数`
- `LINE経由来店数`

週次レビューはメモDBの `振り返り` カテゴリとして保存します。

## Notion AI 向けスキーマ統一指示書

デモ環境や新規ワークスペースで Notion DB を整備する際、以下の指示書を **Notion AI にそのまま貼り付けて** 使ってください。  
プロパティ名・型の不一致を自動修正し、CSV取込・API保存が失敗しない状態にします。

```text
あなたはNotionデータベース設計の監査担当です。
このワークスペース内のデータベースを、下記アプリ要件に100%一致するように整備してください。
重要: プロパティ名・型の不一致があるとCSV取込や保存APIが失敗するため、必ず型まで一致させてください。

# 目的
- demo環境でレジCSV取込・日次保存・週次保存・判断メモ保存・プロジェクト方針保存が失敗しない状態にする
- 本番データは使わず、demoデータのみで運用できる状態にする

# 作業ルール
1) 既存DBを優先して修正する（不要な新規DB乱立はしない）
2) プロパティ名は日本語名を優先し、下記「必須名」に合わせる
3) 型が違う場合は「正しい型の新規プロパティ」を作成し、既存値を移す
4) セレクト/ステータスは必要な選択肢を作る
5) 変更後に「どのDBのどの列をどう直したか」を一覧で報告する

# 必須DBと必須プロパティ

## A. 日次売上DB（daily sales）
- タイトル: title
- 日付: date
- 週開始: date
- 週終了: date
- 売上: number
- 客数: number
- 客単価: number
- 粗利率(%): number
- 粗利: number
- LINE登録数: number
- LINE経由来店数: number
- 売上昨対比: number（空許可）
- 客数昨対比: number（空許可）
- 客単価昨対比: number（空許可）
- 取消返品: number
- 値引き: number
- 決済内訳メモ: rich_text
- ソース: rich_text
- メモ: rich_text
- MEO: checkbox
- LINE: checkbox
- 店頭POP: checkbox

## B. KPI/週次集計DB
- タイトル: title
- 週開始: date
- 週終了: date
- 売上: number
- 客数: number
- 客単価: number
- 粗利率(%): number
- 粗利: number
- LINE登録数: number
- LINE経由来店数: number
- メモ: rich_text
- ソース: rich_text
（補足: 日付列があっても良いが、週次行は週開始/週終了を必須とする）

## C. メモDB（判断メモ・週次レビュー・プロジェクト方針を保存）
- タイトル: title
- カテゴリ: select（必須候補: 振り返り, 判断メモ, プロジェクト方針, プロジェクト状況）
- ステータス: status もしくは select
- 日付: date
- 週開始: date（任意）
- 週終了: date（任意）
- 要点: rich_text
- 関連数字: rich_text
- 次アクション: rich_text

## D. 週次アクションDB
- タイトル: title（または rich_text だが title 推奨）
- 週開始: date
- 週終了: date
- 実行項目: rich_text
- ステータス: status または select
- ソース: rich_text

## E. プロジェクトDB
- 案件名: title（またはName/title）
- KPI目標: rich_text
- KPI実績: rich_text
- ステータス: status / select / rich_text のいずれか（status推奨）

## F. 商品原価DB
- 商品コード: rich_text
- 商品名: title または rich_text
- 想定原価: number
- 計算対象外: checkbox

# 重点チェック（CSV取込失敗の原因になりやすい）
- 日次売上DBに「日付(date)」「売上(number)」「客数(number)」があるか
- 「粗利率(%)」が text ではなく number か
- 「LINE登録数」「LINE経由来店数」が number か
- メモDBの「要点」「関連数字」「次アクション」が rich_text か
- 週次アクションDBの「実行項目」が rich_text か

# 完了時の報告フォーマット
1. DBごとの修正一覧（変更前 → 変更後）
2. まだ未解決の不一致（あれば）
3. このままアプリ接続してよいかの判定（OK/NG）
```

### Notion デモ環境 監査完了報告（2026-04-29）

デモ6DBのプロパティ名・型をアプリ要件に揃えた監査結果と、Cursor 側でのフォロー（環境変数・接続テスト等）は次のドキュメントにまとめています。

[docs/notion-demo/cursor-report-notion-db-audit-2026-04-29.md](docs/notion-demo/cursor-report-notion-db-audit-2026-04-29.md)

## 検証メモ

2026-04-10 時点で以下を確認済みです。

- 日次入力テスト値 `売上 50,000 / 客数 40 / 粗利率 65.0 / LINE登録数 8 / LINE経由来店数 3` を保存
- `/dashboard` に同値が反映されることを確認（`/reviews` は `/dashboard` へリダイレクト）
- 対象週 `2026-04-06` から `2026-04-12` の週次レビューを保存
- 同じ週の週次レビューを再保存すると、新規作成ではなく更新されることを確認

## 次にやること

優先順は以下です。

1. 判断材料の下書きを Notion に保存するフローが必要なら設計する（現状は画面内下書きのみ）
2. 商品分析 CSV の列名と原価データの整備後、粗利率の自動反映を再開するか決める
3. `/dashboard` の AI運用アシスタントに、統合レポートの出力形式をさらに整える
4. 実データで CSV 取込フローを再確認する
5. Vercel 本番デプロイを進める

## 次回の指示テンプレ

次回は以下のどれかをそのまま指示すれば再開しやすいです。

- `READMEの次にやること 1 から進めて`
- `検証用に入れた日次入力と週次レビューを整理して`
- `最新状態で build 確認して`
- `Vercel 本番デプロイを進めて`

## 構成

```text
app/
  dashboard/
  daily-input/
  projects/
  reviews/
lib/
  notion/
components/
  common/
  ootsuki/
  projects/
types/
```

## 2026-04-21 運用メモ

Vercel 本番で `ootsuki` と `demo` のダッシュボード分離を確認済みです。

### 使う URL

- `ootsuki`: `https://ootsuki-ai-maneger.vercel.app/login?tenant=ootsuki`
- `demo`: `https://ootsuki-ai-maneger.vercel.app/login?tenant=demo`

通常ブラウザでは `tenant_key` Cookie が残るため、前回見ていた tenant が維持されます。  
切替ミスを避けるため、**本番運用もデモ確認もクエリ付き URL をブックマークして使う**のを推奨します。

### Vercel 本番で必要だった項目

- 個別認証: `APP_AUTH_SESSION_SECRET`, `APP_AUTH_USERS_JSON`
- tenant 設定ストア: `TENANT_CONFIG_STORE_ENABLED=true`, `TENANT_CONFIG_DB_URL`, `APP_CONFIG_ENCRYPTION_KEY`
- `ootsuki` 用 Notion: `NOTION_`*, `NOTION_OOTSUKI_`*
- `demo` 用 Notion: `NOTION_DEMO_*`

`demo` は `ootsuki` の Notion 設定へフォールバックしないため、`NOTION_DEMO_*` は全件必要です。

### Supabase 側で必要だった項目

`tenant_memberships` 、少なくとも次の組み合わせが必要です。

- `tenant_key=ootsuki`, `principal_id=owner`, `role=owner`, `is_active=true`
- `tenant_key=demo`, `principal_id=owner`, `role=owner`, `is_active=true`
- `tenant_key=demo`, `principal_id=demo-viewer`, `role=viewer`, `is_active=true`

`tenant_configs` には `ootsuki` / `demo` それぞれの Notion 接続情報を保存します。

### ハマりどころ

- Notion の DB / Page ID は **UUID のみ**を使う。`collection://...` やページ URL 全文は不可。
- Vercel Production は `main` ブランチを見ているため、修正を本番反映するときは `**main` へマージ済みか**確認する。
- シークレットモードでは Cookie が空になるため、tenant 未指定 URL では意図しない tenant になることがある。まずは `?tenant=...` 付き URL で確認する。

### 今回確認できたこと

- `ootsuki` と `demo` で別ダッシュボードを表示できる
- Supabase の `tenant_memberships` による権限制御が効いている
- Vercel 本番でも `tenant=ootsuki` / `tenant=demo` の切替ができる

### 2026-04-22 変更点（今週の実行項目 保存エラー対応）

症状:

- `タイトル is not a property that exists`
- `ステータス is expected to be select`
- `ソース is not a property that exists`

原因:

- `今週の実行項目` 保存時に、Notion へ `タイトル / ステータス / ソース` を固定キー・固定型で送っていた。
- tenant ごとの DB スキーマ（列名/型）差分や、DB に既存レコードがないケースで不一致が発生していた。

対応:

- `lib/notion/ootsuki.ts` の `saveWeeklyActionPlan` を、DB 実スキーマに合わせて保存する方式へ変更。
  - タイトル系: `title` / `rich_text` を実型に合わせて送信
  - ステータス系: `status` / `select` の両方に対応
  - `ソース` など任意列は、実在する列名へマッピングして送信
- `lib/notion/client.ts` に `getDatabaseSchemaProperties` を追加し、既存ページがなくても DB 定義から型判定可能にした。
- スキーマ取得不能時は固定キー送信をせず、設定/権限確認を促す明示エラーを返すようにした。

補足（運用）:

- `ootsuki-ai-maneger` を主運用 URL にする場合は、Vercel のリンク先プロジェクトを `ootsuki-ai-maneger` に固定してからデプロイする。
- 反映確認 URL: `https://ootsuki-ai-maneger.vercel.app/login?tenant=ootsuki`

### 何が共通で、何が tenant ごとに別か


| 項目                          | ootsuki / demo で共通か | 変更したときの反映                      |
| --------------------------- | ------------------- | ------------------------------ |
| アプリの画面                      | 共通                  | 片方のためにコードを変更すると、両方に反映          |
| 機能・集計ロジック                   | 共通                  | 修正すると両方に反映                     |
| Vercel にデプロイしたコード           | 共通                  | デプロイ後、両方に反映                    |
| Notion のデータ内容               | 別                   | その tenant 側だけに反映。自動で相互反映しない    |
| Notion の DB / ページ ID        | 別                   | `ootsuki` と `demo` で別管理        |
| Notion のトークン                | 別                   | `ootsuki` と `demo` で別管理        |
| `tenant_memberships` / role | tenant ごとに別         | その tenant の権限だけに影響             |
| 監査ログ                        | tenant ごとに別         | その tenant 側に記録                 |
| Notion の DB 構造（列名・型・リレーション） | 基本は揃える必要あり          | 片方だけ変えると壊れることがあるので、両方に合わせる必要あり |


一言でいうと、**アプリ本体は共通、Notion データと権限は tenant ごとに別**です。

### Claude Code エージェント実装メモ

Claude Code で、この `AI Maneger` の既存エージェント導線を拡張する構想メモを作成済みです。  
**今はまだ実装しない**前提で、後から再開できるように指示書だけ残しています。

- 指示書: `docs/claude-code-agent-instruction.md`

やりたい方向性は次のとおりです。

- 既存の `AI運用アシスタント` / `エージェント呼び出しハブ` を活かす
- 自由文回答だけでなく、`JSON` ベースの structured response を返せるようにする
- 売上分析、LINE配信、週次レビュー整理を優先して強化する
- いきなり Notion 自動保存はせず、まずは **下書きを確認して採用する UI** を作る
- tenant をまたいだ保存や参照を起こさない

実装を再開するときは、まず `docs/claude-code-agent-instruction.md` を Claude Code に渡し、**フェーズ 1 の最小実装**から始める想定です。