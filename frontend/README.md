# おおつきチャットボット - Next.js フロントエンド

## 起動手順

1. **バックエンドを起動**（プロジェクトルートで）
   ```bash
   conda activate campingrepare
   set PYTHONPATH=%CD%
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **フロントエンドを起動**（このフォルダで）
   ```bash
   npm install   # 初回のみ
   npm run dev
   ```

3. ブラウザで http://localhost:3000 にアクセス

## 技術スタック

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS

## 構成

- `app/page.tsx` - メインページ
- `components/ChatWindow.tsx` - チャットウィンドウ
- `components/MessageBubble.tsx` - メッセージ表示
- `components/ChatInput.tsx` - 入力欄
- `components/QuickReplyButtons.tsx` - クイックリプライ
- `lib/api.ts` - バックエンド API クライアント

## 環境変数

- `NEXT_PUBLIC_API_URL` - 未設定時は `/api/proxy` 経由でバックエンドにプロキシ
