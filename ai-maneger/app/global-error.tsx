"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-rose-200 bg-white p-8 shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-rose-700">Critical Error</p>
          <h1 className="mt-3 text-3xl font-bold">アプリ全体の表示に失敗しました</h1>
          <p className="mt-4 text-sm leading-7 text-stone-600">
            開発サーバーの再描画やデータ取得に失敗しています。再試行しても直らない場合は、`npm run dev`
            を再起動してください。
          </p>
          <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900">
            {error.message}
          </div>
          <button
            type="button"
            onClick={reset}
            className="mt-6 inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white"
          >
            再試行する
          </button>
        </div>
      </body>
    </html>
  );
}
