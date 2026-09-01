import { getPropertyNumber, getPropertyText, queryDatabaseAllWithToken } from "@/lib/notion/client";
import { getTenantNotionConfig } from "@/lib/tenant-config/service";
import type { TenantKey } from "@/lib/tenant-config/types";

function timeZoneSalesDbId(tenant: TenantKey): string {
  if (tenant === "demo") return (process.env.NOTION_DEMO_TIME_ZONE_SALES_DB_ID || "").trim();
  return (process.env.NOTION_OOTSUKI_TIME_ZONE_SALES_DB_ID || "").trim();
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; text: string }>();

/**
 * 時間帯別売上DB（USEN/POSのCSVアップロード時に保存されたピーク時間帯集計）から、
 * 対象（売上・客数）ごとの最新1件を要約してAI施策生成プロンプトに渡す。
 */
export async function getTimeZoneSalesSummaryForPrompt(tenant: TenantKey): Promise<string> {
  const dbId = timeZoneSalesDbId(tenant);
  if (!dbId) return "（時間帯別売上データは未接続です）";

  const cached = cache.get(tenant);
  if (cached && cached.expiresAt > Date.now()) return cached.text;

  const config = await getTenantNotionConfig(tenant);
  if (!config.notionToken) return "（時間帯別売上データは未接続です）";

  const pages = await queryDatabaseAllWithToken(config.notionToken, dbId, {
    sorts: [{ timestamp: "created_time", direction: "descending" }],
  }).catch(() => null);

  if (!pages || pages.length === 0) {
    return "（時間帯別売上データはまだアップロードされていません。ダッシュボードの「USEN時間帯別売上」「POS時間帯別売上・客数」からCSVを読み込み、保存すると反映されます）";
  }

  const lines: string[] = [];
  for (const target of ["売上", "客数"]) {
    const page = pages.find((p) => getPropertyText(p.properties, ["対象"]) === target);
    if (!page) continue;
    const source = getPropertyText(page.properties, ["ソース"]) || "-";
    const total = getPropertyNumber(page.properties, ["合計"]) ?? 0;
    const peak = getPropertyText(page.properties, ["ピーク時間帯"]) || "不明";
    const date = (page.created_time || "").slice(0, 10) || "-";
    lines.push(`- ${target}（${source}、登録日: ${date}）: 合計${Math.round(total).toLocaleString("ja-JP")}, ピーク時間帯: ${peak}`);
  }

  if (lines.length === 0) {
    return "（時間帯別売上データはまだアップロードされていません）";
  }

  const text = [
    "直近アップロードされた時間帯別集計（ピーク帯の把握用。仕込み・人員配置・時間帯限定販促の判断材料）:",
    ...lines,
  ].join("\n");

  cache.set(tenant, { expiresAt: Date.now() + CACHE_TTL_MS, text });
  return text;
}

export type TimeZoneSalesHourly = { hour: string; value: number };

export type TimeZoneSalesEntry = {
  target: "売上" | "客数";
  source: string;
  total: number;
  peakText: string;
  hourlyTotals: TimeZoneSalesHourly[];
};

export type TimeZoneSalesMonth = {
  month: string;
  entries: TimeZoneSalesEntry[];
};

/** 時間帯別売上DBの全件を対象月ごとにグループ化して返す（ダッシュボード表示用）。 */
export async function getTimeZoneSalesMonthsData(tenant: TenantKey): Promise<TimeZoneSalesMonth[]> {
  const dbId = timeZoneSalesDbId(tenant);
  if (!dbId) return [];

  const config = await getTenantNotionConfig(tenant);
  if (!config.notionToken) return [];

  const pages = await queryDatabaseAllWithToken(config.notionToken, dbId, {}).catch(() => null);
  if (!pages) return [];

  const byMonth = new Map<string, TimeZoneSalesMonth>();
  for (const page of pages) {
    const month = getPropertyText(page.properties, ["対象月"]);
    if (!month) continue;
    const targetRaw = getPropertyText(page.properties, ["対象"]);
    const target: "売上" | "客数" = targetRaw === "客数" ? "客数" : "売上";
    const source = getPropertyText(page.properties, ["ソース"]) || "-";
    const total = getPropertyNumber(page.properties, ["合計"]) ?? 0;
    const peakText = getPropertyText(page.properties, ["ピーク時間帯"]) || "-";
    let hourlyTotals: TimeZoneSalesHourly[] = [];
    try {
      hourlyTotals = JSON.parse(getPropertyText(page.properties, ["時間帯別内訳JSON"]) || "[]");
    } catch {
      hourlyTotals = [];
    }

    const bucket = byMonth.get(month) || { month, entries: [] };
    bucket.entries.push({ target, source, total, peakText, hourlyTotals });
    byMonth.set(month, bucket);
  }

  return Array.from(byMonth.values()).sort((a, b) => b.month.localeCompare(a.month));
}
