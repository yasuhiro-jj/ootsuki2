"use client";

import { useMemo, useState } from "react";
import {
  parsePosTimeZoneMetricCsv,
  summarizePosTimeZoneMetric,
  type PosTimeZoneMetricSummary,
} from "@/lib/pos-time-zone-sales";
import { calculateAverageSpend, formatCount, formatYen } from "@/lib/ootsuki";
import type { AgentChatResponse } from "@/types/chat";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function formatHour(hourKey: string) {
  // "11-14" はそのまま表示。 "11:00" などは短くする
  if (/^\d{2}:\d{2}$/.test(hourKey)) return hourKey.replace(":00", "時");
  return hourKey;
}

async function readCsvFile(file: File) {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (!utf8.includes("\uFFFD")) return utf8;
  try {
    return new TextDecoder("shift_jis", { fatal: false }).decode(buffer);
  } catch {
    return utf8;
  }
}

function buildAdvicePrompt(params: {
  sales: PosTimeZoneMetricSummary;
  customers: PosTimeZoneMetricSummary;
  mergedHours: Array<{ hour: string; sales: number; customers: number; avgSpend: number }>;
}) {
  const lines = params.mergedHours
    .map((row) => {
      const custPart = row.customers > 0 ? `${row.customers.toFixed(0)}人` : "0人";
      const avgPart = row.customers > 0 ? `${formatYen(row.avgSpend)} / ${row.customers.toFixed(0)}人` : "—";
      return `- ${formatHour(row.hour)}: 売上 ${formatYen(row.sales)}, 客数 ${custPart}, 客単価 ${avgPart}`;
    })
    .join("\n");

  const peakByAvg = params.mergedHours
    .filter((r) => r.customers > 0)
    .sort((a, b) => b.avgSpend - a.avgSpend)[0];

  const peakBySales = [...params.mergedHours].sort((a, b) => b.sales - a.sales)[0];

  return [
    "POSレジの時間帯別（売上・客数）データを分析してください。",
    "※前提: 14時〜17時は休憩時間のため店売りなし（この時間帯の売上0・客数0は正常で、改善対象外）。",
    `全体 客単価（売上÷客数）: ${formatYen(calculateAverageSpend(params.sales.total, params.customers.total))}`,
    `ピーク（客単価）: ${peakByAvg ? `${formatHour(peakByAvg.hour)} ${formatYen(peakByAvg.avgSpend)}` : "判定不可"}`,
    `ピーク（売上）: ${peakBySales ? `${formatHour(peakBySales.hour)} ${formatYen(peakBySales.sales)}` : "判定不可"}`,
    "",
    "【時間帯別】",
    lines,
    "",
    "相談: 客単価を上げるために、どの時間帯を優先して、何を変えるべきか（メニュー/提供/導線/価格/販促/人員配置）を具体的に提案してください。14〜17時は休憩で営業していないため分析から除外すること。",
  ].join("\n");
}

