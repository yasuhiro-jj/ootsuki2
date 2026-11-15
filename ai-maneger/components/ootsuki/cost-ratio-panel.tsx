"use client";

import { useEffect, useState } from "react";
import { formatCostRatioStatus } from "@/lib/cost-ratio";
import type { MonthlyCostRatio } from "@/types/ootsuki";

interface CostRatioPanelProps {
  ratios: MonthlyCostRatio[];
  configReady: boolean;
  tenant: string;
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `${year}年${month}月`;
}

function formatYen(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatPercentDelta(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}pt`;
}

export function CostRatioPanel({ ratios, configReady, tenant }: CostRatioPanelProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-4 text-sm text-stone-600">
        読み込み中...
      </div>
    );
  }

  if (!configReady) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
        <p className="font-semibold">環境変数の設定が必要です</p>
        <p className="mt-2">
          NOTION_PURCHASE_DB_ID を設定すると、仕入DBから原価率・粗利率を表示できます。
        </p>
      </div>
    );
  }

  if (ratios.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-4 text-sm text-stone-600">
        <p className="font-semibold">データがありません</p>
        <p className="mt-2">
          日次売上DBまたは仕入DBにデータを登録すると、月次の原価率・粗利率が表示されます。
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <p className="font-semibold">※税込ベースで比較</p>
        <p className="mt-1">
          売上は税抜×1.10で換算、仕入高は税込で集計しています。目標粗利率は62%です。
        </p>
      </div>

      {ratios.map((ratio) => {
        const status = formatCostRatioStatus(ratio);
        const bgColor =
          status === "good"
            ? "bg-emerald-50 border-emerald-200"
            : status === "watch"
              ? "bg-amber-50 border-amber-200"
              : status === "urgent"
                ? "bg-rose-50 border-rose-200"
                : "bg-stone-50 border-stone-200";

        const textColor =
          status === "good"
            ? "text-emerald-900"
            : status === "watch"
              ? "text-amber-900"
              : status === "urgent"
                ? "text-rose-900"
                : "text-stone-600";

        return (
          <div key={ratio.monthKey} className={`rounded-2xl border px-4 py-4 ${bgColor} ${textColor}`}>
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold">{formatMonthLabel(ratio.monthKey)}</p>
              {status !== "unavailable" && (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    status === "good"
                      ? "bg-emerald-200 text-emerald-900"
                      : status === "watch"
                        ? "bg-amber-200 text-amber-900"
                        : "bg-rose-200 text-rose-900"
                  }`}
                >
                  {status === "good" ? "目標達成" : status === "watch" ? "注意" : "要改善"}
                </span>
              )}
            </div>

            <div className="mt-4 grid gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">売上（税込）</span>
                <span className="font-semibold">
                  {ratio.dataStatus.salesAvailable ? formatYen(ratio.salesInclTax) : "未取得"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">仕入高（税込）</span>
                <span className="font-semibold">
                  {ratio.dataStatus.purchaseAvailable ? formatYen(ratio.purchaseAmountInclTax) : "未取得"}
                </span>
              </div>

              {ratio.dataStatus.salesAvailable && ratio.dataStatus.purchaseAvailable ? (
                <>
                  <div className="flex items-center justify-between border-t border-current/20 pt-3">
                    <span className="text-sm">原価率</span>
                    <span className="text-xl font-bold">{formatPercent(ratio.costRatio)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm">粗利率</span>
                    <span className="text-xl font-bold">{formatPercent(ratio.grossMarginRatio)}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span>目標との差</span>
                    <span className="font-semibold">{formatPercentDelta(ratio.vsTarget)}</span>
                  </div>

                  {typeof ratio.grossMarginRatioYoY === "number" && (
                    <div className="flex items-center justify-between text-sm">
                      <span>前年同月比</span>
                      <span className="font-semibold">{formatPercentDelta(ratio.grossMarginRatioYoY)}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-2 rounded-lg bg-white/50 px-3 py-2 text-sm">
                  売上または仕入高のデータがないため、原価率・粗利率を計算できません。
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
