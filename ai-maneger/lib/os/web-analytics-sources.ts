import { getPropertyDate, getPropertyNumber, getPropertyText, queryDatabaseAllWithToken } from "@/lib/notion/client";
import { getTenantNotionConfig } from "@/lib/tenant-config/service";
import type { TenantKey } from "@/lib/tenant-config/types";
import type { WebAnalyticsBundle, WebAnalyticsSnapshot } from "@/lib/os/web-analytics";

/** Grok Bot が作成した「おおつき 検索・アクセスDB」（2026-09-28 時点） */
const OOTSUKI_WEB_ANALYTICS_DB_ID = "561e7b8b967c438b84279b81116aeaa1";
const OOTSUKI_WEB_ANALYTICS_DATA_SOURCE_ID = "cae28aa9-1cb2-4386-9ab5-b82c0cd6e682";

function webAnalyticsDbId(tenant: TenantKey) {
  const env =
    tenant === "demo"
      ? (process.env.NOTION_DEMO_WEB_ANALYTICS_DB_ID || "").trim()
      : (process.env.NOTION_OOTSUKI_WEB_ANALYTICS_DB_ID || "").trim();
  return env || (tenant === "ootsuki" ? OOTSUKI_WEB_ANALYTICS_DB_ID : "");
}

function targetKind(raw: string): WebAnalyticsSnapshot["target"] | null {
  const text = raw.normalize("NFKC");
  if (text.includes("サーチコンソール") || text.toUpperCase().includes("GSC")) return "gsc";
  if (text.includes("アナリティクス") || text.toUpperCase().includes("GA4")) return "ga4";
  return null;
}

function mapPage(page: { properties: Record<string, unknown>; created_time?: string; last_edited_time?: string }): WebAnalyticsSnapshot | null {
  const properties = page.properties as Parameters<typeof getPropertyText>[0];
  const kind = targetKind(getPropertyText(properties, ["対象", "種別"]));
  if (!kind) return null;
  const weekStart = getPropertyDate(properties, ["週開始"]) || "";
  const weekEnd = getPropertyDate(properties, ["週終了"]) || "";
  if (!weekStart) return null;

  const fetchedAt =
    getPropertyDate(properties, ["取得日", "登録日"]) ||
    (page.last_edited_time || page.created_time || new Date().toISOString());

  const base = {
    target: kind,
    weekStart,
    weekEnd,
    site: getPropertyText(properties, ["サイト", "プロパティ"]) || "",
    source: getPropertyText(properties, ["ソース", "データソース"]) || "",
    fetchedAt: fetchedAt.length === 10 ? `${fetchedAt}T12:00:00.000Z` : fetchedAt,
  };

  if (kind === "gsc") {
    return {
      ...base,
      clicks: getPropertyNumber(properties, ["クリック"]),
      impressions: getPropertyNumber(properties, ["表示回数"]),
      avgPosition: getPropertyNumber(properties, ["平均順位", "平均掲載順位"]),
      prevClicks: getPropertyNumber(properties, ["前週クリック", "前の7日クリック"]),
      prevImpressions: getPropertyNumber(properties, ["前週表示回数", "前の7日表示回数"]),
      prevAvgPosition: getPropertyNumber(properties, ["前週平均順位", "前の7日平均順位"]),
      rankDropsText: getPropertyText(properties, ["順位が落ちた検索語", "順位低下クエリ"]),
    };
  }

  return {
    ...base,
    sessions: getPropertyNumber(properties, ["セッション"]),
    users: getPropertyNumber(properties, ["ユーザー", "アクティブユーザー"]),
    menuViews: getPropertyNumber(properties, ["メニュー閲覧", "メニューページビュー"]),
    telTaps: getPropertyNumber(properties, ["電話タップ", "cv_tel"]),
    prevSessions: getPropertyNumber(properties, ["前週セッション", "前の7日セッション"]),
    prevUsers: getPropertyNumber(properties, ["前週ユーザー", "前の7日ユーザー"]),
    prevMenuViews: getPropertyNumber(properties, ["前週メニュー閲覧", "前の7日メニュー閲覧"]),
    prevTelTaps: getPropertyNumber(properties, ["前週電話タップ", "前の7日電話タップ"]),
  };
}

function pickLatest(rows: WebAnalyticsSnapshot[], target: WebAnalyticsSnapshot["target"]) {
  return (
    rows
      .filter((row) => row.target === target)
      .sort((left, right) => right.weekStart.localeCompare(left.weekStart))[0] ?? null
  );
}

/** Notion「おおつき 検索・アクセスDB」から GSC / GA4 の最新週を読む。 */
export async function loadWebAnalyticsBundle(tenant: TenantKey): Promise<WebAnalyticsBundle> {
  const databaseId = webAnalyticsDbId(tenant);
  if (!databaseId) return { gsc: null, ga4: null };

  const config = await getTenantNotionConfig(tenant);
  if (!config.notionToken) return { gsc: null, ga4: null };

  let pages = await queryDatabaseAllWithToken(config.notionToken, databaseId, {}).catch(() => null);
  if ((!pages || pages.length === 0) && tenant === "ootsuki") {
    pages = await queryDatabaseAllWithToken(config.notionToken, OOTSUKI_WEB_ANALYTICS_DATA_SOURCE_ID, {}).catch(() => null);
  }
  if (!pages || pages.length === 0) {
    console.warn("[os] 検索・アクセスDBから行を取得できませんでした。NotionでDBをインテグレーションに接続しているか確認してください:", databaseId);
    return { gsc: null, ga4: null };
  }

  const rows = pages.map(mapPage).filter((row): row is WebAnalyticsSnapshot => Boolean(row));
  if (rows.length === 0) {
    console.warn("[os] 検索・アクセスDBは読めましたが、行の形式が想定と違います（対象・週開始を確認）");
  }
  return {
    gsc: pickLatest(rows, "gsc"),
    ga4: pickLatest(rows, "ga4"),
  };
}
