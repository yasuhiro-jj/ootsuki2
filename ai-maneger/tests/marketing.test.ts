import assert from "node:assert/strict";
import test from "node:test";
import { getMarketingActionDestinations } from "../lib/marketing/action-service";
import { formatMetricsForPrompt } from "../lib/marketing/metrics";
import type { MarketingAction, MarketingChannelMetrics, MarketingStore } from "../types/marketing";

test("formatMetricsForPrompt keeps unavailable metrics as not fetched instead of zero", () => {
  const snapshot: MarketingChannelMetrics[] = [
    {
      channel: "instagram",
      label: "Instagram",
      status: "connected",
      source: "Instagram Internal API",
      fetchedAt: "2026-08-30T00:40:00.000Z",
      metrics: [
        { key: "reach", label: "Reach", value: 12840, previousValue: 10844, deltaPercent: 18.4 },
        { key: "profile_views", label: "Profile views" },
      ],
    },
  ];

  const prompt = formatMetricsForPrompt(snapshot);
  assert.match(prompt, /Reach: 12840人?|\bReach: 12840/);
  assert.match(prompt, /前期間比 \+18\.4%/);
  assert.match(prompt, /Profile views: 未取得/);
});

test("getMarketingActionDestinations uses action layer and filters by target channel", () => {
  const now = "2026-08-30T00:00:00.000Z";
  const store: MarketingStore = {
    id: "store-1",
    tenantKey: "ootsuki",
    name: "食事処おおつき",
    instagramAppUrl: "https://instagram-app.example/internal",
    gbpAppUrl: "https://gbp-app.example/internal",
    canvaAppUrl: "https://canva-app.example/internal",
    createdAt: now,
    updatedAt: now,
  };
  const action: MarketingAction = {
    id: "action-1",
    tenantKey: "ootsuki",
    storeId: "store-1",
    title: "宴会料理リール",
    reason: "非フォロワー到達を増やすため",
    evidence: [],
    targetChannel: "instagram",
    contentTheme: "宴会",
    priority: "high",
    targetKpi: "Instagram reach",
    recommendedAction: "リールを投稿する",
    status: "approved",
    approvalStatus: "approved",
    metricsSnapshot: [],
    evaluation: null,
    createdAt: now,
    updatedAt: now,
  };

  const destinations = getMarketingActionDestinations(action, store);
  assert.deepEqual(
    destinations.map((item) => item.key),
    ["canva", "instagram"],
  );
  assert.equal(destinations[0].mode, "external_app_redirect");
  assert.match(destinations[1].href, /storeId=store-1/);
});
