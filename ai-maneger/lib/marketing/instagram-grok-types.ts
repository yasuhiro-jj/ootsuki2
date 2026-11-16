import type { TenantKey } from "@/lib/tenant-config/types";

export type InstagramGrokIngestMetrics = {
  reach?: number;
  views?: number;
  accounts_engaged?: number;
  interactions?: number;
  profile_views?: number;
  follower_count?: number;
  non_follower_reach_rate?: number;
  views_follower_pct?: number;
  engagement_rate?: number;
  reels_ratio?: number;
  post_view_pct?: number;
  story_view_pct?: number;
};

export type InstagramGrokIngestBody = {
  tenant?: TenantKey;
  captured_at?: string;
  period?: { start?: string; end?: string };
  metrics: InstagramGrokIngestMetrics;
  post_dates?: string[];
  active_hours?: string;
  note?: string;
};