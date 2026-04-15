"use client";

import { useMemo, useState } from "react";
import {
  calculateAverageSpend,
  formatCount,
  formatPercentDelta,
  formatYen,
  isWeeklySummaryEntry,
} from "@/lib/ootsuki";
import type { KpiSnapshotEntry } from "@/types/ootsuki";

interface SalesOverviewPanelProps {
  entries: KpiSnapshotEntry[];
}

type DailyEntry = KpiSnapshotEntry & { date: string };

function isMonthlySummaryEntry(entry: KpiSnapshotEntry) {
  return entry.title.includes("月次売上");
}

function shiftYear(dateText: string, years: number) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `${year}年${month}月`;
}

function formatDateLabel(dateText: string) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return dateText;
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
}

function formatShortRange(start: string, end: string) {
  return `${start.slice(5).replace("-", "/")} - ${end.slice(5).replace("-", "/")}`;
}

export function SalesOverviewPanel({ entries }: SalesOverviewPanelProps) {
  const dailyEntries = useMemo(
    () =>
      entries
        .filter((entry): entry is DailyEntry => Boolean(entry.date))
        .sort((left, right) => left.date.localeCompare(right.date)),
    [entries],
  );

  const weeklySummaryEntries = useMemo(
    () =>
      entries
        .filter((entry) => !entry.date && isWeeklySummaryEntry(entry))
        .sort((left, right) => left.weekStart.localeCompare(right.weekStart)),
    [entries],
  );

  const monthlySummaryEntries = useMemo(
    () =>
      entries
        .filter((entry) => !entry.date && isMonthlySummaryEntry(entry))
        .sort((left, right) => left.weekStart.localeCompare(right.weekStart)),
    [entries],
  );

  const monthOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...dailyEntries.map((entry) => entry.date.slice(0, 7)),
          ...weeklySummaryEntries.map((entry) => entry.weekStart.slice(0, 7)).filter(Boolean),
          ...monthlySummaryEntries.map((entry) => entry.weekStart.slice(0, 7)).filter(Boolean),
        ]),
      )
        .sort((left, right) => right.localeCompare(left))
        .map((month) => ({ value: month, label: formatMonthLabel(month) })),
    [dailyEntries, monthlySummaryEntries, weeklySummaryEntries],
  );

  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]?.value ?? "");

  const monthEntries = useMemo(
    () => dailyEntries.filter((entry) => entry.date.startsWith(selectedMonth)),
    [dailyEntries, selectedMonth],
  );

  const selectedMonthlySummary = useMemo(
    () => monthlySummaryEntries.find((entry) => entry.weekStart.startsWith(selectedMonth)),
    [monthlySummaryEntries, selectedMonth],
  );

  const previousYearMonthSales = useMemo(() => {
    if (!selectedMonth) return 0;
    const previousMonthKey = `${String(Number(selectedMonth.slice(0, 4)) - 1)}${selectedMonth.slice(4)}`;
    const previousSummary = monthlySummaryEntries.find((entry) => entry.weekStart.startsWith(previousMonthKey));
    if (previousSummary) {
      return previousSummary.sales;
    }
    return dailyEntries
      .filter((entry) => entry.date.startsWith(previousMonthKey))
      .reduce((sum, entry) => sum + entry.sales, 0);
  }, [dailyEntries, monthlySummaryEntries, selectedMonth]);

  const monthlySales =
    selectedMonthlySummary?.sales ?? monthEntries.reduce((sum, entry) => sum + entry.sales, 0);

  const monthlyCustomers = useMemo(() => {
    if (selectedMonthlySummary) {
      return selectedMonthlySummary.customers;
    }
    return monthEntries.reduce((sum, entry) => sum + entry.customers, 0);
  }, [monthEntries, selectedMonthlySummary]);

  const monthlyAverageSpend = calculateAverageSpend(monthlySales, monthlyCustomers);

  const monthlyYoY =
    previousYearMonthSales > 0
      ? ((monthlySales - previousYearMonthSales) / previousYearMonthSales) * 100
      : undefined;

  const weeklyRows = useMemo(() => {
    const monthStart = `${selectedMonth}-01`;
    const nextMonthDate = new Date(`${monthStart}T00:00:00.000Z`);
    if (Number.isNaN(nextMonthDate.getTime())) return [];
    nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1);
    const monthEnd = new Date(nextMonthDate.getTime() - 86400000).toISOString().slice(0, 10);

    return weeklySummaryEntries
      .filter((entry) => entry.weekEnd >= monthStart && entry.weekStart <= monthEnd)
      .map((entry) => {
        const compareStart = shiftYear(entry.weekStart, -1);
        const compareEnd = shiftYear(entry.weekEnd, -1);
        const compareRow = weeklySummaryEntries.find(
          (item) => item.weekStart === compareStart && item.weekEnd === compareEnd,
        );
        const compareSales = compareRow?.sales ?? 0;
        const customers = entry.customers;
        const averageSpend = entry.averageSpend || calculateAverageSpend(entry.sales, customers);
        return {
          weekStart: entry.weekStart,
          weekEnd: entry.weekEnd,
          sales: entry.sales,
          customers,
          averageSpend,
          yoy:
            compareSales > 0 ? ((entry.sales - compareSales) / compareSales) * 100 : entry.salesYoY,
        };
      })
      .sort((left, right) => left.weekStart.localeCompare(right.weekStart));
  }, [selectedMonth, weeklySummaryEntries]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500">表示月</p>
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="mt-2 rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm outline-none"
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1 text-right">
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500">当月累計</p>
          <p className="text-2xl font-bold text-stone-900">{formatYen(monthlySales)}</p>
          <p className="text-sm text-stone-600">
            客数 {formatCount(monthlyCustomers)} / 客単価 {formatYen(monthlyAverageSpend)}
          </p>
          <p className="text-sm text-stone-500">昨対比 {formatPercentDelta(monthlyYoY)}</p>
        </div>
      </div>

      {selectedMonth ? (
        <>
          <div className="rounded-2xl border border-stone-900/10 bg-white">
            <div className="border-b border-stone-900/10 px-4 py-3">
              <p className="font-semibold text-stone-900">日次売上</p>
            </div>
            {monthEntries.length === 0 ? (
              <div className="px-4 py-4 text-sm text-stone-600">
                この月の日次売上データはまだありません。
              </div>
            ) : (
              <div className="max-h-[280px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-stone-50 text-stone-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">日付</th>
                      <th className="px-4 py-3 text-right font-medium">売上</th>
                      <th className="px-4 py-3 text-right font-medium">客数</th>
                      <th className="px-4 py-3 text-right font-medium">客単価</th>
                      <th className="px-4 py-3 text-right font-medium">昨対比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...monthEntries].reverse().map((entry) => (
                      <tr key={entry.id} className="border-t border-stone-900/5">
                        <td className="px-4 py-3 text-stone-700">{formatDateLabel(entry.date)}</td>
                        <td className="px-4 py-3 text-right font-medium text-stone-900">
                          {formatYen(entry.sales)}
                        </td>
                        <td className="px-4 py-3 text-right text-stone-700">
                          {formatCount(entry.customers)}
                        </td>
                        <td className="px-4 py-3 text-right text-stone-700">
                          {formatYen(
                            entry.averageSpend || calculateAverageSpend(entry.sales, entry.customers),
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-stone-600">
                          {formatPercentDelta(entry.salesYoY)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-stone-900/10 bg-white">
            <div className="border-b border-stone-900/10 px-4 py-3">
              <p className="font-semibold text-stone-900">週次売上</p>
            </div>
            {weeklyRows.length === 0 ? (
              <div className="px-4 py-4 text-sm text-stone-600">
                この月にかかる週次売上データはまだありません。
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-stone-50 text-stone-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">週</th>
                      <th className="px-4 py-3 text-right font-medium">売上</th>
                      <th className="px-4 py-3 text-right font-medium">客数</th>
                      <th className="px-4 py-3 text-right font-medium">客単価</th>
                      <th className="px-4 py-3 text-right font-medium">昨対比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyRows.map((row) => (
                      <tr key={`${row.weekStart}_${row.weekEnd}`} className="border-t border-stone-900/5">
                        <td className="px-4 py-3 text-stone-700">
                          {formatShortRange(row.weekStart, row.weekEnd)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-stone-900">
                          {formatYen(row.sales)}
                        </td>
                        <td className="px-4 py-3 text-right text-stone-700">
                          {formatCount(row.customers)}
                        </td>
                        <td className="px-4 py-3 text-right text-stone-700">
                          {formatYen(row.averageSpend)}
                        </td>
                        <td className="px-4 py-3 text-right text-stone-600">
                          {formatPercentDelta(row.yoy)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-4 text-sm text-stone-600">
          表示できる売上データがありません。
        </div>
      )}
    </div>
  );
}
