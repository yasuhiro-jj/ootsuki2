import type { MarketingChannelMetrics, MarketingMetric, MarketingStore } from "@/types/marketing";

const CACHE_TTL_MS = Number(process.env.MARKETING_METRICS_CACHE_TTL_MS || 30 * 60 * 1000);

type MetricRecord = Record<string, unknown>;

type InternalMetricsResponse = {
  period?: { start?: string; end?: string };
  metrics?: MetricRecord;
  previousMetrics?: MetricRecord;
  source?: string;
  data?: {
    metrics?: MetricRecord;
    previousMetrics?: MetricRecord;
    period?: { start?: string; end?: string };
  };
};

const cache = new Map<string, { expiresAt: number; snapshot: MarketingChannelMetrics[] }>();

function nowIso() {
  return new Date().toISOString();
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function periodOrDefault(period?: { start?: string; end?: string }) {
  return {
    start: period?.start || daysAgoIso(30),
    end: period?.end || daysAgoIso(0),
  };
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function metric(
  key: string,
  label: string,
  currentRaw: unknown,
  unit?: string,
  previousRaw?: unknown,
): MarketingMetric {
  const value = toNumber(currentRaw);
  const previousValue = toNumber(previousRaw);
  const absoluteChange =
    typeof value === "number" && typeof previousValue === "number" ? value - previousValue : undefined;
  const deltaPercent =
    typeof absoluteChange === "number" && typeof previousValue === "number" && previousValue !== 0
      ? (absoluteChange / previousValue) * 100
      : undefined;
  return { key, label, value, unit, previousValue, absoluteChange, deltaPercent };
}

function joinUrl(base: string, path: string) {
  if (!base) return "";
  try {
    return new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : `${base}/`).toString();
  } catch {
    return "";
  }
}

async function fetchInternalMetrics(params: {
  baseUrl?: string;
  apiKey?: string;
  path: string;
  store: MarketingStore;
  service: "instagram" | "gbp";
}): Promise<InternalMetricsResponse | null> {
  const baseUrl = params.baseUrl?.trim();
  const apiKey = params.apiKey?.trim();
  if (!baseUrl || !apiKey) return null;

  const url = joinUrl(baseUrl, params.path);
  if (!url) return null;
  const parsed = new URL(url);
  parsed.searchParams.set("storeId", params.store.id);
  if (params.service === "instagram" && params.store.instagramAccountId) {
    // instagramAccountId には Instagram 連携アプリ側の tenant_key（マルチテナント識別子）を保存している
    parsed.searchParams.set("instagramAccountId", params.store.instagramAccountId);
    parsed.searchParams.set("tenant_key", params.store.instagramAccountId);
  }
  if (params.service === "gbp" && params.store.gbpLocationId) {
    parsed.searchParams.set("gbpLocationId", params.store.gbpLocationId);
  }

  const response = await fetch(parsed.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`internal API returned ${response.status}`);
  }

  return (await response.json()) as InternalMetricsResponse;
}

function normalizeInstagramMetrics(response: InternalMetricsResponse | null): MarketingChannelMetrics {
  const metrics = response?.data?.metrics || response?.metrics || {};
  const previous = response?.data?.previousMetrics || response?.previousMetrics || {};
  const period = periodOrDefault(response?.data?.period || response?.period);
  return {
    channel: "instagram",
    label: "Instagram",
    status: response ? "connected" : "not_configured",
    source: !response
      ? "not_configured"
      : response.source === "paste_lab"
        ? "Instagram インサイト診断ラボ（手動）"
        : "Instagram Internal API",
    fetchedAt: nowIso(),
    period,
    metrics: [
      metric("reach", "Reach", metrics.reach, "人", previous.reach),
      metric("views", "Views", metrics.views, "回", previous.views),
      metric("accounts_engaged", "Accounts engaged", metrics.accounts_engaged, "件", previous.accounts_engaged),
      metric("profile_views", "Profile views", metrics.profile_views, "回", previous.profile_views),
      metric("follower_count", "Follower count", metrics.follower_count, "人", previous.follower_count),
      metric(
        "non_follower_reach_rate",
        "Non-follower reach rate",
        metrics.non_follower_reach_rate ?? metrics.nonFollowerReachRate,
        "%",
        previous.non_follower_reach_rate ?? previous.nonFollowerReachRate,
      ),
      metric("engagement_rate", "Engagement rate", metrics.engagement_rate ?? metrics.engagementRate, "%", previous.engagement_rate ?? previous.engagementRate),
      metric("reels_ratio", "Reels ratio", metrics.reels_ratio ?? metrics.reelsRatio, "%", previous.reels_ratio ?? previous.reelsRatio),
    ],
  };
}

