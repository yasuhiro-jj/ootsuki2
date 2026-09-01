"use client";

import { useMemo, useState } from "react";
import {
  parseUsenTimeZoneSalesCsv,
  summarizeUsenTimeZoneSales,
  type UsenTimeZoneSalesRow,
  type UsenTimeZoneSalesSummary,
} from "@/lib/usen-time-zone-sales";
import { formatYen } from "@/lib/ootsuki";
import type { AgentChatResponse } from "@/types/chat";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

type DailyAnalysisRow = {
  label: string;
  date?: string;
  weekday: string;
  total: number;
  peakHour: string;
  peakValue: number;
};

type WeekdayAnalysisRow = {
  weekday: string;
  total: number;
  average: number;
  days: number;
  peakHour: string;
  peakValue: number;
};

function formatValue(value: number, target: string) {
  if (/金額|売上|注文金額/.test(target)) return formatYen(value);
  return Math.round(value).toLocaleString("ja-JP");
}

function getWeekday(dateText?: string) {
  if (!dateText) return "-";
  const date = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return WEEKDAY_LABELS[date.getUTCDay()];
}

function getPeakFromHourly(hourlySales: Record<string, number>) {
  const [peak] = Object.entries(hourlySales).sort((left, right) => right[1] - left[1]);
  return {
    peakHour: peak?.[0] ?? "-",
    peakValue: peak?.[1] ?? 0,
  };
}

function buildDailyAnalysis(rows: UsenTimeZoneSalesRow[]): DailyAnalysisRow[] {
  return rows
    .filter((row) => row.rowType === "daily")
    .map((row) => {
      const peak = getPeakFromHourly(row.hourlySales);
      return {
        label: row.businessDateLabel,
        date: row.businessDate,
        weekday: getWeekday(row.businessDate),
        total: row.total,
        ...peak,
      };
    })
    .sort((left, right) => (left.date || "").localeCompare(right.date || ""));
}

