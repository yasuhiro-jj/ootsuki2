# タスク

## Phase 0

- [x] 既存リポジトリの調査。別アプリの認証、DB、文書は変更しない
- [x] `DATABASE_URL` が未設定であることを確認し、接続しない
- [x] `.env.example` に接続先、認証、R2、地図の変数を書く
- [x] 要件、アーキテクチャ、データベース、セキュリティ、この一覧
- [x] Next.js 16.4.1、Better Auth 1.7.12、Drizzle 0.45.4 を固定

## Phase 1

- [x] App Router、TypeScript strict、Tailwind、shadcn
- [x] Drizzle スキーマとレビュー用マイグレーション。`drizzle-kit push` は無い
- [x] Better Auth を Drizzle に接続。`user` テーブルのみで、`users` は作らない
- [x] 企業作成、招待、承諾、権限、停止、最後のオーナー保護
- [x] 顧客 CRUD と他社拒否のテスト
- [x] `npm test`、`npm run lint`、`npm run typecheck`、`npm run build` はデータベース無しで実行できる

## Phase 2

- [ ] 訪問の開始と終了
- [ ] チェックイン時だけの位置。精度警告。無許可時の代替入力
- [ ] 写真の署名アップロードと完了確認。他社のオブジェクトは拒否
- [ ] 一覧、詳細、地図。スタッフは自分の訪問だけ編集
- [ ] スマホ幅の操作確認
- [ ] `/admin` の実体。企業ユーザーから隔離

## Phase 3

- [ ] PDF と CSV
- [ ] 検索とフィルタ
- [ ] 監査ログの閲覧
- [ ] バックアップと復旧手順
- [ ] Playwright。iOS Safari と Android Chrome
- [ ] CI に e2e を足す。いまの CI は typecheck、lint、test、build

## Phase 4（着手しない）

- [ ] プラン、使用量、請求
- [ ] AI 日報
- [ ] 招待メール
- [ ] 利用規約とプライバシー文面
- [ ] エクスポートと解約時の削除

## 未確定

1. 写真、位置、顧客の保管期間、削除、従業員への通知文
2. 招待の期限列が元 SQL に無い。期限切れ拒否はスキーマを決めてから
3. スタッフに顧客の作成と更新を許すか。いまは有効な所属全員ができる
4. 顧客の論理削除を足すか
5. 地図タイルの提供者
6. メールアドレス確認をいつ必須にするか
7. スラッグ変更を許すか
8. Better Auth のユーザー削除と `memberships` の連動。外部キーは元 SQL に無い
9. `R2_PUBLIC_BASE_URL` は空のままにする。恒久公開には使わない
