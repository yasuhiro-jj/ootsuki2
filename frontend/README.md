# おおつきチャットボット - Next.js フロントエンド

## ドキュメント

**起動方法・環境変数・`/agent`（Notion 連携チャット）の説明は、リポジトリ直下の `README.md` にまとめています。**

→ **`../README.md`** のセクション **「Next.js フロントエンドと Notion 連携チャット（`/agent`）」** を参照してください。

## 最短の起動（開発）

```powershell
cd frontend
npm install
# .env.local を用意（.env.local.example 参照）
npm run dev
```

- **従来チャット:** http://localhost:3000
- **Notion データ + OpenAI チャット:** http://localhost:3000/agent

## 技術スタック

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS

## 構成（抜粋）

| パス | 内容 |
|------|------|
| `app/page.tsx` | メイン（既存チャット） |
| `app/agent/page.tsx` | Notion 連携チャット |
| `app/api/agent-chat/route.ts` | Notion DB 取得 → OpenAI |
| `lib/notion-agent/` | Notion / OpenAI クライアント |
| `lib/api.ts` | 既存 FastAPI 用クライアント |
