import {
  getPropertyDate,
  getPropertyNumber,
  queryDatabaseAll,
} from "@/lib/notion/client";
import { formatCount, formatPercentDelta, formatYen } from "@/lib/ootsuki";
import type { NotionPage } from "@/types/notion";

import type { KpiSnapshotEntry } from "@/types/ootsuki";

const DATE_KEYS = ["日付", "Date"];
const SALES_KEYS = ["売上", "売上高", "Sales", "売上(税抜)"];
const CUSTOMERS_KEYS = ["客数", "Customers"];
const AVERAGE_SPEND_KEYS = ["客単価", "Average Spend", "客単価(自動)"];

export type MonthlySalesSummary = {
  monthKey: string;
  sales: number;
  customers: number;
  averageSpend: number;
  dayCount: number;
};

function read(value?: string | null) {
  return value?.trim() || "";
}

function toHyphenatedNotionId(id32: string) {
  const normalized = id32.toLowerCase();
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
}

export function extractNotionDatabaseId(rawValue: string) {
  const raw = read(rawValue);
  if (!raw) return "";

  const idPattern = /([0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;
  const matched = raw.match(idPattern);
  if (!matched) return "";

  const stripped = matched[1].replace(/-/g, "");
  if (stripped.length !== 32) return "";
  return toHyphenatedNotionId(stripped);
}

/** 日次売上DB（1c590ca5-...）の既定ID */
export const PRIMARY_DAILY_SALES_DB_ID = "1c590ca5-3f9a-43bc-aa7d-df5687f39235";

function parseDailySalesRow(page: NotionPage) {
  const date = getPropertyDate(page.properties, DATE_KEYS);
  if (!date) return null;

  const sales = getPropertyNumber(page.properties, SALES_KEYS) ?? 0;
  const customers = getPropertyNumber(page.properties, CUSTOMERS_KEYS) ?? 0;
  const averageSpend =
    getPropertyNumber(page.properties, AVERAGE_SPEND_KEYS) ??
    (customers > 0 ? sales / customers : 0);

  return { date, sales, customers, averageSpend };
}

export function aggregateMonthlySalesFromPages(pages: NotionPage[]): MonthlySalesSummary[] {
  const byMonth = new Map<string, { sales: number; customers: number; dayCount: number }>();

  for (const page of pages) {
    const row = parseDailySalesRow(page);
    if (!row) continue;

    const monthKey = row.date.slice(0, 7);
    const current = byMonth.get(monthKey) ?? { sales: 0, customers: 0, dayCount: 0 };
    byMonth.set(monthKey, {
      sales: current.sales + row.sales,
      customers: current.customers + row.customers,
      dayCount: current.dayCount + 1,
    });
  }

  return Array.from(byMonth.entries())
    .map(([monthKey, value]) => ({
      monthKey,
      sales: value.sales,
      customers: value.customers,
      averageSpend: value.customers > 0 ? value.sales / value.customers : 0,
      dayCount: value.dayCount,
    }))
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey));
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `${year}年${month}月`;
}

function monthOverMonthDelta(current: number, previous: number) {
  if (previous <= 0) return undefined;
  return ((current - previous) / previous) * 100;
}

export function formatMonthlySalesComparisonContext(
  summaries: MonthlySalesSummary[],
  options?: { dbId?: string; title?: string; detailMonthCount?: number },
) {
  if (!summaries.length) {
    return [
      options?.title ?? "【日次売上DB 月次集計】",
      options?.dbId ? `DB ID: ${options.dbId}` : "",
      "日次売上レコードが見つかりません。",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const detailCount = options?.detailMonthCount ?? 6;
  const recentMonths = summaries.slice(-detailCount);
  const lines = recentMonths.map((month, index) => {
    const prev = index > 0 ? recentMonths[index - 1] : undefined;
    const mom = prev ? monthOverMonthDelta(month.sales, prev.sales) : undefined;
    return [
      `- ${formatMonthLabel(month.monthKey)}`,
      `  累計売上: ${formatYen(month.sales)}`,
      `  客数: ${formatCount(month.customers)}`,
      `  客単価: ${formatYen(month.averageSpend)}`,
      `  入力日数: ${month.dayCount}日`,
      mom !== undefined ? `  前月比: ${formatPercentDelta(mom)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  const latest = summaries[summaries.length - 1];
  const previous = summaries.length >= 2 ? summaries[summaries.length - 2] : undefined;

  return [
    options?.title ?? "【日次売上DB 月次集計（全期間）】",
    options?.dbId ? `DB ID: ${options.dbId}` : "",
    "月次比較（4月 vs 5月 など）の質問には、必ずこの集計を根拠に回答すること。",
    `利用可能な月: ${summaries.map((m) => formatMonthLabel(m.monthKey)).join(" / ")}`,
    "",
    "【月次サマリー】",
    ...lines,
    "",
    "【直近2ヶ月の比較】",
    previous
      ? `${formatMonthLabel(previous.monthKey)} 売上 ${formatYen(previous.sales)} → ${formatMonthLabel(latest.monthKey)} 売上 ${formatYen(latest.sales)}（前月比 ${formatPercentDelta(monthOverMonthDelta(latest.sales, previous.sales))}）`
      : "前月データなし（比較不可）",
  ].join("\n");
}

export function aggregateMonthlySalesFromKpiEntries(entries: KpiSnapshotEntry[]): MonthlySalesSummary[] {
  const byMonth = new Map<string, { sales: number; customers: number; dayCount: number }>();

  for (const entry of entries) {
    if (!entry.date) continue;
    const monthKey = entry.date.slice(0, 7);
    const current = byMonth.get(monthKey) ?? { sales: 0, customers: 0, dayCount: 0 };
    byMonth.set(monthKey, {
      sales: current.sales + entry.sales,
      customers: current.customers + entry.customers,
      dayCount: current.dayCount + 1,
    });
  }

  return Array.from(byMonth.entries())
    .map(([monthKey, value]) => ({
      monthKey,
      sales: value.sales,
      customers: value.customers,
      averageSpend: value.customers > 0 ? value.sales / value.customers : 0,
      dayCount: value.dayCount,
    }))
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey));
}

export async function fetchMonthlySalesSummariesFromDb(dbId: string): Promise<MonthlySalesSummary[]> {
  let pages: NotionPage[] = [];
  try {
    pages = await queryDatabaseAll(dbId, {
      sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
    });
  } catch {
    pages = await queryDatabaseAll(dbId);
  }
  return aggregateMonthlySalesFromPages(pages);
}

export async function buildDailySalesDbMonthlyContext(dbId: string) {
  const summaries = await fetchMonthlySalesSummariesFromDb(dbId);
  return formatMonthlySalesComparisonContext(summaries, {
    dbId,
    title: "【常時参照: 日次売上DB 月次集計】",
    detailMonthCount: 12,
  });
}

export function resolveDailySalesDbIds(referenceDbIds: string[], tenantDailySalesDbId?: string) {
  const ids = new Set<string>();
  if (tenantDailySalesDbId) ids.add(tenantDailySalesDbId);
  ids.add(PRIMARY_DAILY_SALES_DB_ID);
  for (const id of referenceDbIds) ids.add(id);
  return Array.from(ids).filter(Boolean);
}
