"use client";

import { useMemo, useState } from "react";
import type { ProductInsightsMonth } from "@/lib/marketing/product-insights";
import { formatCount, formatYen } from "@/lib/ootsuki";

interface ProductInsightsHistoryPanelProps {
  months: ProductInsightsMonth[];
}

export function ProductInsightsHistoryPanel({ months }: ProductInsightsHistoryPanelProps) {
  const [selectedMonth, setSelectedMonth] = useState(months[0]?.month ?? "");

  const selected = useMemo(
    () => months.find((month) => month.month === selectedMonth) ?? months[0],
    [months, selectedMonth],
  );

  if (months.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
        まだ商品別売上・原価データがありません。ABC分析DBに商品データを取り込むと、ここに粗利率ランキングと見直し候補が表示されます。
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {months.map((month) => (
          <button
            key={month.month}
            type="button"
            onClick={() => setSelectedMonth(month.month)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              selected?.month === month.month
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-900/10 bg-white text-stone-700 hover:bg-stone-100"
            }`}
          >
            {month.month}
          </button>
        ))}
      </div>

      {selected ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-4">
            <p className="text-sm font-semibold text-emerald-900">粗利率が高いおすすめ候補（{selected.month}）</p>
            <p className="mt-1 text-xs text-emerald-800">
              粗利率が高く、かつ一定数売れているメニュー。チャットボット・販促でのおすすめに使えます。
            </p>
            {selected.topMargin.length > 0 ? (
              <div className="mt-3 overflow-auto rounded-xl border border-emerald-900/10 bg-white">
                <table className="min-w-full text-xs">
                  <thead className="bg-emerald-50 text-emerald-800">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">商品名</th>
                      <th className="px-3 py-2 text-right font-medium">粗利率</th>
                      <th className="px-3 py-2 text-right font-medium">売価/原価</th>
                      <th className="px-3 py-2 text-right font-medium">販売実績</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.topMargin.map((item) => (
                      <tr key={item.name} className="border-t border-stone-900/5">
                        <td className="px-3 py-2 text-stone-800">{item.name}</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-700">{item.marginRate}%</td>
                        <td className="px-3 py-2 text-right text-stone-600">
                          {formatYen(item.avgPrice)} / {formatYen(item.estCost)}
                        </td>
                        <td className="px-3 py-2 text-right text-stone-600">{formatCount(item.salesQty)}件</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-xs text-stone-500">条件に合う商品がありませんでした。</p>
            )}
          </div>

          <div className="rounded-2xl border border-rose-200 bg-rose-50/60 px-4 py-4">
            <p className="text-sm font-semibold text-rose-900">見直し候補（死に筋、{selected.month}）</p>
            <p className="mt-1 text-xs text-rose-800">
              原価がかかっているのにほとんど売れていないメニュー。メニューカット・原価見直しの判断材料です。
            </p>
            {selected.deadStock.length > 0 ? (
              <div className="mt-3 overflow-auto rounded-xl border border-rose-900/10 bg-white">
                <table className="min-w-full text-xs">
                  <thead className="bg-rose-50 text-rose-800">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">商品名</th>
                      <th className="px-3 py-2 text-right font-medium">販売実績</th>
                      <th className="px-3 py-2 text-right font-medium">売価/原価</th>
                      <th className="px-3 py-2 text-right font-medium">粗利率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.deadStock.map((item) => (
                      <tr key={item.name} className="border-t border-stone-900/5">
                        <td className="px-3 py-2 text-stone-800">{item.name}</td>
                        <td className="px-3 py-2 text-right font-semibold text-rose-700">{formatCount(item.salesQty)}件</td>
                        <td className="px-3 py-2 text-right text-stone-600">
                          {formatYen(item.avgPrice)} / {formatYen(item.estCost)}
                        </td>
                        <td className="px-3 py-2 text-right text-stone-600">{item.marginRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-xs text-stone-500">該当する商品がありませんでした。</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
