"use client";

import { useState, type FormEvent } from "react";

type DigestGeneratorPanelProps = {
  defaultPeriodStart: string;
  defaultPeriodEnd: string;
  currentTenantLabel: string;
};

type ApiSuccess = {
  ok: true;
  digestId: string;
  sourceCount: number;
  summary: string;
  periodStart?: string;
  periodEnd?: string;
  digestType?: string;
};

type ApiErrorBody = {
  ok: false;
  message?: string;
};

export function MemoryDigestPanel({
  defaultPeriodStart,
  defaultPeriodEnd,
  currentTenantLabel,
}: DigestGeneratorPanelProps) {
  const [periodStart, setPeriodStart] = useState(defaultPeriodStart);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEnd);
  const [digestType, setDigestType] = useState("weekly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ApiSuccess | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/admin/generate-digest", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodStart, periodEnd, digestType }),
      });
      const data = (await res.json()) as ApiSuccess | ApiErrorBody;

      if (!res.ok || !data.ok) {
        let msg = `リクエストに失敗しました (${res.status})`;
        const eb = data as ApiErrorBody;
        if (typeof eb.message === "string" && eb.message.trim()) {
          msg = eb.message.trim();
        }
        setError(msg);
        return;
      }

      setSuccess(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-7 text-stone-600">
        現在のログイン tenant（<span className="font-medium text-stone-800">{currentTenantLabel}</span>
        ）の会話ログを期間指定で要約し、記憶ダイジェストとして保存します。チャットの RAG で自動参照されます。
      </p>

      <form onSubmit={handleSubmit} className="grid gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="text-sm text-stone-700">
          <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-stone-500">開始日</span>
          <input
            type="date"
            required
            value={periodStart}
            onChange={(ev) => setPeriodStart(ev.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
          />
        </label>
        <label className="text-sm text-stone-700">
          <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-stone-500">終了日</span>
          <input
            type="date"
            required
            value={periodEnd}
            onChange={(ev) => setPeriodEnd(ev.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
          />
        </label>
        <label className="text-sm text-stone-700 md:col-span-1">
          <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-stone-500">タイプ</span>
          <select
            value={digestType}
            onChange={(ev) => setDigestType(ev.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 md:w-auto md:min-w-[140px]"
          >
            <option value="weekly">weekly</option>
            <option value="monthly">monthly</option>
          </select>
        </label>
        <div className="md:col-span-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "生成中…" : "ダイジェストを生成"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      ) : null}

      {success ? (
        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <p className="font-medium">
            保存しました（{success.sourceCount} 件の会話を要約）— digestId:{" "}
            <span className="break-all font-mono text-xs">{success.digestId}</span>
          </p>
          <details className="rounded-lg border border-emerald-100 bg-white/80 p-3">
            <summary className="cursor-pointer text-xs font-medium text-emerald-900">サマリー全文を表示</summary>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-stone-800">
              {success.summary}
            </pre>
          </details>
        </div>
      ) : null}

      <p className="text-xs leading-relaxed text-stone-500">
        直近で完了した UTC 週（月〜日）をデフォルト表示しています。Vercel Cron の週次ジョブと同じ期間ロジックです（「前の週」の Mon–Sun）。
      </p>
    </div>
  );
}
