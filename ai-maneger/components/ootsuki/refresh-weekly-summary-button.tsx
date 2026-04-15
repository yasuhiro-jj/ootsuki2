"use client";

import { useCallback, useState } from "react";

interface RefreshWeeklySummaryButtonProps {
  weekStart: string;
  weekEnd: string;
}

export function RefreshWeeklySummaryButton({ weekStart, weekEnd }: RefreshWeeklySummaryButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleClick = useCallback(async () => {
    setStatus("loading");
    setMessage("APIを呼び出しています...");

    try {
      const res = await fetch("/api/weekly-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceDate: weekStart }),
      });

      let data: { ok?: boolean; message?: string };
      try {
        data = await res.json();
      } catch {
        setStatus("error");
        setMessage(`サーバーからの応答を解析できませんでした（HTTP ${res.status}）`);
        return;
      }

      if (!res.ok || !data.ok) {
        setStatus("error");
        setMessage(data.message || `週次集計の更新に失敗しました（HTTP ${res.status}）`);
        return;
      }

      setStatus("success");
      setMessage("週次集計を更新しました。ページを再読み込みします...");
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error
          ? `通信エラー: ${err.message}`
          : "通信エラーが発生しました。サーバーが起動しているか確認してください。",
      );
    }
  }, [weekStart]);

  const buttonLabel =
    status === "loading"
      ? "更新中..."
      : status === "success"
        ? "更新完了"
        : status === "error"
          ? "再試行"
          : "週次集計を再計算";

  const buttonStyle =
    status === "loading"
      ? "bg-amber-100 border-amber-300 text-amber-800"
      : status === "success"
        ? "bg-emerald-100 border-emerald-300 text-emerald-800"
        : status === "error"
          ? "bg-rose-100 border-rose-300 text-rose-800"
          : "bg-white border-stone-900/10 text-stone-900 hover:bg-stone-100 active:bg-stone-200";

  const actionUrl = `/api/weekly-summary-action?weekStart=${encodeURIComponent(weekStart)}`;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={status === "loading" || status === "success"}
          onClick={handleClick}
          className={`inline-flex w-fit rounded-full border px-5 py-3 text-sm font-medium transition-colors disabled:cursor-not-allowed ${buttonStyle}`}
        >
          {buttonLabel}
        </button>
        <a
          href={actionUrl}
          className="inline-flex w-fit rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100"
        >
          ボタンが反応しない場合はこちら
        </a>
      </div>
      <p className="text-xs text-stone-500">
        {weekStart} 〜 {weekEnd} の日次データから再集計します
      </p>
      {message ? (
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${
            status === "error"
              ? "border border-rose-200 bg-rose-50 text-rose-800"
              : status === "loading"
                ? "border border-amber-200 bg-amber-50 text-amber-800"
                : "border border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}
