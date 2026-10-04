"use client";

import { useCallback, useEffect, useState } from "react";

type StrategyProduct = {
  product_id: string;
  product_name: string;
  priority: number;
  reason: string;
  customer_reason: string;
  segment: string;
  gross_margin_rank: number;
  sales_qty_rank: number;
  candidate_count: number;
};

type StrategyRow = {
  strategyId: string;
  status: string;
  payload: { priority_products?: StrategyProduct[] };
  sourceSummary: Record<string, unknown>;
  validFrom: string;
  validUntil: string;
  createdAt: string;
};

type ExclusionRow = {
  id: string;
  menuPageId: string | null;
  productName: string | null;
  reason: string;
  createdAt: string;
};

const MODE_LABELS: Record<string, string> = {
  off: "停止中（チャットボットの応答は変わりません）",
  shadow: "検証中（生成のみ。応答は変わりません）",
  publish: "稼働中（チャットボットの応答に反映されます）",
};

function formatDateTime(value: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ja-JP");
}

export function ChatbotAutoStrategyPanel() {
  const [mode, setMode] = useState<string>("off");
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [exclusions, setExclusions] = useState<ExclusionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [newExclusionName, setNewExclusionName] = useState("");
  const [newExclusionReason, setNewExclusionReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [strategyResponse, exclusionResponse] = await Promise.all([
        fetch("/api/chatbot-strategy/run"),
        fetch("/api/chatbot-strategy/exclusions"),
      ]);
      const strategyData = (await strategyResponse.json()) as {
        ok?: boolean;
        mode?: string;
        strategies?: StrategyRow[];
        message?: string;
      };
      const exclusionData = (await exclusionResponse.json()) as {
        ok?: boolean;
        exclusions?: ExclusionRow[];
      };
      if (strategyData.ok) {
        setMode(strategyData.mode || "off");
        setStrategies(strategyData.strategies || []);
      } else {
        setMessage(strategyData.message || "戦略の取得に失敗しました。");
      }
      if (exclusionData.ok) setExclusions(exclusionData.exclusions || []);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runNow() {
    if (running) return;
    setRunning(true);
    setMessage(null);
    try {
      const response = await fetch("/api/chatbot-strategy/run", { method: "POST" });
      const data = (await response.json()) as {
        ok?: boolean;
        message?: string;
        result?: { reason?: string; productCount?: number; status?: string };
      };
      if (!data.ok) {
        setMessage(
          data.message || `生成できませんでした（理由: ${data.result?.reason || "不明"}）`,
        );
      } else {
        setMessage(
          `${data.result?.productCount ?? 0}件の商品で再計算しました（${data.result?.status}）。`,
        );
      }
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "再計算に失敗しました。");
    } finally {
      setRunning(false);
    }
  }

  async function addExclusion() {
    const name = newExclusionName.trim();
    if (!name) return;
    try {
      const response = await fetch("/api/chatbot-strategy/exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName: name, reason: newExclusionReason.trim() }),
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (!data.ok) {
        setMessage(data.message || "除外の追加に失敗しました。");
        return;
      }
      setNewExclusionName("");
      setNewExclusionReason("");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "除外の追加に失敗しました。");
    }
  }

  async function removeExclusion(id: string) {
    try {
      const response = await fetch(`/api/chatbot-strategy/exclusions?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (!data.ok) {
        setMessage(data.message || "除外の削除に失敗しました。");
        return;
      }
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "除外の削除に失敗しました。");
    }
  }

  const latest = strategies[0];
  const products = latest?.payload?.priority_products || [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">チャットボット自動おすすめ</h3>
          <p className="text-xs text-slate-500">
            粗利と売れ筋をもとに、チャットボットがすすめる商品を自動で決めます。
          </p>
        </div>
        <button
          type="button"
          onClick={runNow}
          disabled={running}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
        >
          {running ? "再計算中…" : "今すぐ再計算"}
        </button>
      </header>

      <p className="mb-3 text-sm">
        <span className="font-medium text-slate-700">状態：</span>
        <span className={mode === "publish" ? "text-emerald-700" : "text-slate-600"}>
          {MODE_LABELS[mode] || mode}
        </span>
      </p>

      {message && <p className="mb-3 text-sm text-amber-700">{message}</p>}
      {loading && <p className="text-sm text-slate-500">読み込み中…</p>}

      {!loading && !latest && (
        <p className="text-sm text-slate-500">まだ生成された戦略がありません。</p>
      )}

      {latest && (
        <div className="mb-4">
          <p className="mb-2 text-xs text-slate-500">
            最新: {latest.strategyId}（{latest.status}） / 有効期限 {formatDateTime(latest.validUntil)}
          </p>
          <ul className="space-y-2">
            {products.map((product) => (
              <li key={product.product_id} className="rounded border border-slate-200 p-2">
                <p className="text-sm font-medium text-slate-900">
                  {product.product_name}
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                    {product.segment}
                  </span>
                </p>
                <p className="text-xs text-slate-500">お客様向け: {product.customer_reason}</p>
                <p className="text-xs text-slate-400">根拠（社内用）: {product.reason}</p>
              </li>
            ))}
          </ul>
          {Object.keys(latest.sourceSummary || {}).length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-slate-500">集計の内訳</summary>
              <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-600">
                {JSON.stringify(latest.sourceSummary, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      <div className="border-t border-slate-200 pt-3">
        <h4 className="mb-2 text-sm font-medium text-slate-800">おすすめに出さない商品</h4>
        {exclusions.length === 0 && (
          <p className="mb-2 text-xs text-slate-500">登録されていません。</p>
        )}
        <ul className="mb-2 space-y-1">
          {exclusions.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-700">
                {item.productName || item.menuPageId}
                {item.reason && <span className="ml-2 text-xs text-slate-400">{item.reason}</span>}
              </span>
              <button
                type="button"
                onClick={() => removeExclusion(item.id)}
                className="text-xs text-slate-500 underline"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <input
            value={newExclusionName}
            onChange={(event) => setNewExclusionName(event.target.value)}
            placeholder="商品名"
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            value={newExclusionReason}
            onChange={(event) => setNewExclusionReason(event.target.value)}
            placeholder="理由（任意）"
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={addExclusion}
            className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700"
          >
            追加
          </button>
        </div>
      </div>
    </section>
  );
}
