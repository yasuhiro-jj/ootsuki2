import {
  getPropertyDate,
  getPropertyNumber,
  queryDatabaseAll,
} from "@/lib/notion/client";
import { formatCount, formatPercentDelta, formatYen } from "@/lib/ootsuki";
import type { NotionPage } from "@/types/notion";
import type { KpiSnapshotEntry } from "@/types/ootsuki";

import { PRIMARY_DAILY_SALES_DB_ID } from "@/lib/notion/sales-monthly-context";

const DATE_KEYS = ["日付", "Date"];
const SALES_KEYS = ["売上", "売上高", "Sales", "売上(税抜)"];
const CUSTOMERS_KEYS = ["客数", "Customers"];
const AVERAGE_SPEND_KEYS = ["客単価", "Average Spend", "客単価(自動)"];
const SALES_YOY_KEYS = ["売上昨対比", "前年差異", "売上前年差異", "差前年差異", "Sales YoY", "売上前年比(%)"];
const CUSTOMERS_YOY_KEYS = ["客数昨対比", "前年差客", "客数前年差", "差前年差客", "Customers YoY", "客数前年比(%)"];
const AVERAGE_SPEND_YOY_KEYS = ["客単価昨対比", "客単価前年差", "前差客単", "Average Spend YoY", "客単価前年比(%)"];
const PREVIOUS_SALES_KEYS = ["前年売上", "前年実績", "Previous Sales"];
const PREVIOUS_CUSTOMERS_KEYS = ["前年客数", "Previous Customers"];
const PREVIOUS_AVERAGE_SPEND_KEYS = ["前年客単", "前年客単価", "Previous Average Spend"];

export type DailyYoYRow = {
  date: string;
  sales: number;
  customers: number;
  averageSpend: number;
  previousSales?: number;
  previousCustomers?: number;
  previousAverageSpend?: number;
  salesYoY?: number;
  customersYoY?: number;
  averageSpendYoY?: number;
};

export type YoYReportSection = "full" | "sales" | "average_spend" | "price_band" | "difference";

function resolveYoY(current: number, previous: number | undefined, stored: number | undefined) {
  if (typeof stored === "number" && Number.isFinite(stored)) return stored;
  if (typeof previous === "number" && previous > 0) {
    return ((current - previous) / previous) * 100;
  }
  return undefined;
}

function resolveRatioPercent(current: number, previous: number | undefined, stored: number | undefined) {
  const yoy = resolveYoY(current, previous, stored);
  if (yoy === undefined) return undefined;
  return 100 + yoy;
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `${year}年${Number(month)}月`;
}

