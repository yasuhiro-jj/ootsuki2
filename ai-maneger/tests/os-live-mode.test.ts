import assert from "node:assert/strict";
import test from "node:test";
import { applyOperations, scrubUnconnectedSamples } from "../lib/os/live-mode";
import { applyNotionSales } from "../lib/os/sales-kpis";
import { osSampleData } from "../mock/os-sample";
import type { KpiSnapshotEntry } from "../types/ootsuki";

function entry(date: string, sales: number, customers: number, extra: Partial<KpiSnapshotEntry> = {}): KpiSnapshotEntry {
  return {
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
    ...extra,
  };
}

const now = new Date("2026-09-28T03:00:00.000Z");

test("粗利と曜日差とLINE登録を日次から埋める", () => {
  const result = applyNotionSales(
    osSampleData,
    [
      entry("2026-09-13", 80_000, 40),
      entry("2026-09-20", 90_000, 45),
      entry("2026-09-27", 40_000, 20, { grossProfit: 20_000, lineRegistrations: 3, lineVisits: 2 }),
    ],
    now,
  );
  assert.equal(result.kpis.find((metric) => metric.key === "cost_rate")?.label, "粗利率");
  assert.equal(result.kpis.find((metric) => metric.key === "cost_rate")?.origin, "derived");
  const finding = result.panels.find((panel) => panel.key === "sales_pos")?.findings.find((item) => item.id === "sales-dow");
  assert.equal(finding?.origin, "derived");
  assert.match(finding?.title ?? "", /同じ曜日の客数/);
  const line = result.panels.find((panel) => panel.key === "line");
  assert.equal(line?.metrics.find((metric) => metric.key === "fr")?.value, "3人");
  assert.equal(line?.metrics.find((metric) => metric.key === "lv")?.value, "2人");
});

test("日次があるときはサンプルの仕事とダミー数値を外す", () => {
  const live = applyNotionSales(osSampleData, [entry("2026-09-27", 100_000, 50)], now);
  const scrubbed = scrubUnconnectedSamples(live);
  assert.equal(scrubbed.isSample, false);
  assert.equal(scrubbed.health.origin, "unavailable");
  assert.equal(scrubbed.tasks.some((task) => task.id === "t1"), true);
  assert.equal(scrubbed.tasks.some((task) => task.id === "t2"), false);
  assert.equal(scrubbed.kpis.find((metric) => metric.key === "drink_ratio")?.value, "未接続");
  assert.equal(scrubbed.kpis.find((metric) => metric.key === "sales_yesterday")?.origin, "actual");
  assert.equal(scrubbed.decisions.length, 0);
  assert.equal(scrubbed.connectors.find((connector) => connector.key === "usen")?.status, "grok_bot");
  assert.equal(scrubbed.panels.find((panel) => panel.key === "sales_pos")?.status, "grok_bot");
  assert.equal(scrubbed.grokBots.find((bot) => bot.key === "ai_manager_bot")?.state, "ok");
});

test("週次の実行項目を仕事として足す", () => {
  const result = applyOperations(
    osSampleData,
    { weekStart: "2026-09-22", weekEnd: "2026-09-28", actions: ["店頭POPを更新"], updatedAt: "2026-09-28T01:00:00.000Z" },
    2,
  );
  assert.equal(result.tasks.some((task) => task.title === "店頭POPを更新" && task.origin === "actual"), true);
  const operations = result.panels.find((panel) => panel.key === "operations");
  assert.equal(operations?.metrics.find((metric) => metric.key === "wk")?.value, "1件");
  assert.equal(operations?.metrics.find((metric) => metric.key === "memo")?.value, "2件");
});