function normalizeGBPMetrics(response: InternalMetricsResponse | null): MarketingChannelMetrics {
  const metrics = response?.data?.metrics || response?.metrics || {};
  const previous = response?.data?.previousMetrics || response?.previousMetrics || {};
  const period = periodOrDefault(response?.data?.period || response?.period);
  const impressions = metrics.impressions ?? metrics.business_impressions ?? metrics.businessImpressions;
  const previousImpressions = previous.impressions ?? previous.business_impressions ?? previous.businessImpressions;
  return {
    channel: "gbp",
    label: "Google Business Profile",
    status: response ? "connected" : "not_configured",
    source: response ? "GBP Internal API" : "not_configured",
    fetchedAt: nowIso(),
    period,
    metrics: [
      metric("impressions", "Business impressions", impressions, "回", previousImpressions),
      metric("search_impressions", "Search impressions", metrics.search_impressions ?? metrics.searchImpressions, "回", previous.search_impressions ?? previous.searchImpressions),
      metric("maps_impressions", "Maps impressions", metrics.maps_impressions ?? metrics.mapsImpressions, "回", previous.maps_impressions ?? previous.mapsImpressions),
      metric("website_clicks", "Website clicks", metrics.website_clicks ?? metrics.websiteClicks, "回", previous.website_clicks ?? previous.websiteClicks),
      metric("call_clicks", "Call clicks", metrics.call_clicks ?? metrics.calls ?? metrics.callClicks, "回", previous.call_clicks ?? previous.calls ?? previous.callClicks),
      metric("direction_requests", "Direction requests", metrics.direction_requests ?? metrics.directionRequests, "回", previous.direction_requests ?? previous.directionRequests),
      metric("review_count", "Review count", metrics.review_count ?? metrics.reviewCount, "件", previous.review_count ?? previous.reviewCount),
      metric("average_rating", "Average rating", metrics.average_rating ?? metrics.averageRating, "", previous.average_rating ?? previous.averageRating),
    ],
  };
}

function fallbackMetricSnapshot(store?: MarketingStore): MarketingChannelMetrics[] {
  const fetchedAt = nowIso();
  const period = periodOrDefault();
  return [
    {
      channel: "instagram",
      label: "Instagram",
      status: store?.instagramAccountId || process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN ? "manual" : "not_configured",
      source: "ai_manager_env_fallback",
      fetchedAt,
      period,
      metrics: [
        metric("reach", "Reach", process.env.MARKETING_INSTAGRAM_REACH, "人"),
        metric("views", "Views", process.env.MARKETING_INSTAGRAM_VIEWS, "回"),
        metric("accounts_engaged", "Accounts engaged", process.env.MARKETING_INSTAGRAM_ENGAGEMENTS, "件"),
        metric("profile_views", "Profile views", process.env.MARKETING_INSTAGRAM_PROFILE_VIEWS, "回"),
        metric("follower_count", "Follower count", process.env.MARKETING_INSTAGRAM_FOLLOWER_COUNT, "人"),
      ],
    },
    {
      channel: "gbp",
      label: "Google Business Profile",
      status: store?.gbpLocationId || process.env.GBP_API_ACCESS_TOKEN ? "manual" : "not_configured",
      source: "ai_manager_env_fallback",
      fetchedAt,
      period,
      metrics: [
        metric("impressions", "Business impressions", process.env.MARKETING_GBP_IMPRESSIONS, "回"),
        metric("search_impressions", "Search impressions", process.env.MARKETING_GBP_SEARCH_VIEWS, "回"),
        metric("maps_impressions", "Maps impressions", process.env.MARKETING_GBP_MAP_VIEWS, "回"),
        metric("website_clicks", "Website clicks", process.env.MARKETING_GBP_WEBSITE_CLICKS, "回"),
        metric("call_clicks", "Call clicks", process.env.MARKETING_GBP_CALLS, "回"),
        metric("direction_requests", "Direction requests", process.env.MARKETING_GBP_DIRECTION_REQUESTS, "回"),
        metric("review_count", "Review count", process.env.MARKETING_GBP_REVIEW_COUNT, "件"),
        metric("average_rating", "Average rating", process.env.MARKETING_GBP_AVERAGE_RATING),
      ],
    },
  ];
}

