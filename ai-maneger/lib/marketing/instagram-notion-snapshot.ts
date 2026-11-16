import { Client } from "@notionhq/client";
import {
  getPropertyDate,
  getPropertyNumber,
  getPropertyText,
  queryDatabaseAllWithToken,
} from "@/lib/notion/client";
import { marketingMetricsFromGrokPayload, type InstagramGrokPersistedRow } from "@/lib/marketing/instagram-grok-map";
import type { InstagramGrokIngestBody } from "@/lib/marketing/instagram-grok-types";
import type { MarketingChannelMetrics } from "@/types/marketing";
import { getTenantNotionConfig } from "@/lib/tenant-config/service";
import type { TenantKey } from "@/lib/tenant-config/types";

const OOTSUKI_INSTAGRAM_WEEKLY_DB_ID = "95dec78deaa84f15a0def2701754530a";
const GROK_SOURCE_LABEL = "Grok Bot";

function instagramDbId(tenant: TenantKey) {
  const env =
    tenant === "demo"
      ? (process.env.NOTION_DEMO_INSTAGRAM_WEEKLY_DB_ID || "").trim()
      : (process.env.NOTION_OOTSUKI_INSTAGRAM_WEEKLY_DB_ID || "").trim();
  return env || (tenant === "ootsuki" ? OOTSUKI_INSTAGRAM_WEEKLY_DB_ID : "");
}

function todayJstDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
}

function parsePersistedRow(page: {
  id: string;
  properties: Record<string, unknown>;
  last_edited_time?: string;
}): InstagramGrokPersistedRow | null {
  const properties = page.properties as Parameters<typeof getPropertyText>[0];
  const capturedAt = getPropertyDate(properties, ["取得日"]);
  if (!capturedAt) return null;

  const source = getPropertyText(properties, ["ソース"]) || "";
  if (!source.includes(GROK_SOURCE_LABEL)) return null;

  const periodMatch = source.match(/period=([0-9]{4}-[0-9]{2}-[0-9]{2})..([0-9]{4}-[0-9]{2}-[0-9]{2})/);

  return {
    pageId: page.id,
    capturedAt,
    updatedAt: page.last_edited_time || capturedAt,
    periodStart: periodMatch?.[1],
    periodEnd: periodMatch?.[2],
    metrics: {
      reach: getPropertyNumber(properties, ["閲覧者数"]) ?? undefined,
      views: getPropertyNumber(properties, ["閲覧数30日"]) ?? undefined,
      accounts_engaged: getPropertyNumber(properties, ["アクションアカウント"]) ?? undefined,
      profile_views: getPropertyNumber(properties, ["プロフィールアクセス"]) ?? undefined,
      follower_count: getPropertyNumber(properties, ["フォロワー"]) ?? undefined,
      non_follower_reach_rate: getPropertyNumber(properties, ["閲覧_非フォロワー率"]) ?? undefined,
      engagement_rate: getPropertyNumber(properties, ["エンゲージメント率"]) ?? undefined,
      reels_ratio: getPropertyNumber(properties, ["リール閲覧率"]) ?? undefined,
    },
    source,
  };
}

export async function loadLatestInstagramGrokMetrics(tenant: TenantKey): Promise<MarketingChannelMetrics | null> {
  const databaseId = instagramDbId(tenant);
  if (!databaseId) return null;

  const config = await getTenantNotionConfig(tenant);
  if (!config.notionToken) return null;

  const pages = await queryDatabaseAllWithToken(config.notionToken, databaseId, {}).catch(() => null);
  if (!pages?.length) return null;

  const rows = pages
    .map(parsePersistedRow)
    .filter((row): row is InstagramGrokPersistedRow => Boolean(row))
    .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt));

  const latest = rows[0];
  if (!latest) return null;

  return marketingMetricsFromGrokPayload({
    captured_at: latest.capturedAt,
    period: { start: latest.periodStart, end: latest.periodEnd },
    metrics: latest.metrics,
    note: latest.source,
  });
}

export async function saveInstagramGrokMetricsToNotion(
  tenant: TenantKey,
  body: InstagramGrokIngestBody,
): Promise<{ pageId: string; url?: string }> {
  const databaseId = instagramDbId(tenant);
  if (!databaseId) {
    throw new Error("NOTION_OOTSUKI_INSTAGRAM_WEEKLY_DB_ID が未設定です。");
  }

  const config = await getTenantNotionConfig(tenant);
  if (!config.notionToken) {
    throw new Error("Notion API トークンが未設定です。");
  }

  const capturedAt = (body.captured_at || todayJstDate()).slice(0, 10);
  const period = body.period || {};
  const metrics = body.metrics || {};
  const periodLabel =
    period.start && period.end ? ` (${period.start.slice(0, 10)}〜${period.end.slice(0, 10)})` : "";
  const title = `${capturedAt} Grok Bot Instagram${periodLabel}`.slice(0, 2000);
  const sourceNote = [
  GROK_SOURCE_LABEL,
    period.start && period.end ? `period=${period.start.slice(0, 10)}..${period.end.slice(0, 10)}` : "",
    body.note?.trim() || "",
  ]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 2000);

  const properties: Record<string, unknown> = {
    Name: { title: [{ text: { content: title } }] },
    取得日: { date: { start: capturedAt } },
    ソース: { rich_text: [{ text: { content: sourceNote } }] },
  };

  const numberFields: Array<[keyof typeof metrics, string]> = [
    ["reach", "閲覧者数"],
    ["views", "閲覧数30日"],
    ["accounts_engaged", "アクションアカウント"],
    ["profile_views", "プロフィールアクセス"],
    ["follower_count", "フォロワー"],
    ["non_follower_reach_rate", "閲覧_非フォロワー率"],
    ["engagement_rate", "エンゲージメント率"],
    ["reels_ratio", "リール閲覧率"],
  ];

  for (const [metricKey, notionKey] of numberFields) {
    const value = metrics[metricKey];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (notionKey === "エンゲージメント率") continue;
    properties[notionKey] = { number: value };
  }

  if (body.post_dates?.length) {
    properties["投稿日リスト"] = {
      rich_text: [{ text: { content: body.post_dates.join(", ").slice(0, 2000) } }],
    };
  }
  if (body.active_hours?.trim()) {
    properties["アクティブ時間帯"] = {
      rich_text: [{ text: { content: body.active_hours.trim().slice(0, 2000) } }],
    };
  }

  const notion = new Client({ auth: config.notionToken });
  const page = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: properties as Parameters<Client["pages"]["create"]>[0]["properties"],
  });

  return { pageId: page.id, url: "url" in page && typeof page.url === "string" ? page.url : undefined };
}