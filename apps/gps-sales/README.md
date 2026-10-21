# GPS営業訪問

複数企業向けの訪問管理アプリです。既存の ootsuki2 チャットボットとは別ディレクトリです。

文書は `docs/requirements.md`、`docs/architecture.md`、`docs/database.md`、`docs/security.md`、`docs/tasks.md`。

```bash
cd apps/gps-sales
cp .env.example .env.local
npm install
npm run dev
```

開発サーバーは port 3003 です。`DATABASE_URL` は新しい Neon プロジェクトだけに向けてください。接続が無い状態でも `npm test` と `npm run build` は実行できます。マイグレーションの適用はレビュー後に、このアプリのデータベースへだけ行います。