function formatShortDate(dateText: string) {
  const [, month, day] = dateText.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatYoYRatioLabel(ratio: number | undefined) {
  if (ratio === undefined) return "—";
  const text = `${ratio.toFixed(1)}%`;
  return ratio < 100 ? `${text} ▼` : text;
}

function parseDailyYoYRow(page: NotionPage): DailyYoYRow | null {
  const date = getPropertyDate(page.properties, DATE_KEYS);
  if (!date) return null;

  const sales = getPropertyNumber(page.properties, SALES_KEYS) ?? 0;
  const customers = getPropertyNumber(page.properties, CUSTOMERS_KEYS) ?? 0;
  const averageSpend =
    getPropertyNumber(page.properties, AVERAGE_SPEND_KEYS) ??
    (customers > 0 ? sales / customers : 0);
  const previousSales = getPropertyNumber(page.properties, PREVIOUS_SALES_KEYS) ?? undefined;
  const previousCustomers = getPropertyNumber(page.properties, PREVIOUS_CUSTOMERS_KEYS) ?? undefined;
  const previousAverageSpend =
    getPropertyNumber(page.properties, PREVIOUS_AVERAGE_SPEND_KEYS) ??
    (previousCustomers && previousCustomers > 0 && previousSales
      ? previousSales / previousCustomers
      : undefined);

  return {
    date,
    sales,
    customers,
    averageSpend,
    previousSales,
    previousCustomers,
    previousAverageSpend,
    salesYoY: getPropertyNumber(page.properties, SALES_YOY_KEYS) ?? undefined,
    customersYoY: getPropertyNumber(page.properties, CUSTOMERS_YOY_KEYS) ?? undefined,
    averageSpendYoY: getPropertyNumber(page.properties, AVERAGE_SPEND_YOY_KEYS) ?? undefined,
  };
}

export function mapKpiEntryToYoYRow(entry: KpiSnapshotEntry): DailyYoYRow | null {
  if (!entry.date) return null;
  return {
    date: entry.date,
    sales: entry.sales,
    customers: entry.customers,
    averageSpend: entry.averageSpend || (entry.customers > 0 ? entry.sales / entry.customers : 0),
    previousSales: entry.previousSales,
    previousCustomers: entry.previousCustomers,
    previousAverageSpend: entry.previousAverageSpend,
    salesYoY: entry.salesYoY,
    customersYoY: entry.customersYoY,
    averageSpendYoY: entry.averageSpendYoY,
  };
}

export async function fetchDailyYoYRows(dbId: string = PRIMARY_DAILY_SALES_DB_ID): Promise<DailyYoYRow[]> {
  let pages: NotionPage[] = [];
  try {
    pages = await queryDatabaseAll(dbId, {
      sorts: [{ property: DATE_KEYS[0], direction: "ascending" }],
    });
  } catch {
    try {
      pages = await queryDatabaseAll(dbId);
    } catch {
      return [];
    }
  }

  return pages
    .map(parseDailyYoYRow)
    .filter((row): row is DailyYoYRow => Boolean(row))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function resolveLatestMonthKey(rows: DailyYoYRow[]) {
  if (!rows.length) return "";
  return rows[rows.length - 1].date.slice(0, 7);
}

function filterMonthRows(rows: DailyYoYRow[], monthKey: string) {
  return rows.filter((row) => row.date.startsWith(monthKey));
}

function hasPreviousSales(row: DailyYoYRow) {
  return typeof row.previousSales === "number" && row.previousSales > 0;
}

function hasPreviousAverageSpend(row: DailyYoYRow) {
  return typeof row.previousAverageSpend === "number" && row.previousAverageSpend > 0;
}

function latestDateLabel(rows: DailyYoYRow[]) {
  if (!rows.length) return "";
  return formatShortDate(rows[rows.length - 1].date);
}

function excludedNoPreviousNote(allRows: DailyYoYRow[], comparableRows: DailyYoYRow[]) {
  const excluded = allRows.filter((row) => !hasPreviousSales(row)).map((row) => formatShortDate(row.date));
  if (!excluded.length) return "";
  return `※ ${excluded.join("・")} は前年データなしのため除外（${comparableRows.length}日間比較）`;
}

function missingInputNote(allRows: DailyYoYRow[], monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const existingDays = new Set(allRows.map((row) => Number(row.date.slice(8, 10))));
  const missing: string[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    if (!existingDays.has(day)) missing.push(`${month}/${day}`);
  }
  if (!missing.length) return "";
  const lastExisting = allRows.length ? formatShortDate(allRows[allRows.length - 1].date) : "";
  const afterLast = lastExisting
    ? missing.filter((label) => {
        const [m, d] = label.split("/").map(Number);
        const [, , lastDayNum] = allRows[allRows.length - 1].date.split("-").map(Number);
        return d > lastDayNum;
      })
    : missing;
  if (!afterLast.length) return "";
  return `${afterLast.join("・")} はデータ未入力（入力後に再集計可能）`;
}

function summarizeComparable(rows: DailyYoYRow[]) {
  const comparable = rows.filter(hasPreviousSales);
  const totalSales = comparable.reduce((sum, row) => sum + row.sales, 0);
  const totalPreviousSales = comparable.reduce((sum, row) => sum + (row.previousSales ?? 0), 0);
  const totalCustomers = comparable.reduce((sum, row) => sum + row.customers, 0);
  const totalPreviousCustomers = comparable.reduce((sum, row) => sum + (row.previousCustomers ?? 0), 0);
  const avgSpend = totalCustomers > 0 ? totalSales / totalCustomers : 0;
  const prevAvgSpend =
    totalPreviousCustomers > 0 ? totalPreviousSales / totalPreviousCustomers : 0;

  return {
    comparable,
    totalSales,
    totalPreviousSales,
    totalCustomers,
    totalPreviousCustomers,
    avgSpend,
    prevAvgSpend,
    salesYoY: resolveYoY(totalSales, totalPreviousSales, undefined),
    customersYoY: resolveYoY(totalCustomers, totalPreviousCustomers, undefined),
    averageSpendYoY: resolveYoY(avgSpend, prevAvgSpend, undefined),
  };
}

function formatSalesYoYSection(monthKey: string, allRows: DailyYoYRow[]) {
  const summary = summarizeComparable(allRows);
  const cutoff = latestDateLabel(allRows);
  const lines = [
    `【${formatMonthLabel(monthKey)} 昨対比レポート（〜${cutoff}時点）】`,
    `比較対象日（前年データあり：${summary.comparable.length}日間）`,
    "",
    "| 指標 | 今年 | 前年 | 昨対比 |",
    "|---|---:|---:|---:|",
    `| 売上合計（税抜） | ${formatYen(summary.totalSales)} | ${formatYen(summary.totalPreviousSales)} | ${formatPercentDelta(summary.salesYoY)} |`,
    `| 客数合計 | ${formatCount(summary.totalCustomers)} | ${formatCount(summary.totalPreviousCustomers)} | ${formatPercentDelta(summary.customersYoY)} |`,
    `| 客単価（平均） | ${formatYen(summary.avgSpend)} | ${formatYen(summary.prevAvgSpend)} | ${formatPercentDelta(summary.averageSpendYoY)} |`,
    excludedNoPreviousNote(allRows, summary.comparable),
    "",
    "【日別 売上昨対比】",
    "| 日付 | 今年売上 | 前年売上 | 昨対 |",
    "|---|---:|---:|---:|",
    ...allRows.map((row) => {
      const ratio = resolveRatioPercent(row.sales, row.previousSales, row.salesYoY);
      return `| ${formatShortDate(row.date)} | ${formatYen(row.sales)} | ${hasPreviousSales(row) ? formatYen(row.previousSales!) : "—"} | ${formatYoYRatioLabel(ratio)} |`;
    }),
  ].filter(Boolean);

  const missing = missingInputNote(allRows, monthKey);
  if (missing) lines.push("", missing);
  return lines.join("\n");
}

function formatAverageSpendYoYSection(monthKey: string, allRows: DailyYoYRow[]) {
  const summary = summarizeComparable(allRows);
  const cutoff = latestDateLabel(allRows);
  const lines = [
    `【客単価 昨対比（〜${cutoff}時点）】`,
    "| 日付 | 今年客単 | 前年客単 | 昨対 |",
    "|---|---:|---:|---:|",
    ...allRows.map((row) => {
      const prevAvg =
        row.previousAverageSpend ??
        (row.previousCustomers && row.previousCustomers > 0 && row.previousSales
          ? row.previousSales / row.previousCustomers
          : undefined);
      const ratio = resolveRatioPercent(row.averageSpend, prevAvg, row.averageSpendYoY);
      return `| ${formatShortDate(row.date)} | ${formatYen(row.averageSpend)} | ${hasPreviousAverageSpend(row) || (prevAvg && prevAvg > 0) ? formatYen(prevAvg!) : "—"} | ${formatYoYRatioLabel(ratio)} |`;
    }),
    "",
    "※今年客単＝売上÷客数で算出",
    "",
    `【客単価 月間平均比較（${summary.comparable.length}日間）】`,
    "| 指標 | 今年 | 前年 | 昨対 |",
    "|---|---:|---:|---:|",
    `| 客単価平均 | ${formatYen(summary.avgSpend)} | ${formatYen(summary.prevAvgSpend)} | ${formatPercentDelta(summary.averageSpendYoY)} |`,
  ];
  return lines.join("\n");
}

type PriceBand = "2000+" | "1500-1999" | "under1500";

function classifyPriceBand(value: number): PriceBand {
  if (value >= 2000) return "2000+";
  if (value >= 1500) return "1500-1999";
  return "under1500";
}

function bandLabel(band: PriceBand) {
  if (band === "2000+") return "¥2,000以上";
  if (band === "1500-1999") return "¥1,500〜¥1,999";
  return "¥1,500未満";
}

function countBands(rows: DailyYoYRow[], pickValue: (row: DailyYoYRow) => number | undefined) {
  const counts: Record<PriceBand, number> = { "2000+": 0, "1500-1999": 0, under1500: 0 };
  for (const row of rows) {
    const value = pickValue(row);
    if (value === undefined || value <= 0) continue;
    counts[classifyPriceBand(value)] += 1;
  }
  return counts;
}

function formatPriceBandSection(monthKey: string, allRows: DailyYoYRow[]) {
  const cutoff = latestDateLabel(allRows);
  const comparable = allRows.filter(hasPreviousAverageSpend);
  const thisYearCounts = countBands(allRows, (row) => row.averageSpend);
  const previousYearCounts = countBands(comparable, (row) => row.previousAverageSpend);
  const thisYearTotal = allRows.length;
  const previousYearTotal = comparable.length;

  const highBandRows = allRows.filter((row) => classifyPriceBand(row.averageSpend) === "2000+");
  const lowBandRows = allRows.filter((row) => classifyPriceBand(row.averageSpend) === "under1500");

  const summary = summarizeComparable(allRows);
  const prevHigh = comparable.filter((row) => classifyPriceBand(row.previousAverageSpend ?? 0) === "2000+");
  const prevLow = comparable.filter((row) => classifyPriceBand(row.previousAverageSpend ?? 0) === "under1500");

  const maxThisYear = [...allRows].sort((a, b) => b.averageSpend - a.averageSpend)[0];
  const maxPrevious = [...comparable]
    .filter((row) => row.previousAverageSpend)
    .sort((a, b) => (b.previousAverageSpend ?? 0) - (a.previousAverageSpend ?? 0))[0];
  const minThisYear = [...allRows].sort((a, b) => a.averageSpend - b.averageSpend)[0];
  const minPrevious = [...comparable]
    .filter((row) => row.previousAverageSpend)
    .sort((a, b) => (a.previousAverageSpend ?? 0) - (b.previousAverageSpend ?? 0))[0];

  return [
    `【客単価 価格帯別 分布比較（〜${cutoff}）】`,
    "",
    "【帯別 日数カウント】",
    "| 客単価帯 | 今年 | 前年 |",
    "|---|---:|---:|",
    `| ¥2,000以上 | ${thisYearCounts["2000+"]}日 (${thisYearTotal > 0 ? Math.round((thisYearCounts["2000+"] / thisYearTotal) * 100) : 0}%) | ${previousYearCounts["2000+"]}日 (${previousYearTotal > 0 ? Math.round((previousYearCounts["2000+"] / previousYearTotal) * 100) : 0}%) |`,
    `| ¥1,500〜¥1,999 | ${thisYearCounts["1500-1999"]}日 (${thisYearTotal > 0 ? Math.round((thisYearCounts["1500-1999"] / thisYearTotal) * 100) : 0}%) | ${previousYearCounts["1500-1999"]}日 (${previousYearTotal > 0 ? Math.round((previousYearCounts["1500-1999"] / previousYearTotal) * 100) : 0}%) |`,
    `| ¥1,500未満 | ${thisYearCounts.under1500}日 (${thisYearTotal > 0 ? Math.round((thisYearCounts.under1500 / thisYearTotal) * 100) : 0}%) | ${previousYearCounts.under1500}日 (${previousYearTotal > 0 ? Math.round((previousYearCounts.under1500 / previousYearTotal) * 100) : 0}%) |`,
    "",
    "【帯別 詳細内訳（高単価日 ¥2,000以上）】",
    "| 日付 | 今年 | 前年 |",
    "|---|---:|---:|",
    ...highBandRows.map(
      (row) =>
        `| ${formatShortDate(row.date)} | ${formatYen(row.averageSpend)} | ${row.previousAverageSpend ? formatYen(row.previousAverageSpend) : "—"} |`,
    ),
    "",
    "【帯別 詳細内訳（低単価日 ¥1,500未満）】",
    "| 日付 | 今年 | 前年 |",
    "|---|---:|---:|",
    ...lowBandRows.map(
      (row) =>
        `| ${formatShortDate(row.date)} | ${formatYen(row.averageSpend)} | ${row.previousAverageSpend ? formatYen(row.previousAverageSpend) : "—"} |`,
    ),
    "",
    "【サマリー】",
    "| 指標 | 今年 | 前年 |",
    "|---|---:|---:|",
    `| ¥2,000超え日 | ${highBandRows.length}日 | ${prevHigh.length}日 |`,
    `| ¥1,500未満日 | ${lowBandRows.length}日 | ${prevLow.length}日 |`,
    `| 最高客単価 | ${maxThisYear ? `${formatYen(maxThisYear.averageSpend)}（${formatShortDate(maxThisYear.date)}）` : "—"} | ${maxPrevious ? `${formatYen(maxPrevious.previousAverageSpend!)}（${formatShortDate(maxPrevious.date)}）` : "—"} |`,
    `| 最低客単価 | ${minThisYear ? `${formatYen(minThisYear.averageSpend)}（${formatShortDate(minThisYear.date)}）` : "—"} | ${minPrevious ? `${formatYen(minPrevious.previousAverageSpend!)}（${formatShortDate(minPrevious.date)}）` : "—"} |`,
    `| 平均客単価 | ${formatYen(summary.avgSpend)} | ${formatYen(summary.prevAvgSpend)} |`,
  ].join("\n");
}

function formatSignedYen(amount: number) {
  const sign = amount >= 0 ? "+" : "−";
  return `${sign}${formatYen(Math.abs(amount))}`;
}

function formatDifferenceSection(allRows: DailyYoYRow[]) {
  const comparable = allRows.filter(
    (row) => hasPreviousAverageSpend(row) || (row.previousSales && row.previousCustomers),
  );
  const diffs = comparable
    .map((row) => {
      const prevAvg =
        row.previousAverageSpend ??
        (row.previousCustomers && row.previousCustomers > 0 && row.previousSales
          ? row.previousSales / row.previousCustomers
          : undefined);
      if (!prevAvg || prevAvg <= 0) return null;
      const diff = row.averageSpend - prevAvg;
      return { date: row.date, current: row.averageSpend, previous: prevAvg, diff };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const positive = diffs.filter((item) => item.diff > 0);
  const negative = diffs.filter((item) => item.diff < 0);
  const totalDiff = diffs.reduce((sum, item) => sum + item.diff, 0);
  const avgPositive =
    positive.length > 0 ? positive.reduce((sum, item) => sum + item.diff, 0) / positive.length : 0;
  const avgNegative =
    negative.length > 0 ? negative.reduce((sum, item) => sum + item.diff, 0) / negative.length : 0;

  return [
    "【客単価 差分（今年 − 前年）】",
    "| 日付 | 今年客単 | 前年客単 | 差分 |",
    "|---|---:|---:|---:|",
    ...diffs.map((item) => {
      const marker = item.diff < 0 ? " ▼" : "";
      return `| ${formatShortDate(item.date)} | ${formatYen(item.current)} | ${formatYen(item.previous)} | ${formatSignedYen(item.diff)}${marker} |`;
    }),
    "",
    "【差分サマリー】",
    "| 指標 | 金額 |",
    "|---|---:|",
    `| プラス日 平均差分 | ${formatSignedYen(avgPositive)} |`,
    `| マイナス日 平均差分 | ${formatSignedYen(avgNegative)} |`,
    `| ${diffs.length}日間 累計差分 | ${formatSignedYen(totalDiff)} |`,
    `| 1日あたり平均差分 | ${formatSignedYen(totalDiff / Math.max(diffs.length, 1))} |`,
  ].join("\n");
}

export function buildYoYSalesReport(
  rows: DailyYoYRow[],
  monthKey: string,
  section: YoYReportSection = "full",
) {
  const monthRows = filterMonthRows(rows, monthKey);
  if (!monthRows.length) {
    return `${formatMonthLabel(monthKey)} の日次売上データが見つかりません。`;
  }

  const sections: string[] = [];
  if (section === "full" || section === "sales") {
    sections.push(formatSalesYoYSection(monthKey, monthRows));
  }
  if (section === "full" || section === "average_spend") {
    sections.push(formatAverageSpendYoYSection(monthKey, monthRows));
  }
  if (section === "full" || section === "price_band") {
    sections.push(formatPriceBandSection(monthKey, monthRows));
  }
  if (section === "full" || section === "difference") {
    sections.push(formatDifferenceSection(monthRows));
  }

  return sections.join("\n\n");
}

export async function buildDefaultYoYReportContext(
  monthKey?: string,
  dbId: string = PRIMARY_DAILY_SALES_DB_ID,
) {
  const rows = await fetchDailyYoYRows(dbId);
  if (!rows.length) return "";

  const targetMonth = monthKey || resolveLatestMonthKey(rows);
  const report = buildYoYSalesReport(rows, targetMonth, "full");

  return [
    "【売上分析エージェント用: 昨対比レポート（Notion日次売上DB）】",
    `DB ID: ${dbId}`,
    `対象月: ${formatMonthLabel(targetMonth)}`,
    "以下の集計表を根拠に、同形式で回答すること。数値は変更せず、末尾に【所見】を必ず付ける。",
    "",
    report,
  ].join("\n");
}

export async function buildYoYReportForMonth(
  monthKey: string,
  section: YoYReportSection = "full",
  dbId: string = PRIMARY_DAILY_SALES_DB_ID,
) {
  const rows = await fetchDailyYoYRows(dbId);
  return buildYoYSalesReport(rows, monthKey, section);
}
