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
- `BASIC_AUTH_USER`
- `BASIC_AUTH_PASSWORD`

`NOTION_API_TOKEN` もフォールバックとして利用できます。

公開環境では Basic 認証を必ず設定します。`BASIC_AUTH_USER` と `BASIC_AUTH_PASSWORD` が設定されていると、画面と `/api/*` の両方に認証がかかります。`NODE_ENV=production` で未設定の場合は、安全のため 503 を返します。

AI運用アシスタント（`/api/agent-chat`）を本番でも使う場合は、次も設定します。

- `OPENAI_API_KEY`（未設定だとダッシュボード上のチャットは無効表示）
- 任意: `OPENAI_MODEL`（既定は `gpt-4o-mini`）
- 任意: `OPENAI_TEMPERATURE`（0〜2、未設定時はアプリ側の既定値）

## 実行

```bash
cd "/mnt/c/Users/PC user/OneDrive/Desktop/移行用まとめフォルダー/カーソル　個人/ootsuki2/ai-maneger"
npm install
npm run dev
```

### `/_next/static/...` が 404 になり UI が真っ白・崩れるとき

開発中に **`GET /_next/static/chunks/... 404`** が出て、画面が素の HTML のままになる場合は、次のどれかで直ることが多いです。

1. **開発サーバを一回止めて**（`Ctrl+C`）、**ブラウザをスーパーリロード**（`Ctrl+Shift+R`）してから再度 `npm run dev` で起動する。
2. **`.next` を消してから起動**する: `npm run dev:clean`（`.next` を削除してから `next dev` を起動します）。
3. プロジェクトが **OneDrive 配下**にあると、ビルド成果物の同期でチャンクが欠けることがあります。症状が続く場合は、リポジトリを **OneDrive 外のローカルフォルダ**に置くことを検討してください。

通常の開発は **`npm run dev`** のみでよく、毎回 `.next` を消す必要はありません（以前は起動時に毎回削除しており、Windows 環境で 404 と繋がりやすかったため変更済み）。

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
   - 必須（公開ガード）: `BASIC_AUTH_USER`、`BASIC_AUTH_PASSWORD`
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

## SaaS 化のロードマップ（方向性）

複数テナント向けサービスに広げる場合の**狙いと進め方のメモ**です（現状の MVP は単一ワークスペース前提の `.env` 固定）。

### コンセプト

- **このアプリの UI と API** をプロダクトの中心に据える。
- **データの正本**はお客様の Notion に置いたまま、読み書きは **Notion API** で行う。
- **DB のプロパティ名・型・DB 同士のつながり**はこちらが定義し（下の「Notion 前提」と整合）、お客様には **同じスキーマで Notion 上に DB を用意**してもらう。
- 別ソース（スプレッドシート等）から取り込む場合は、**こちらが定めたプロパティへマッピング**して Notion に書き込む想定にできる。

### テナントごとに必要になる情報

お客様ごとに次をアプリ側で保持する（**ソースに直書きせず**、設定ストアや管理画面経由で登録する想定）。

| 項目 | 役割 |
|------|------|
| **インテグレーションのシークレット**（Internal Integration Secret 等） | そのお客様のワークスペースで Notion API を呼ぶための認証 |
| **データベース ID / ページ ID** | Notion の URL に含まれる ID で、どの DB・どのページを対象にするかを特定 |

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
- `middleware.ts` を追加し、Basic 認証で画面と `/api/*` をまとめて保護するようにした。
- `.env.local.example` に `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` を追加。
- README の環境変数・Vercel デプロイ手順に Basic 認証の設定を追記。
- `npm run lint` 通過。
- `npm run build` 通過。

**現在の判断**

- ローカルで自分だけが使う段階では、この状態でいったん問題なし。
- Vercel など外部公開する場合は、必ず本番環境変数に `BASIC_AUTH_USER` と `BASIC_AUTH_PASSWORD` を設定する。
- `BASIC_AUTH_PASSWORD` は短い値にせず、20文字以上のランダム文字列を使う。

**次回再開時の確認**

1. `.env.local` に `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` が入っているか確認。
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
