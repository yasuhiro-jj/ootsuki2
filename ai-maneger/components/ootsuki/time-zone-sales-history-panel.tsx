"use client";

import { useMemo, useState } from "react";
import type { TimeZoneSalesMonth } from "@/lib/marketing/time-zone-sales-insights";
import { formatCount, formatYen } from "@/lib/ootsuki";

interface TimeZoneSalesHistoryPanelProps {
  months: TimeZoneSalesMonth[];
}

function formatValue(target: string, value: number) {
  return target === "客数" ? formatCount(value) : formatYen(value);
}

function sortedHourly(hourlyTotals: Array<{ hour: string; value: number }>) {
  return [...hourlyTotals].sort((left, right) => {
    const leftNum = Number(left.hour.match(/^(\d{1,2})/)?.[1] ?? "99");
    const rightNum = Number(right.hour.match(/^(\d{1,2})/)?.[1] ?? "99");
    return leftNum - rightNum;
  });
}

export function TimeZoneSalesHistoryPanel({ months }: TimeZoneSalesHistoryPanelProps) {
  const [selectedMonth, setSelectedMonth] = useState(months[0]?.month ?? "");

  const selected = useMemo(
    () => months.find((month) => month.month === selectedMonth) ?? months[0],
    [months, selectedMonth],
  );

  if (months.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
        まだ保存された時間帯別データがありません。上のUSEN/POSパネルでCSVを読み込み、「AI Managerの参照データとして保存」を押すとここに表示されます。
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
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            {selected.entries.map((entry, index) => (
              <div key={`${entry.target}-${entry.source}-${index}`} className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-stone-900">
                    {entry.target}（{entry.source}）
                  </p>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">{selected.month}</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-stone-900">{formatValue(entry.target, entry.total)}</p>
                <p className="mt-1 text-xs text-stone-500">ピーク時間帯: {entry.peakText}</p>
                {entry.hourlyTotals.length > 0 ? (
                  <div className="mt-3 overflow-auto rounded-xl border border-stone-900/5">
                    <table className="min-w-full text-xs">
                      <thead className="bg-stone-50 text-stone-500">
                        <tr>
                          {sortedHourly(entry.hourlyTotals).map((row) => (
                            <th key={row.hour} className="px-2 py-2 text-right font-medium">
                              {row.hour}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-stone-900/5">
                          {sortedHourly(entry.hourlyTotals).map((row) => (
                            <td key={row.hour} className="px-2 py-2 text-right text-stone-700">
                              {formatValue(entry.target, row.value)}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
