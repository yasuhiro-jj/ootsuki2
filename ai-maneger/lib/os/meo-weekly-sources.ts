import { getPropertyDate, getPropertyNumber, getPropertyText, queryDatabaseAllWithToken } from "@/lib/notion/client";
import { loadMeoWeeklyFromApi } from "@/lib/os/meo-api";
import type { MeoWeeklyPair, MeoWeeklySnapshot } from "@/lib/os/meo-weekly";
import { getTenantNotionConfig } from "@/lib/tenant-config/service";
import type { TenantKey } from "@/lib/tenant-config/types";

const OOTSUKI_MEO_WEEKLY_DB_ID = "7e61ad73b6124c4a9ba941a205bd3bb2";
const OOTSUKI_MEO_WEEKLY_DATA_SOURCE_ID = "0f3132b3-2e51-49de-b7d6-70db176cd895";

function meoDbId(tenant: TenantKey) {
  const env =
    tenant === "demo"
      ? (process.env.NOTION_DEMO_MEO_WEEKLY_DB_ID || "").trim()
      : (process.env.NOTION_OOTSUKI_MEO_WEEKLY_DB_ID || "").trim();
  return env || (tenant === "ootsuki" ? OOTSUKI_MEO_WEEKLY_DB_ID : "");
}

function mapPage(page: {
  properties: Record<string, unknown>;
  last_edited_time?: string;
  created_time?: string;
}): MeoWeeklySnapshot | null {
  const properties = page.properties as Parameters<typeof getPropertyText>[0];
  const fetchedAt = getPropertyDate(properties, ["取得日"]) || "";
  if (!fetchedAt) return null;

  const updatedRaw = page.last_edited_time || page.created_time || fetchedAt;
  return {
    fetchedAt: fetchedAt.length === 10 ? `${fetchedAt}T12:00:00.000Z` : fetchedAt,
    updatedAt: updatedRaw,
    rating: getPropertyNumber(properties, ["口コミ評価"]) ?? null,
    reviewCount: getPropertyNumber(properties, ["口コミ件数"]) ?? null,
    lowRating30d: getPropertyNumber(properties, ["低評価30日"]) ?? null,
    lowRatingDetail: getPropertyText(properties, ["低評価内訳"]) || "",
    unreplied: getPropertyNumber(properties, ["未返信"]) ?? null,
    impressions: getPropertyNumber(properties, ["表示回数"]) ?? null,
    prevImpressions: getPropertyNumber(properties, ["前月表示回数"]) ?? null,
    routeSearches: getPropertyNumber(properties, ["ルート検索"]) ?? null,
    phoneTaps: getPropertyNumber(properties, ["電話タップ"]) ?? null,
    siteClicks: getPropertyNumber(properties, ["サイトクリック"]) ?? null,
    displayMonth: getPropertyText(properties, ["表示月"]) || "",
    meoScore: getPropertyNumber(properties, ["MEOスコア"]) ?? null,
    profileDiagnosis: getPropertyNumber(properties, ["プロフィール診断"]) ?? null,
    rankKeyword: getPropertyText(properties, ["順位キーワード"]) || "",
    rankPosition: getPropertyNumber(properties, ["順位"]) ?? null,
    rankLeader: getPropertyText(properties, ["1位店舗"]) || "",
    source: getPropertyText(properties, ["ソース"]) || "Notion MEO週次",
  };
}

async function loadFromNotion(tenant: TenantKey): Promise<MeoWeeklyPair | null> {
  const databaseId = meoDbId(tenant);
  if (!databaseId) return null;

  const config = await getTenantNotionConfig(tenant);
  if (!config.notionToken) return null;

  let pages = await queryDatabaseAllWithToken(config.notionToken, databaseId, {}).catch(() => null);
  if ((!pages || pages.length === 0) && tenant === "ootsuki") {
    pages = await queryDatabaseAllWithToken(config.notionToken, OOTSUKI_MEO_WEEKLY_DATA_SOURCE_ID, {}).catch(() => null);
  }
  if (!pages || pages.length === 0) {
    console.warn("[os] MEO週次DBから行を取得できませんでした。ai-company の接続を確認してください:", databaseId);
    return null;
  }

  const rows = pages
    .map(mapPage)
    .filter((row): row is MeoWeeklySnapshot => Boolean(row))
    .sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt));

  if (rows.length === 0) return null;
  return { latest: rows[0], previous: rows[1] ?? null };
}

/** GBP API が未接続の間は Notion の最新2行を読む。 */
export async function loadMeoWeeklyPair(tenant: TenantKey): Promise<MeoWeeklyPair | null> {
  const fromApi = await loadMeoWeeklyFromApi(tenant);
  if (fromApi) return { latest: fromApi, previous: null };
  return loadFromNotion(tenant);
}
