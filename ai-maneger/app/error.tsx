"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900">
      <div className="mx-auto max-w-3xl rounded-[28px] border border-rose-200 bg-white p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.3em] text-rose-700">Application Error</p>
        <h1 className="mt-3 text-3xl font-bold">画面の表示に失敗しました</h1>
        <p className="mt-4 text-sm leading-7 text-stone-600">
          Notion 連携または画面描画で問題が発生しました。もう一度読み込み直すか、再試行してください。
        </p>
        <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900">
          {error.message}
        </div>
      </div>
      <button
        type="button"
        onClick={reset}
        className="mx-auto mt-6 inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white"
      >
        再試行する
      </button>
    </div>
  );
}
