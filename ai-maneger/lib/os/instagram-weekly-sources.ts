import { getPropertyDate, getPropertyNumber, getPropertyText, queryDatabaseAllWithToken } from "@/lib/notion/client";
import { loadInstagramWeeklyFromApi } from "@/lib/os/instagram-api";
import type { InstagramWeeklyPair, InstagramWeeklySnapshot } from "@/lib/os/instagram-weekly";
import { getTenantNotionConfig } from "@/lib/tenant-config/service";
import type { TenantKey } from "@/lib/tenant-config/types";

const OOTSUKI_INSTAGRAM_WEEKLY_DB_ID = "95dec78deaa84f15a0def2701754530a";
const OOTSUKI_INSTAGRAM_WEEKLY_DATA_SOURCE_ID = "3bd20a5f-88ac-40ec-900b-8a2c684e5d64";

function instagramDbId(tenant: TenantKey) {
  const env =
    tenant === "demo"
      ? (process.env.NOTION_DEMO_INSTAGRAM_WEEKLY_DB_ID || "").trim()
      : (process.env.NOTION_OOTSUKI_INSTAGRAM_WEEKLY_DB_ID || "").trim();
  return env || (tenant === "ootsuki" ? OOTSUKI_INSTAGRAM_WEEKLY_DB_ID : "");
}

function mapPage(page: {
  properties: Record<string, unknown>;
  last_edited_time?: string;
  created_time?: string;
}): InstagramWeeklySnapshot | null {
  const properties = page.properties as Parameters<typeof getPropertyText>[0];
  const fetchedAt = getPropertyDate(properties, ["取得日"]) || "";
  if (!fetchedAt) return null;

  const updatedRaw = page.last_edited_time || page.created_time || fetchedAt;
  return {
    fetchedAt: fetchedAt.length === 10 ? `${fetchedAt}T12:00:00.000Z` : fetchedAt,
    updatedAt: updatedRaw,
    views30: getPropertyNumber(properties, ["閲覧数30日"]) ?? null,
    viewsFollowerPct: getPropertyNumber(properties, ["閲覧_フォロワー率"]) ?? null,
    viewsNonFollowerPct: getPropertyNumber(properties, ["閲覧_非フォロワー率"]) ?? null,
    viewers: getPropertyNumber(properties, ["閲覧者数"]) ?? null,
    interactions: getPropertyNumber(properties, ["インタラクション"]) ?? null,
    interactionsFollowerPct: getPropertyNumber(properties, ["インタラクション_フォロワー率"]) ?? null,
    interactionsNonFollowerPct: getPropertyNumber(properties, ["インタラクション_非フォロワー率"]) ?? null,
    accountsEngaged: getPropertyNumber(properties, ["アクションアカウント"]) ?? null,
    profileViews: getPropertyNumber(properties, ["プロフィールアクセス"]) ?? null,
    externalLinkTaps: getPropertyNumber(properties, ["外部リンクタップ"]) ?? null,
    addressTaps: getPropertyNumber(properties, ["住所タップ"]) ?? null,
    followers: getPropertyNumber(properties, ["フォロワー"]) ?? null,
    postViewPct: getPropertyNumber(properties, ["投稿閲覧率"]) ?? null,
    reelViewPct: getPropertyNumber(properties, ["リール閲覧率"]) ?? null,
    storyViewPct: getPropertyNumber(properties, ["ストーリーズ閲覧率"]) ?? null,
    postDatesText: getPropertyText(properties, ["投稿日リスト"]) || "",
    activeHoursText: getPropertyText(properties, ["アクティブ時間帯"]) || "",
    source: getPropertyText(properties, ["ソース"]) || "Notion Instagram週次",
  };
}

async function loadFromNotion(tenant: TenantKey): Promise<InstagramWeeklyPair | null> {
  const databaseId = instagramDbId(tenant);
  if (!databaseId) return null;

  const config = await getTenantNotionConfig(tenant);
  if (!config.notionToken) return null;

  let pages = await queryDatabaseAllWithToken(config.notionToken, databaseId, {}).catch(() => null);
  if ((!pages || pages.length === 0) && tenant === "ootsuki") {
    pages = await queryDatabaseAllWithToken(config.notionToken, OOTSUKI_INSTAGRAM_WEEKLY_DATA_SOURCE_ID, {}).catch(() => null);
  }
  if (!pages || pages.length === 0) {
    console.warn("[os] Instagram週次DBから行を取得できませんでした。ai-company の接続を確認してください:", databaseId);
    return null;
  }

  const rows = pages
    .map(mapPage)
    .filter((row): row is InstagramWeeklySnapshot => Boolean(row))
    .sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt));

  if (rows.length === 0) return null;
  return { latest: rows[0], previous: rows[1] ?? null };
}

/** API が未接続の間は Notion の最新2行を読む。 */
export async function loadInstagramWeeklyPair(tenant: TenantKey): Promise<InstagramWeeklyPair | null> {
  const fromApi = await loadInstagramWeeklyFromApi(tenant);
  if (fromApi) return { latest: fromApi, previous: null };
  return loadFromNotion(tenant);
}
