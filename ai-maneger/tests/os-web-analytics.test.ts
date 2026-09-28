import assert from "node:assert/strict";
import test from "node:test";
import { scrubUnconnectedSamples } from "../lib/os/live-mode";
import { applyNotionSales } from "../lib/os/sales-kpis";
import { applyWebAnalyticsOverlays, parseRankDropLines } from "../lib/os/web-analytics";
import { osSampleData } from "../mock/os-sample";
import type { KpiSnapshotEntry } from "../types/ootsuki";

const gscText = `・富士市 夕食　74／15／0
・富士市 餃子　69／28／0
・テイクアウト 近く　57／20／0
・富士市居酒屋おすすめ　122／85／0
・富士市 夕飯 おすすめ　62／31／0`;

test("順位低下テキストをパースする", () => {
  const rows = parseRankDropLines(gscText);
  assert.equal(rows.length, 5);
  assert.equal(rows[0]?.query, "富士市 夕食");
  assert.equal(rows[0]?.current, 74);
  assert.equal(rows[0]?.previous, 15);
});

test("Grok Bot が入れた GSC/GA4 の数字を SEO と GA4 パネルに載せる", () => {
  const bundle = {
    gsc: {
      target: "gsc" as const,
      weekStart: "2026-09-19",
      weekEnd: "2026-09-25",
      site: "https://fuji-ootsuki.com/",
      source: "Grok Botがサーチコンソールを確認",
      fetchedAt: "2026-09-28T12:00:00.000Z",
      clicks: 253,
      impressions: 7711,
      avgPosition: 11.4,
      prevClicks: 272,
      prevImpressions: 7949,
      prevAvgPosition: 10.6,
      rankDropsText: gscText,
    },
    ga4: {
      target: "ga4" as const,
      weekStart: "2026-09-22",
      weekEnd: "2026-09-28",
      site: "https://fuji-ootsuki.com/",
      source: "Grok Botがアナリティクスを確認",
      fetchedAt: "2026-09-28T12:00:00.000Z",
      sessions: 455,
      users: 394,
      menuViews: 135,
      telTaps: 0,
      prevSessions: 500,
      prevUsers: 438,
      prevMenuViews: 111,
      prevTelTaps: 2,
    },
  };

  const entry = (date: string, sales: number, customers: number): KpiSnapshotEntry => ({
    id: date,
    title: date,
    date,
    weekStart: "",
    weekEnd: "",
    sales,
    customers,
    averageSpend: customers > 0 ? sales / customers : 0,
    grossMarginRate: 0,
    grossProfit: 0,
    lineRegistrations: 0,
    lineVisits: 0,
    returnsAmount: 0,
    discountAmount: 0,
    notes: "",
    paymentMemo: "",
    source: "test",
    createdAt: `${date}T00:00:00.000Z`,
  });

  const live = applyNotionSales(osSampleData, [entry("2026-09-28", 90_950, 50)], new Date("2026-09-29T03:00:00.000Z"));
  const scrubbed = scrubUnconnectedSamples(live);
  const result = applyWebAnalyticsOverlays(scrubbed, bundle);

  const seo = result.panels.find((panel) => panel.key === "seo");
  assert.equal(seo?.metrics.find((metric) => metric.key === "cl")?.value, "253");
  assert.equal(seo?.metrics.find((metric) => metric.key === "im")?.value, "7,711");
  assert.equal(seo?.metrics.find((metric) => metric.key === "pos")?.value, "11.4");
  assert.equal(seo?.metrics.find((metric) => metric.key === "drop")?.value, "5件");
  assert.equal(seo?.metrics.find((metric) => metric.key === "cl")?.origin, "actual");
  assert.match(seo?.findings.find((item) => item.id === "gsc-rank-drop")?.title ?? "", /富士市 夕食/);

  const ga4 = result.panels.find((panel) => panel.key === "ga4");
  assert.equal(ga4?.metrics.find((metric) => metric.key === "s")?.value, "455");
  assert.equal(ga4?.metrics.find((metric) => metric.key === "u")?.value, "394");
  assert.equal(ga4?.metrics.find((metric) => metric.key === "menu")?.value, "135");
  assert.equal(ga4?.metrics.find((metric) => metric.key === "tel")?.value, "0");

  assert.equal(result.connectors.find((connector) => connector.key === "gsc")?.status, "grok_bot");
  assert.equal(result.connectors.find((connector) => connector.key === "ga4")?.status, "grok_bot");
  assert.equal(result.grokBots.find((bot) => bot.key === "search_console_bot")?.state, "ok");
});
