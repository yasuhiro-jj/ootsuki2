import { getPropertyDate, getPropertyNumber, getPropertyText, queryDatabaseAllWithToken } from "@/lib/notion/client";
import { getTenantNotionConfig } from "@/lib/tenant-config/service";
import type { TenantKey } from "@/lib/tenant-config/types";
import type { LineKpiSnapshot } from "@/lib/os/line-kpi";

const OOTSUKI_LINE_KPI_DB_ID = "838a47cba8ad4742847acdf6175c7d45";
const OOTSUKI_LINE_KPI_DATA_SOURCE_ID = "459a4a9e-4e9c-4204-afa0-afef98fbc7f2";

function lineKpiDbId(tenant: TenantKey) {
  const env =
    tenant === "demo"
      ? (process.env.NOTION_DEMO_LINE_KPI_DB_ID || "").trim()
      : (process.env.NOTION_OOTSUKI_LINE_KPI_DB_ID || "").trim();
  return env || (tenant === "ootsuki" ? OOTSUKI_LINE_KPI_DB_ID : "");
}

function mapPage(page: {
  properties: Record<string, unknown>;
  last_edited_time?: string;
  created_time?: string;
}): LineKpiSnapshot | null {
  const properties = page.properties as Parameters<typeof getPropertyText>[0];
  const fetchedAt = getPropertyDate(properties, ["取得日"]) || "";
  if (!fetchedAt) return null;

  const updatedRaw = page.last_edited_time || page.created_time || fetchedAt;
  return {
    fetchedAt: fetchedAt.length === 10 ? `${fetchedAt}T12:00:00.000Z` : fetchedAt,
    updatedAt: updatedRaw,
    friends: getPropertyNumber(properties, ["友だち数"]) ?? null,
    previousFriends: getPropertyNumber(properties, ["前週友だち数"]) ?? null,
    dormant90: getPropertyNumber(properties, ["休眠90日以上"]) ?? null,
    lastBroadcastDate: getPropertyDate(properties, ["最終配信日"]) || null,
    openRate: getPropertyNumber(properties, ["開封率"]) ?? null,
    openCount: getPropertyNumber(properties, ["開封数"]) ?? null,
    lineVisits7d: getPropertyNumber(properties, ["LINE経由来店_7日"]) ?? null,
    previousLineVisits7d: getPropertyNumber(properties, ["前週LINE経由来店_7日"]) ?? null,
    memo: getPropertyText(properties, ["所感/メモ", "メモ"]),
    source: getPropertyText(properties, ["ソース"]) || "",
  };
}

/** Notion「おおつき LINE KPI DB」の最新行（取得日が新しい順）。読み取りのみ。 */
export async function loadLineKpiSnapshot(tenant: TenantKey): Promise<LineKpiSnapshot | null> {
  const databaseId = lineKpiDbId(tenant);
  if (!databaseId) return null;

  const config = await getTenantNotionConfig(tenant);
  if (!config.notionToken) return null;

  let pages = await queryDatabaseAllWithToken(config.notionToken, databaseId, {}).catch(() => null);
  if ((!pages || pages.length === 0) && tenant === "ootsuki") {
    pages = await queryDatabaseAllWithToken(config.notionToken, OOTSUKI_LINE_KPI_DATA_SOURCE_ID, {}).catch(() => null);
  }
  if (!pages || pages.length === 0) {
    console.warn("[os] LINE KPI DBから行を取得できませんでした。ai-company の接続を確認してください:", databaseId);
    return null;
  }

  const rows = pages
    .map(mapPage)
    .filter((row): row is LineKpiSnapshot => Boolean(row))
    .sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt));
  return rows[0] ?? null;
}
