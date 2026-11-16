import assert from "node:assert/strict";
import test from "node:test";
import {
  marketingMetricsFromGrokPayload,
  validateInstagramGrokBody,
} from "../lib/marketing/instagram-grok-map";

test("validateInstagramGrokBody accepts marketing command metrics", () => {
  const body = validateInstagramGrokBody({
    tenant: "ootsuki",
    period: { start: "2026-08-02", end: "2026-09-01" },
    metrics: {
      reach: 1582,
      views: 15000,
      accounts_engaged: 94,
      profile_views: 319,
      follower_count: 730,
      non_follower_reach_rate: 23.6,
      engagement_rate: 5.94,
      reels_ratio: 8.2,
    },
  });
  assert.equal(body.tenant, "ootsuki");
  assert.equal(body.metrics.reach, 1582);
});

test("marketingMetricsFromGrokPayload maps dashboard labels", () => {
  const channel = marketingMetricsFromGrokPayload({
    captured_at: "2026-11-16",
    period: { start: "2026-08-02", end: "2026-09-01" },
    metrics: { reach: 1582, views: 15000 },
  });
  assert.equal(channel.channel, "instagram");
  assert.equal(channel.source, "Grok Bot → Notion Instagram週次");
  assert.equal(channel.metrics.find((item) => item.key === "reach")?.value, 1582);
  assert.equal(channel.metrics.find((item) => item.key === "views")?.value, 15000);
});