function buildWeekdayAnalysis(rows: UsenTimeZoneSalesRow[]): WeekdayAnalysisRow[] {
  const dailyRows = rows.filter((row) => row.rowType === "daily");
  return WEEKDAY_LABELS.map((weekday) => {
    const rowsForDay = dailyRows.filter((row) => getWeekday(row.businessDate) === weekday);
    const hourlyTotals = new Map<string, number>();
    let total = 0;
    for (const row of rowsForDay) {
      total += row.total;
      for (const [hour, value] of Object.entries(row.hourlySales)) {
        hourlyTotals.set(hour, (hourlyTotals.get(hour) || 0) + value);
      }
    }
    const [peak] = [...hourlyTotals.entries()].sort((left, right) => right[1] - left[1]);
    return {
      weekday,
      total,
      average: rowsForDay.length > 0 ? total / rowsForDay.length : 0,
      days: rowsForDay.length,
      peakHour: peak?.[0] ?? "-",
      peakValue: peak?.[1] ?? 0,
    };
  }).filter((row) => row.days > 0);
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

function buildInsight(summary: UsenTimeZoneSalesSummary) {
  if (summary.peakHours.length === 0) return "時間帯別のピークを判定できませんでした。";
  const peaks = summary.peakHours
    .map((item) => `${item.hour} ${formatValue(item.value, summary.target)}`)
    .join(" / ");
  return `ピーク時間帯: ${peaks}`;
}

function buildAdvicePrompt(params: {
  summary: UsenTimeZoneSalesSummary;
  dailyRows: DailyAnalysisRow[];
  weekdayRows: WeekdayAnalysisRow[];
  question: string;
}) {
  const topDays = [...params.dailyRows].sort((left, right) => right.total - left.total).slice(0, 5);
  const weekdayLines = params.weekdayRows
    .map(
      (row) =>
        `${row.weekday}曜: 合計 ${formatValue(row.total, params.summary.target)}, 平均 ${formatValue(
          row.average,
          params.summary.target,
        )}, ピーク ${row.peakHour} ${formatValue(row.peakValue, params.summary.target)}`,
    )
    .join("\n");
  const topDayLines = topDays
    .map(
      (row) =>
        `${row.label}: 合計 ${formatValue(row.total, params.summary.target)}, ピーク ${row.peakHour} ${formatValue(
          row.peakValue,
          params.summary.target,
        )}`,
    )
    .join("\n");
  const hourlyLines = params.summary.hourlyTotals
    .map((row) => `${row.hour}: ${formatValue(row.value, params.summary.target)}`)
    .join("\n");

  return [
    "USENレジの時間帯別売上CSVを分析してください。",
    `集計対象: ${params.summary.target}`,
    `合計: ${formatValue(params.summary.total, params.summary.target)}`,
    `日別データ数: ${params.summary.dailyCount}日`,
    "",
    "【時間帯別合計】",
    hourlyLines,
    "",
    "【曜日別】",
    weekdayLines,
    "",
    "【売上上位日】",
    topDayLines,
    "",
    "【相談内容】",
    params.question || "ピーク時間帯、曜日差、仕込み・人員配置・販促の改善点を具体的に提案してください。",
  ].join("\n");
}

export function UsenTimeZoneSalesPanel() {
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("USENレジの「注文客数の時間別推移」CSVをアップロードしてください。");
  const [summary, setSummary] = useState<UsenTimeZoneSalesSummary | null>(null);
  const [adviceQuestion, setAdviceQuestion] = useState(
    "曜日別・時間帯別に見て、仕込み、人員配置、LINE配信、メニュー訴求で改善できることを教えてください。",
  );
  const [advice, setAdvice] = useState("");
  const [adviceStatus, setAdviceStatus] = useState("");
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [savingSummary, setSavingSummary] = useState(false);
  const [saveSummaryStatus, setSaveSummaryStatus] = useState("");

  const dailyAnalysisRows = useMemo(
    () => (summary ? buildDailyAnalysis(summary.rows) : []),
    [summary],
  );
  const weekdayAnalysisRows = useMemo(
    () => (summary ? buildWeekdayAnalysis(summary.rows) : []),
    [summary],
  );

  async function handleFile(file: File) {
    setFileName(file.name);
    setStatus("CSVを読み込んでいます...");
    setAdvice("");
    const text = await readCsvFile(file);
    const rows = parseUsenTimeZoneSalesCsv(text);
    if (rows.length === 0) {
      setSummary(null);
      setStatus("時間帯別売上CSVとして読み取れませんでした。営業日と「11時」などの時間列があるか確認してください。");
      return;
    }
    const parsedSummary = summarizeUsenTimeZoneSales(rows);
    setSummary(parsedSummary);
    setStatus(`${rows.length}行を読み込みました。${buildInsight(parsedSummary)}`);
  }

  async function saveSummaryToAiManager() {
    if (!summary) return;
    setSavingSummary(true);
    setSaveSummaryStatus("AI Managerに保存しています...");
    try {
      const target = /金額|売上/.test(summary.target) ? "売上" : "客数";
      const response = await fetch("/api/time-zone-sales/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          source: "USEN",
          total: summary.total,
          hourlyTotals: summary.hourlyTotals,
          peakHours: summary.peakHours,
        }),
      });
      const data = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "保存に失敗しました。");
      }
      setSaveSummaryStatus("AI Managerに保存しました。今後のマーケ施策生成の参考データになります。");
    } catch (error) {
      setSaveSummaryStatus(error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setSavingSummary(false);
    }
  }

  async function requestAdvice() {
    if (!summary) return;
    setLoadingAdvice(true);
    setAdviceStatus("AIに分析を依頼しています...");
    setAdvice("");
    try {
      const response = await fetch("/api/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: buildAdvicePrompt({
            summary,
            dailyRows: dailyAnalysisRows,
            weekdayRows: weekdayAnalysisRows,
            question: adviceQuestion.trim(),
          }),
          agentName: "時間帯別売上アナリスト",
          agentRole: "USENレジの時間帯別・曜日別データから、飲食店の現場改善案を具体化する。",
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

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-4">
        <label className="grid gap-2 text-sm text-stone-700">
          <span className="font-medium text-stone-900">USEN時間帯別CSV</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="rounded-xl border border-stone-200 bg-white px-3 py-2"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) await handleFile(file);
            }}
          />
        </label>
        <p className="mt-3 text-sm leading-6 text-stone-600">{status}</p>
        {fileName ? <p className="mt-1 text-xs text-stone-400">{fileName}</p> : null}
      </div>

      {summary ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">対象</p>
              <p className="mt-2 text-lg font-semibold text-stone-900">{summary.target}</p>
              <p className="mt-1 text-sm text-stone-500">日別 {summary.dailyCount}日</p>
            </div>
            <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">合計</p>
              <p className="mt-2 text-2xl font-bold text-stone-900">
                {formatValue(summary.total, summary.target)}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">ピーク</p>
              <p className="mt-2 text-lg font-semibold text-stone-900">
                {summary.peakHours[0]
                  ? `${summary.peakHours[0].hour} ${formatValue(summary.peakHours[0].value, summary.target)}`
                  : "-"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
            <button
              type="button"
              onClick={saveSummaryToAiManager}
              disabled={savingSummary}
              className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-medium text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingSummary ? "保存中..." : "この集計をAI Managerの参照データとして保存"}
            </button>
            <p className="text-xs text-violet-800">
              保存すると、マーケ施策司令塔のAI施策生成でピーク時間帯を根拠に使えるようになります。
            </p>
          </div>
          {saveSummaryStatus ? <p className="text-xs text-stone-600">{saveSummaryStatus}</p> : null}

          <div className="overflow-auto rounded-2xl border border-stone-900/10 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-50 text-stone-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">時間帯</th>
                  <th className="px-4 py-3 text-right font-medium">合計</th>
                </tr>
              </thead>
              <tbody>
                {summary.hourlyTotals.map((row) => (
                  <tr key={row.hour} className="border-t border-stone-900/5">
                    <td className="px-4 py-3 text-stone-700">{row.hour}</td>
                    <td className="px-4 py-3 text-right font-medium text-stone-900">
                      {formatValue(row.value, summary.target)}
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
                  <th className="px-4 py-3 text-left font-medium">曜日</th>
                  <th className="px-4 py-3 text-right font-medium">営業日数</th>
                  <th className="px-4 py-3 text-right font-medium">合計</th>
                  <th className="px-4 py-3 text-right font-medium">日平均</th>
                  <th className="px-4 py-3 text-right font-medium">ピーク</th>
                </tr>
              </thead>
              <tbody>
                {weekdayAnalysisRows.map((row) => (
                  <tr key={row.weekday} className="border-t border-stone-900/5">
                    <td className="px-4 py-3 text-stone-700">{row.weekday}曜</td>
                    <td className="px-4 py-3 text-right text-stone-700">{row.days}</td>
                    <td className="px-4 py-3 text-right font-medium text-stone-900">
                      {formatValue(row.total, summary.target)}
                    </td>
                    <td className="px-4 py-3 text-right text-stone-700">
                      {formatValue(row.average, summary.target)}
                    </td>
                    <td className="px-4 py-3 text-right text-stone-700">
                      {row.peakHour} {formatValue(row.peakValue, summary.target)}
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
                  <th className="px-4 py-3 text-right font-medium">合計</th>
                  <th className="px-4 py-3 text-right font-medium">ピーク</th>
                </tr>
              </thead>
              <tbody>
                {[...dailyAnalysisRows].reverse().map((row) => (
                  <tr key={`${row.label}-${row.total}`} className="border-t border-stone-900/5">
                    <td className="px-4 py-3 text-stone-700">{row.label}</td>
                    <td className="px-4 py-3 text-stone-700">{row.weekday}曜</td>
                    <td className="px-4 py-3 text-right font-medium text-stone-900">
                      {formatValue(row.total, summary.target)}
                    </td>
                    <td className="px-4 py-3 text-right text-stone-700">
                      {row.peakHour} {formatValue(row.peakValue, summary.target)}
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
          </div>
        </>
      ) : null}
    </div>
  );
}
