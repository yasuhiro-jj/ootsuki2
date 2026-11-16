import type { InstagramGrokIngestBody, InstagramGrokIngestMetrics } from "@/lib/marketing/instagram-grok-types";
import type { MarketingChannelMetrics, MarketingMetric } from "@/types/marketing";

export type InstagramGrokPersistedRow = {
  pageId: string;
  capturedAt: string;
  updatedAt: string;
  periodStart?: string;
  periodEnd?: string;
  metrics: InstagramGrokIngestMetrics;
  source: string;
};

function metric(
  key: string,
  label: string,
  currentRaw: unknown,
  unit?: string,
  previousRaw?: unknown,
): MarketingMetric {
  const value = typeof currentRaw === "number" && Number.isFinite(currentRaw) ? currentRaw : undefined;
  const previousValue = typeof previousRaw === "number" && Number.isFinite(previousRaw) ? previousRaw : undefined;
  const absoluteChange =
    typeof value === "number" && typeof previousValue === "number" ? value - previousValue : undefined;
  const deltaPercent =
    typeof absoluteChange === "number" && typeof previousValue === "number" && previousValue !== 0
      ? (absoluteChange / previousValue) * 100
      : undefined;
  return { key, label, value, unit, previousValue, absoluteChange, deltaPercent };
}

function defaultPeriod() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function marketingMetricsFromGrokPayload(body: InstagramGrokIngestBody): MarketingChannelMetrics {
  const period = {
    start: body.period?.start?.slice(0, 10) || defaultPeriod().start,
    end: body.period?.end?.slice(0, 10) || defaultPeriod().end,
  };
  const metrics = body.metrics || {};
  const fetchedAt = body.captured_at || new Date().toISOString();

  return {
    channel: "instagram",
    label: "Instagram",
    status: "connected",
    source: "Grok Bot → Notion Instagram週次",
    fetchedAt,
    period,
    metrics: [
      metric("reach", "Reach", metrics.reach, "人"),
      metric("views", "Views", metrics.views, "回"),
      metric("accounts_engaged", "Accounts engaged", metrics.accounts_engaged, "件"),
      metric("profile_views", "Profile views", metrics.profile_views, "回"),
      metric("follower_count", "Follower count", metrics.follower_count, "人"),
      metric("non_follower_reach_rate", "Non-follower reach rate", metrics.non_follower_reach_rate, "%"),
      metric("engagement_rate", "Engagement rate", metrics.engagement_rate, "%"),
      metric("reels_ratio", "Reels ratio", metrics.reels_ratio, "%"),
    ],
  };
}

export function validateInstagramGrokBody(body: unknown): InstagramGrokIngestBody {
  if (!body || typeof body !== "object") {
    throw new Error("JSON オブジェクトが必要です。");
  }
  const record = body as Record<string, unknown>;
  const metrics = record.metrics;
  if (!metrics || typeof metrics !== "object") {
    throw new Error("metrics オブジェクトが必要です。");
  }
  const typedMetrics = metrics as InstagramGrokIngestMetrics;
  const hasAny = Object.values(typedMetrics).some((value) => typeof value === "number" && Number.isFinite(value));
  if (!hasAny) {
    throw new Error("metrics に数値が1つ以上必要です。");
  }

  const tenant = record.tenant;
  const normalizedTenant =
    tenant === "demo" || tenant === "ootsuki" ? tenant : ("ootsuki" as const);

  return {
    tenant: normalizedTenant,
    captured_at: typeof record.captured_at === "string" ? record.captured_at : undefined,
    period:
      record.period && typeof record.period === "object"
        ? {
            start: typeof (record.period as { start?: unknown }).start === "string"
              ? (record.period as { start: string }).start
              : undefined,
            end: typeof (record.period as { end?: unknown }).end === "string"
              ? (record.period as { end: string }).end
              : undefined,
          }
        : undefined,
    metrics: typedMetrics,
    post_dates: Array.isArray(record.post_dates)
      ? record.post_dates.filter((item): item is string => typeof item === "string")
      : undefined,
    active_hours: typeof record.active_hours === "string" ? record.active_hours : undefined,
    note: typeof record.note === "string" ? record.note : undefined,
  };
}