function cacheKey(store?: MarketingStore) {
  return `marketing-metrics:${store?.tenantKey || "unknown"}:${store?.id || "default"}`;
}

export async function getInstagramMetrics(store: MarketingStore): Promise<MarketingChannelMetrics> {
  try {
    const response = await fetchInternalMetrics({
      baseUrl: process.env.INSTAGRAM_INTERNAL_API_URL,
      apiKey: process.env.INSTAGRAM_INTERNAL_API_KEY,
      path: process.env.INSTAGRAM_INTERNAL_INSIGHTS_PATH || "/api/internal/insights",
      store,
      service: "instagram",
    });
    return normalizeInstagramMetrics(response);
  } catch (error) {
    const fallback = fallbackMetricSnapshot(store)[0];
    return {
      ...fallback,
      status: "not_configured",
      source: "Instagram Internal API",
      errorMessage: error instanceof Error ? error.message : "Instagram data fetch failed",
    };
  }
}

export async function getGBPMetrics(store: MarketingStore): Promise<MarketingChannelMetrics> {
  try {
    const response = await fetchInternalMetrics({
      baseUrl: process.env.GBP_INTERNAL_API_URL,
      apiKey: process.env.GBP_INTERNAL_API_KEY,
      path: process.env.GBP_INTERNAL_INSIGHTS_PATH || "/api/internal/performance",
      store,
      service: "gbp",
    });
    return normalizeGBPMetrics(response);
  } catch (error) {
    const fallback = fallbackMetricSnapshot(store)[1];
    return {
      ...fallback,
      status: "not_configured",
      source: "GBP Internal API",
      errorMessage: error instanceof Error ? error.message : "GBP data fetch failed",
    };
  }
}

export async function getCombinedMarketingMetrics(store?: MarketingStore): Promise<MarketingChannelMetrics[]> {
  if (!store) return fallbackMetricSnapshot();
  const key = cacheKey(store);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.snapshot;

  const [instagram, gbp] = await Promise.all([getInstagramMetrics(store), getGBPMetrics(store)]);
  const snapshot = [instagram, gbp];
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, snapshot });
  return snapshot;
}

export async function getMarketingMetricsSnapshot(store?: MarketingStore): Promise<MarketingChannelMetrics[]> {
  return getCombinedMarketingMetrics(store);
}

export function formatMetricsForPrompt(snapshot: MarketingChannelMetrics[]) {
  return snapshot
    .map((channel) => {
      const rows = channel.metrics
        .map((item) => {
          const value = typeof item.value === "number" ? `${item.value}${item.unit || ""}` : "未取得";
          const compare =
            typeof item.deltaPercent === "number"
              ? ` (前期間比 ${item.deltaPercent >= 0 ? "+" : ""}${item.deltaPercent.toFixed(1)}%)`
              : "";
          return `- ${item.label}: ${value}${compare}`;
        })
        .join("\n");
      const period = channel.period ? `period: ${channel.period.start} to ${channel.period.end}\n` : "";
      const error = channel.errorMessage ? `error: ${channel.errorMessage}\n` : "";
      return `[${channel.label}]\nsource: ${channel.source}\nfetchedAt: ${channel.fetchedAt}\n${period}${error}${rows}`;
    })
    .join("\n\n");
}
