"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type MenuCandidate = {
  pageId: string;
  name: string;
  recommendable: boolean;
};

/**
 * メニューDBから候補を検索して選ばせる入力欄。
 * 手入力のままでは商品名の表記がメニューDBとずれ、チャットボット側で
 * 商品を特定できないことがあるため、候補から選んだときだけ追加できる。
 */
function MenuProductPicker({
  label,
  notePlaceholder,
  onAdd,
}: {
  label: string;
  notePlaceholder: string;
  onAdd: (selected: MenuCandidate, note: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [candidates, setCandidates] = useState<MenuCandidate[]>([]);
  const [selected, setSelected] = useState<MenuCandidate | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (!term || (selected && selected.name === term)) {
      setCandidates([]);
      setSearched(false);
      return;
    }

    const currentRequest = ++requestId.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/chatbot-strategy/menu-search?q=${encodeURIComponent(term)}`,
        );
        const data = (await response.json()) as {
          ok?: boolean;
          candidates?: MenuCandidate[];
          message?: string;
        };
        if (currentRequest !== requestId.current) return;
        if (!data.ok) {
          setError(data.message || "商品の検索に失敗しました。");
          setCandidates([]);
        } else {
          setCandidates(data.candidates || []);
        }
        setSearched(true);
      } catch (err) {
        if (currentRequest !== requestId.current) return;
        setError(err instanceof Error ? err.message : "商品の検索に失敗しました。");
        setCandidates([]);
        setSearched(true);
      } finally {
        if (currentRequest === requestId.current) setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, selected]);

  async function add() {
    if (!selected || adding) return;
    setAdding(true);
    try {
      await onAdd(selected, note.trim());
      setQuery("");
      setNote("");
      setSelected(null);
      setCandidates([]);
      setSearched(false);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(null);
          }}
          placeholder={label}
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={notePlaceholder}
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={add}
          disabled={!selected || adding}
          className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 disabled:opacity-50"
        >
          {adding ? "追加中…" : "追加"}
        </button>
      </div>

      {searching && <p className="mt-1 text-xs text-slate-500">検索中…</p>}
      {error && <p className="mt-1 text-xs text-amber-700">{error}</p>}

      {selected && (
        <p className="mt-1 text-xs text-emerald-700">
          選択中: {selected.name}
          {!selected.recommendable && "（現在は品切れ扱いのため、おすすめには出ません）"}
        </p>
      )}

      {!selected && searched && !searching && candidates.length === 0 && !error && (
        <p className="mt-1 text-xs text-slate-500">候補がありません。</p>
      )}

      {!selected && candidates.length > 0 && (
        <ul className="mt-1 max-h-44 overflow-y-auto rounded border border-slate-200">
          {candidates.map((candidate) => (
            <li key={candidate.pageId}>
              <button
                type="button"
                onClick={() => {
                  setSelected(candidate);
                  setQuery(candidate.name);
                  setCandidates([]);
                }}
                className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-sm hover:bg-slate-50"
              >
                <span className="text-slate-700">{candidate.name}</span>
                {!candidate.recommendable && (
                  <span className="text-xs text-slate-400">品切れ</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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

type PinRow = {
  id: string;
  menuPageId: string | null;
  productName: string;
  note: string;
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
  const [pins, setPins] = useState<PinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [strategyResponse, exclusionResponse, pinResponse] = await Promise.all([
        fetch("/api/chatbot-strategy/run"),
        fetch("/api/chatbot-strategy/exclusions"),
        fetch("/api/chatbot-strategy/pins"),
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
      const pinData = (await pinResponse.json()) as { ok?: boolean; pins?: PinRow[] };
      if (strategyData.ok) {
        setMode(strategyData.mode || "off");
        setStrategies(strategyData.strategies || []);
      } else {
        setMessage(strategyData.message || "戦略の取得に失敗しました。");
      }
      if (exclusionData.ok) setExclusions(exclusionData.exclusions || []);
      if (pinData.ok) setPins(pinData.pins || []);
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

  async function addPin(selected: MenuCandidate, note: string) {
    try {
      const response = await fetch("/api/chatbot-strategy/pins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: selected.name,
          menuPageId: selected.pageId,
          note,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (!data.ok) {
        setMessage(data.message || "指定の追加に失敗しました。");
        return;
      }
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "指定の追加に失敗しました。");
    }
  }

  async function removePin(id: string) {
    try {
      const response = await fetch(`/api/chatbot-strategy/pins?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (!data.ok) {
        setMessage(data.message || "指定の削除に失敗しました。");
        return;
      }
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "指定の削除に失敗しました。");
    }
  }

  async function addExclusion(selected: MenuCandidate, reason: string) {
    try {
      const response = await fetch("/api/chatbot-strategy/exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: selected.name,
          menuPageId: selected.pageId,
          reason,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (!data.ok) {
        setMessage(data.message || "除外の追加に失敗しました。");
        return;
      }
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
        <h4 className="mb-1 text-sm font-medium text-slate-800">おすすめに出したい商品</h4>
        <p className="mb-2 text-xs text-slate-500">
          ここに入れた商品は、粗利や売れ行きの順位に関係なく優先しておすすめします。
          品切れ（在庫・提供・表示がOFF）の商品は、指定していても出しません。
        </p>
        {pins.length === 0 && (
          <p className="mb-2 text-xs text-slate-500">登録されていません。</p>
        )}
        <ul className="mb-2 space-y-1">
          {pins.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-700">
                {item.productName}
                {item.note && <span className="ml-2 text-xs text-slate-400">{item.note}</span>}
              </span>
              <button
                type="button"
                onClick={() => removePin(item.id)}
                className="text-xs text-slate-500 underline"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
        <MenuProductPicker
          label="商品名を入力して候補から選ぶ"
          notePlaceholder="メモ（任意）"
          onAdd={addPin}
        />

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
        <MenuProductPicker
          label="商品名を入力して候補から選ぶ"
          notePlaceholder="理由（任意）"
          onAdd={addExclusion}
        />
      </div>
    </section>
  );
}
