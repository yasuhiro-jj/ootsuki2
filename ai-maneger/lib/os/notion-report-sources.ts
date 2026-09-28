import { getPropertyCheckbox, getPropertyNumber, getPropertyText, queryDatabaseAllWithToken } from "@/lib/notion/client";
import { getTimeZoneSalesMonthsData } from "@/lib/marketing/time-zone-sales-insights";
import { getTenantNotionConfig } from "@/lib/tenant-config/service";
import type { TenantKey } from "@/lib/tenant-config/types";
import {
  drinkRatioFromCategorySales,
  parseYenAmount,
  trialBalanceRates,
  type CategorySalesRow,
  type NotionReportOverlay,
  type PeakMonth,
  type TrialBalanceAccount,
} from "@/lib/os/notion-report";

/**
 * Grok Bot の読み取り結果（2026-09-29）で実数があったおおつきのDB。
 * 環境変数が空のときだけ使う。空の「商品別売上（ABC）最新版」はここには入れない。
 */
const OOTSUKI_TIME_ZONE_DB_ID = "ae7a3662e7fa4300bd19f89ba2587c72";
const OOTSUKI_CATEGORY_SALES_DB_ID = "332e9a7ee5b780cd9b3be7494fba7f70";
const OOTSUKI_TRIAL_BALANCE_DB_ID = "8737eedeb02f4400b614ed3ee4cc71cd";

function envId(tenant: TenantKey, ootsukiName: string, demoName: string) {
  const name = tenant === "demo" ? demoName : ootsukiName;
  return (process.env[name] || "").trim();
}

function categorySalesDbIds(tenant: TenantKey) {
  const ids = [
    envId(tenant, "NOTION_OOTSUKI_ABC_CATEGORY_SALES_DB_ID", "NOTION_DEMO_ABC_CATEGORY_SALES_DB_ID"),
    tenant === "ootsuki" ? OOTSUKI_CATEGORY_SALES_DB_ID : "",
    envId(tenant, "NOTION_OOTSUKI_ABC_ANALYSIS_DB_ID", "NOTION_DEMO_ABC_ANALYSIS_DB_ID"),
  ];
  return [...new Set(ids.filter(Boolean))];
}

function trialBalanceDbId(tenant: TenantKey) {
  return (
    envId(tenant, "NOTION_OOTSUKI_TRIAL_BALANCE_DB_ID", "NOTION_DEMO_TRIAL_BALANCE_DB_ID") ||
    (tenant === "ootsuki" ? OOTSUKI_TRIAL_BALANCE_DB_ID : "")
  );
}

function readSalesAmount(properties: Parameters<typeof getPropertyText>[0]) {
  const text = getPropertyText(properties, ["売上金額"]);
  const parsed = parseYenAmount(text);
  if (parsed !== 0) return parsed;
  return getPropertyNumber(properties, ["売上金額"]) ?? 0;
}

async function loadCategoryRows(tenant: TenantKey, databaseId: string): Promise<CategorySalesRow[]> {
  const config = await getTenantNotionConfig(tenant);
  if (!config.notionToken) return [];
  const pages = await queryDatabaseAllWithToken(config.notionToken, databaseId, {}).catch(() => null);
  if (!pages) return [];
  return pages.map((page) => ({
    month: getPropertyText(page.properties, ["対象月"]),
    category: getPropertyText(page.properties, ["カテゴリ1", "カテゴリ"]),
    salesAmount: readSalesAmount(page.properties),
    excluded: getPropertyCheckbox(page.properties, ["計算対象外"]),
  }));
}

async function loadDrink(tenant: TenantKey) {
  for (const databaseId of categorySalesDbIds(tenant)) {
    const rows = await loadCategoryRows(tenant, databaseId);
    const ratio = drinkRatioFromCategorySales(rows);
    if (ratio) return ratio;
  }
  return null;
}

async function loadPeak(tenant: TenantKey): Promise<PeakMonth | null> {
  const months = await getTimeZoneSalesMonthsData(tenant);
  if (months[0]) return months[0];
  const configured = envId(tenant, "NOTION_OOTSUKI_TIME_ZONE_SALES_DB_ID", "NOTION_DEMO_TIME_ZONE_SALES_DB_ID");
  if (configured || tenant !== "ootsuki") return null;
  const fallback = await getTimeZoneSalesMonthsData(tenant, OOTSUKI_TIME_ZONE_DB_ID);
  return fallback[0] ?? null;
}

function yearInText(text: string) {
  const years = text.match(/20\d{2}/g);
  if (!years) return undefined;
  return Math.max(...years.map((year) => Number(year)));
}

async function databaseTitleYear(token: string, databaseId: string) {
  const version = process.env.NOTION_API_VERSION?.trim() || "2022-06-28";
  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": version },
      cache: "no-store",
    });
    if (!response.ok) return undefined;
    const json = (await response.json()) as { title?: Array<{ plain_text?: string }> };
    const title = (json.title ?? []).map((part) => part.plain_text ?? "").join("");
    return yearInText(title);
  } catch {
    return undefined;
  }
}

async function loadTrial(tenant: TenantKey) {
  const databaseId = trialBalanceDbId(tenant);
  if (!databaseId) return null;
  const config = await getTenantNotionConfig(tenant);
  if (!config.notionToken) return null;
  const pages = await queryDatabaseAllWithToken(config.notionToken, databaseId, {}).catch(() => null);
  if (!pages || pages.length === 0) return null;

  const rows: TrialBalanceAccount[] = pages.map((page) => {
    const amounts: TrialBalanceAccount["amounts"] = {};
    for (let month = 1; month <= 12; month += 1) {
      const value = getPropertyNumber(page.properties, [`${month}月`]);
      if (typeof value === "number" && Number.isFinite(value)) amounts[month] = value;
    }
    return {
      account: getPropertyText(page.properties, ["勘定科目", "科目", "title"]),
      amounts,
    };
  });

  const noteYear = yearInText(pages.map((page) => getPropertyText(page.properties, ["注記"])).join("\n"));
  const titleYear = noteYear ?? (await databaseTitleYear(config.notionToken, databaseId));
  return trialBalanceRates(rows, titleYear);
}

/** 日次以外で、レポート上 Notion に実数があった項目だけ読む。失敗した項目は null。 */
export async function loadNotionReportOverlay(tenant: TenantKey): Promise<NotionReportOverlay> {
  const [peak, drink, trial] = await Promise.all([
    loadPeak(tenant).catch((error) => {
      console.warn("[os] 時間帯別売上を読めませんでした:", error);
      return null;
    }),
    loadDrink(tenant).catch((error) => {
      console.warn("[os] 商品別売上からドリンク比率を計算できませんでした:", error);
      return null;
    }),
    loadTrial(tenant).catch((error) => {
      console.warn("[os] 推移試算表を読めませんでした:", error);
      return null;
    }),
  ]);
  return { peak, drink, trial };
}
