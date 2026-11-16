import type { TenantKey } from "@/lib/tenant-config/types";

export type InstagramGrokIngestMetrics = {
  reach?: number;
  views?: number;
  accounts_engaged?: number;
  profile_views?: number;
  follower_count?: number;
  non_follower_reach_rate?: number;
  engagement_rate?: number;
  reels_ratio?: number;
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