export function PosTimeZoneSalesPanel() {
  const [salesFileName, setSalesFileName] = useState("");
  const [customersFileName, setCustomersFileName] = useState("");
  const [status, setStatus] = useState("POSレジの「時間帯別 売上CSV」と「時間帯別 客数CSV」をアップロードしてください。");

  const [salesSummary, setSalesSummary] = useState<PosTimeZoneMetricSummary | null>(null);
  const [customersSummary, setCustomersSummary] = useState<PosTimeZoneMetricSummary | null>(null);

  const [adviceQuestion, setAdviceQuestion] = useState("時間帯別に客単価が高いところ/低いところを整理し、改善案を提案してください。\n※14時〜17時は休憩中のため店売りなし（この時間帯の売上0は正常）。");
  const [advice, setAdvice] = useState("");
  const [adviceStatus, setAdviceStatus] = useState("");
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [savingToNotion, setSavingToNotion] = useState(false);
  const [notionSaveStatus, setNotionSaveStatus] = useState("");

  const merged = useMemo(() => {
    if (!salesSummary || !customersSummary) return null;

    const hours = Array.from(new Set([...salesSummary.hours, ...customersSummary.hours])).sort((a, b) => {
      const aNum = Number(a.match(/^(\d{1,2})/)?.[1] ?? "9999");
      const bNum = Number(b.match(/^(\d{1,2})/)?.[1] ?? "9999");
      return aNum - bNum;
    });

    const salesMap = new Map(salesSummary.hourlyTotals.map((r) => [r.hour, r.value]));
    const customersMap = new Map(customersSummary.hourlyTotals.map((r) => [r.hour, r.value]));

    const mergedHours = hours.map((hour) => {
      const sales = salesMap.get(hour) || 0;
      const customers = customersMap.get(hour) || 0;
      const avgSpend = calculateAverageSpend(sales, customers);
      return { hour, sales, customers, avgSpend };
    });

    const avgSpendTotal = calculateAverageSpend(salesSummary.total, customersSummary.total);
    const peakCandidates = mergedHours.filter((r) => r.customers > 0 && r.avgSpend > 0);
    const peakAvg = [...peakCandidates].sort((a, b) => b.avgSpend - a.avgSpend)[0];
    const worstAvg = peakCandidates.length > 1
      ? [...peakCandidates].sort((a, b) => a.avgSpend - b.avgSpend)[0]
      : undefined;
    const peakSales = [...mergedHours].sort((a, b) => b.sales - a.sales)[0];

    return {
      hours,
      mergedHours,
      avgSpendTotal,
      peakAvg,
      worstAvg,
      peakSales,
    };
  }, [salesSummary, customersSummary]);

  const dailyMergedRows = useMemo(() => {
    if (!salesSummary || !customersSummary) return [];

    const salesDailyRows = salesSummary.rows.filter((r) => r.rowType === "daily" && r.businessDate);
    const customersDailyRows = customersSummary.rows.filter((r) => r.rowType === "daily" && r.businessDate);

    const customersByDate = new Map<string, PosTimeZoneMetricSummary["rows"][number]>();
    for (const row of customersDailyRows) {
      if (row.businessDate) customersByDate.set(row.businessDate, row);
    }

    const hourSet = (a: Record<string, number>, b: Record<string, number>) => Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));

    return salesDailyRows
      .map((salesRow) => {
        const date = salesRow.businessDate!;
        const customersRow = customersByDate.get(date);
        if (!customersRow) return null;

        const salesTotal = salesRow.total;
        const customersTotal = customersRow.total;
        const avgSpend = calculateAverageSpend(salesTotal, customersTotal);

        const hours = hourSet(salesRow.hourlyValues, customersRow.hourlyValues).sort((a, b) => {
          const aNum = Number(a.match(/^(\d{1,2})/)?.[1] ?? "9999");
          const bNum = Number(b.match(/^(\d{1,2})/)?.[1] ?? "9999");
          return aNum - bNum;
        });

        let peakAvgHour: string | null = null;
        let peakAvgSpend = 0;
        for (const hour of hours) {
          const sales = salesRow.hourlyValues[hour] || 0;
          const customers = customersRow.hourlyValues[hour] || 0;
          if (customers <= 0) continue;
          const candidate = calculateAverageSpend(sales, customers);
          if (!peakAvgHour || candidate > peakAvgSpend) {
            peakAvgHour = hour;
            peakAvgSpend = candidate;
          }
        }

        // 参考: 売上ピーク時間帯（客単価ピークと別なので出しておく）
        const [peakSales] = Object.entries(salesRow.hourlyValues).sort((a, b) => b[1] - a[1]);
        return {
          label: salesRow.businessDateLabel,
          date,
          weekday: WEEKDAY_LABELS[new Date(`${date}T00:00:00.000Z`).getUTCDay()],
          salesTotal,
          customersTotal,
          avgSpend,
          peakAvgHour: peakAvgHour ?? "-",
          peakAvgSpend,
          peakSalesHour: peakSales?.[0] ?? "-",
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 12);
  }, [salesSummary, customersSummary]);

  async function handleFile(file: File, kind: "sales" | "customers") {
    setStatus("CSVを読み込んで解析しています...");

    const text = await readCsvFile(file);
    const rows = parsePosTimeZoneMetricCsv(text);
    if (rows.length === 0) {
      setStatus("時間帯別CSVとして読み取れませんでした。日付列と「11時」等の時間列があるか確認してください。");
      if (kind === "sales") setSalesSummary(null);
      if (kind === "customers") setCustomersSummary(null);
      return;
    }

    const summary =
      kind === "sales" ? summarizePosTimeZoneMetric(rows, "売上") : summarizePosTimeZoneMetric(rows, "客数");

    if (kind === "sales") {
      setSalesFileName(file.name);
      setSalesSummary(summary);
    } else {
      setCustomersFileName(file.name);
      setCustomersSummary(summary);
    }

    setStatus(`${file.name} を読み込みました。`);
  }

  async function requestAdvice() {
    if (!salesSummary || !customersSummary || !merged) return;
    setLoadingAdvice(true);
    setAdviceStatus("AIに分析を依頼しています...");
    setAdvice("");
    try {
      const response = await fetch("/api/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: buildAdvicePrompt({ sales: salesSummary, customers: customersSummary, mergedHours: merged.mergedHours }),
          agentName: "時間帯別売上・客単価アナリスト",
          agentRole: "POSレジの時間帯別（売上・客数）から客単価を分解し、現場改善に繋がる提案を返す。",
        }),
      });
      const data = (await response.json()) as AgentChatResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.ok ? "AI分析に失敗しました。" : data.message || "AI分析に失敗しました。");
      }
      setAdvice(data.reply);
      setAdviceStatus("AI分析が完了しました。");
    } catch (error) {
      setAdviceStatus(error instanceof Error ? error.message : "AI分析に失敗しました。");
    } finally {
      setLoadingAdvice(false);
    }
  }

  async function saveAdviceToNotion() {
    if (!advice.trim()) return;
    setSavingToNotion(true);
    setNotionSaveStatus("Notionに保存中...");
    try {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

      const lines = advice.split("\n").filter((l) => l.trim());
      const summaryText = lines.slice(0, 5).join("\n");
      const nextActionText = lines.slice(5).join("\n");

      const relatedNumbers = merged
        ? `売上合計: ${merged.mergedHours.reduce((s, h) => s + h.sales, 0).toLocaleString()}円 / 客数合計: ${merged.mergedHours.reduce((s, h) => s + h.customers, 0).toLocaleString()}人 / 平均客単価: ${Math.round(merged.avgSpendTotal).toLocaleString()}円`
        : "";

      const response = await fetch("/api/decision-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${today} POS時間帯別分析AI`,
          status: "進行中",
          summary: summaryText,
          relatedNumbers,
          nextAction: nextActionText,
        }),
      });
      const data = await response.json() as { ok: boolean; message?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "保存に失敗しました。");
      }
      setNotionSaveStatus("Notionに保存しました ✓");
    } catch (error) {
      setNotionSaveStatus(error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setSavingToNotion(false);
    }
  }

  const weekdayMergedRows = useMemo(() => {
    if (!salesSummary || !customersSummary) return [];

    // 曜日ごとの「客単価ピーク」は、曜日ごとの時間帯売上/客数合算から算出する
    const makeWeekdayHourlyTotals = (summary: PosTimeZoneMetricSummary) => {
      const map = new Map<string, Map<string, number>>(); // weekday -> (hour -> value)
      const dailyRows = summary.rows.filter((r) => r.rowType === "daily");
      for (const row of dailyRows) {
        const weekday = row.businessDate ? WEEKDAY_LABELS[new Date(`${row.businessDate}T00:00:00.000Z`).getUTCDay()] : "-";
        if (!map.has(weekday)) map.set(weekday, new Map());
        const hourMap = map.get(weekday)!;
        for (const [hour, value] of Object.entries(row.hourlyValues)) {
          hourMap.set(hour, (hourMap.get(hour) || 0) + value);
        }
      }
      return map;
    };

    const salesHourlyByWeekday = makeWeekdayHourlyTotals(salesSummary);
    const customersHourlyByWeekday = makeWeekdayHourlyTotals(customersSummary);

    return WEEKDAY_LABELS.map((weekday) => {
      const salesRowsForWeekday = salesSummary.dailyAnalysisRows.filter((r) => r.weekday === weekday);
      const customersRowsForWeekday = customersSummary.dailyAnalysisRows.filter((r) => r.weekday === weekday);
      const salesTotal = salesRowsForWeekday.reduce((sum, r) => sum + r.total, 0);
      const customersTotal = customersRowsForWeekday.reduce((sum, r) => sum + r.total, 0);
      const avgSpend = calculateAverageSpend(salesTotal, customersTotal);

      const salesHourMap = salesHourlyByWeekday.get(weekday) || new Map<string, number>();
      const customersHourMap = customersHourlyByWeekday.get(weekday) || new Map<string, number>();
      const hours = Array.from(new Set([...salesHourMap.keys(), ...customersHourMap.keys()])).sort((a, b) => {
        const aNum = Number(a.match(/^(\d{1,2})/)?.[1] ?? "9999");
        const bNum = Number(b.match(/^(\d{1,2})/)?.[1] ?? "9999");
        return aNum - bNum;
      });

      const peakAvg = hours
        .map((hour) => {
          const sales = salesHourMap.get(hour) || 0;
          const customers = customersHourMap.get(hour) || 0;
          const avgSpend = calculateAverageSpend(sales, customers);
          return { hour, avgSpend };
        })
        .sort((a, b) => b.avgSpend - a.avgSpend)[0];

      return {
        weekday,
        days: Math.max(salesSummary.dailyCount, customersSummary.dailyCount) === 0 ? 0 : salesRowsForWeekday.length,
        salesTotal,
        customersTotal,
        avgSpend,
        peakAvgHour: peakAvg?.hour ?? "-",
        peakAvgSpend: peakAvg?.avgSpend ?? 0,
      };
    }).filter((row) => row.days > 0);
  }, [salesSummary, customersSummary]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-4">
        <label className="grid gap-2 text-sm text-stone-700">
          <span className="font-medium text-stone-900">POS時間帯別 売上CSV</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="rounded-xl border border-stone-200 bg-white px-3 py-2"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) await handleFile(file, "sales");
            }}
          />
        </label>
        <label className="grid gap-2 text-sm text-stone-700">
          <span className="font-medium text-stone-900">POS時間帯別 客数CSV</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="rounded-xl border border-stone-200 bg-white px-3 py-2"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) await handleFile(file, "customers");
            }}
          />
        </label>
        <p className="text-sm leading-6 text-stone-600">{status}</p>
        {salesFileName ? <p className="text-xs text-stone-400">{salesFileName}</p> : null}
        {customersFileName ? <p className="text-xs text-stone-400">{customersFileName}</p> : null}
      </div>

      {merged && salesSummary && customersSummary ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">対象</p>
              <p className="mt-2 text-lg font-semibold text-stone-900">POS時間帯別</p>
              <p className="mt-1 text-sm text-stone-500">日別 {salesSummary.dailyCount}日</p>
            </div>
            <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">合計</p>
              <p className="mt-2 text-2xl font-bold text-stone-900">{formatYen(salesSummary.total)}</p>
              <p className="mt-1 text-sm text-stone-500">客数 {formatCount(customersSummary.total)}</p>
              <p className="mt-1 text-sm font-medium text-stone-700">客単価 {formatYen(merged.avgSpendTotal)}</p>
            </div>
            <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">ピーク（客単価）</p>
              <p className="mt-2 text-lg font-semibold text-stone-900">
                {merged.peakAvg ? `${formatHour(merged.peakAvg.hour)} ${formatYen(merged.peakAvg.avgSpend)}` : "-"}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">ワースト（客単価）</p>
              <p className="mt-2 text-lg font-semibold text-stone-900">
                {merged.worstAvg ? `${formatHour(merged.worstAvg.hour)} ${formatYen(merged.worstAvg.avgSpend)}` : "—"}
              </p>
            </div>
          </div>

          <div className="overflow-auto rounded-2xl border border-stone-900/10 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-50 text-stone-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">時間帯</th>
                  <th className="px-4 py-3 text-right font-medium">売上合計</th>
                  <th className="px-4 py-3 text-right font-medium">客数合計</th>
                  <th className="px-4 py-3 text-right font-medium">客単価</th>
                </tr>
              </thead>
              <tbody>
                {merged.mergedHours.map((row) => (
                  <tr key={row.hour} className="border-t border-stone-900/5">
                    <td className="px-4 py-3 text-stone-700">{formatHour(row.hour)}</td>
                    <td className="px-4 py-3 text-right font-medium text-stone-900">{formatYen(row.sales)}</td>
                    <td className="px-4 py-3 text-right text-stone-700">{formatCount(row.customers)}</td>
                    <td className="px-4 py-3 text-right text-stone-700">{row.customers > 0 ? formatYen(row.avgSpend) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-auto rounded-2xl border border-stone-900/10 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-50 text-stone-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">曜日</th>
                  <th className="px-4 py-3 text-right font-medium">営業日数</th>
                  <th className="px-4 py-3 text-right font-medium">売上合計</th>
                  <th className="px-4 py-3 text-right font-medium">客数合計</th>
                  <th className="px-4 py-3 text-right font-medium">客単価</th>
                  <th className="px-4 py-3 text-right font-medium">客単価ピーク</th>
                </tr>
              </thead>
              <tbody>
                {weekdayMergedRows.map((row) => (
                  <tr key={row.weekday} className="border-t border-stone-900/5">
                    <td className="px-4 py-3 text-stone-700">{row.weekday}曜</td>
                    <td className="px-4 py-3 text-right text-stone-700">{row.days}</td>
                    <td className="px-4 py-3 text-right font-medium text-stone-900">{formatYen(row.salesTotal)}</td>
                    <td className="px-4 py-3 text-right text-stone-700">{formatCount(row.customersTotal)}</td>
                    <td className="px-4 py-3 text-right text-stone-700">{row.customersTotal > 0 ? formatYen(row.avgSpend) : "—"}</td>
                    <td className="px-4 py-3 text-right text-stone-700">
                      {row.peakAvgHour && row.customersTotal > 0 ? `${formatHour(row.peakAvgHour)} ${formatYen(row.peakAvgSpend)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-auto rounded-2xl border border-stone-900/10 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-50 text-stone-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">営業日</th>
                  <th className="px-4 py-3 text-left font-medium">曜日</th>
                  <th className="px-4 py-3 text-right font-medium">売上</th>
                  <th className="px-4 py-3 text-right font-medium">客数</th>
                  <th className="px-4 py-3 text-right font-medium">客単価</th>
                  <th className="px-4 py-3 text-right font-medium">客単価ピーク</th>
                </tr>
              </thead>
              <tbody>
                {dailyMergedRows.map((row) => (
                  <tr key={row.date} className="border-t border-stone-900/5">
                    <td className="px-4 py-3 text-stone-700">{row.label}</td>
                    <td className="px-4 py-3 text-stone-700">{row.weekday}曜</td>
                    <td className="px-4 py-3 text-right font-medium text-stone-900">{formatYen(row.salesTotal)}</td>
                    <td className="px-4 py-3 text-right text-stone-700">{formatCount(row.customersTotal)}</td>
                    <td className="px-4 py-3 text-right text-stone-700">
                      {row.customersTotal > 0 ? formatYen(row.avgSpend) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-stone-700">
                      {row.customersTotal > 0 ? `${formatHour(row.peakAvgHour)} ${formatYen(row.peakAvgSpend)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-4">
            <label className="grid gap-2 text-sm text-stone-700">
              <span className="font-medium text-stone-900">AIに時間帯別データの相談をする</span>
              <textarea
                value={adviceQuestion}
                onChange={(event) => setAdviceQuestion(event.target.value)}
                rows={4}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 leading-6 outline-none focus:border-stone-400"
              />
            </label>
            <button
              type="button"
              onClick={requestAdvice}
              disabled={loadingAdvice}
              className="mt-3 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
            >
              {loadingAdvice ? "分析中..." : "AIにアドバイスをもらう"}
            </button>
            {adviceStatus ? <p className="mt-3 text-sm text-stone-600">{adviceStatus}</p> : null}
            {advice ? (
              <div className="mt-4 whitespace-pre-line rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm leading-7 text-stone-800">
                {advice}
              </div>
            ) : null}
            {advice ? (
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={saveAdviceToNotion}
                  disabled={savingToNotion}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {savingToNotion ? "保存中..." : "Notionに保存"}
                </button>
                {notionSaveStatus ? <span className="text-sm text-stone-600">{notionSaveStatus}</span> : null}
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          売上CSVと客数CSVの両方が読み込まれると、時間帯別の客単価まで表示できます。
        </div>
      )}
    </div>
  );
}

