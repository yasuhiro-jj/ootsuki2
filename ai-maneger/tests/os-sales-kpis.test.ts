import assert from "node:assert/strict";
import test from "node:test";
import { applyNotionSales } from "../lib/os/sales-kpis";
import { osSampleData } from "../mock/os-sample";
import type { KpiSnapshotEntry } from "../types/ootsuki";

function entry(date: string, sales: number, customers: number, previousSales?: number): KpiSnapshotEntry {
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
    previousSales,
    returnsAmount: 0,
    discountAmount: 0,
    notes: "",
    paymentMemo: "",
    source: "test",
    createdAt: `${date}T00:00:00.000Z`,
  };
}

const now = new Date("2026-09-28T03:00:00.000Z");

test("日次が無いときはサンプルのKPIを残す", () => {
  const result = applyNotionSales(osSampleData, [], now);
  assert.equal(result.kpis.find((metric) => metric.key === "sales_yesterday")?.value, "¥103,837");
});

test("昨日と月累計と前年比をNotionの日次から埋める", () => {
  const result = applyNotionSales(
    osSampleData,
    [
      entry("2026-09-01", 100_000, 50, 80_000),
      entry("2026-09-27", 103_837, 51, 90_000),
      entry("2026-09-28", 10_000, 5, 0),
    ],
    now,
  );
  const yesterday = result.kpis.find((metric) => metric.key === "sales_yesterday");
  const month = result.kpis.find((metric) => metric.key === "sales_month");
  const yoy = result.kpis.find((metric) => metric.key === "sales_yoy");
  const customers = result.kpis.find((metric) => metric.key === "customers");
  assert.equal(yesterday?.value, "¥103,837");
  assert.equal(yesterday?.sub, "9/27");
  assert.equal(yesterday?.origin, "actual");
  assert.equal(month?.value, "¥213,837");
  assert.equal(month?.origin, "actual");
  assert.equal(customers?.value, "51人");
  assert.equal(customers?.sub, "9月累計 106人");
  assert.equal(yoy?.origin, "derived");
  assert.equal(result.kpis.find((metric) => metric.key === "drink_ratio")?.origin, "sample");
  assert.equal(result.isSample, true);
  const salesPanel = result.panels.find((panel) => panel.key === "sales_pos");
  assert.equal(salesPanel?.metrics.find((metric) => metric.key === "m")?.value, "¥213,837");
});

test("昨日の行が無いときは最新日として表示する", () => {
  const result = applyNotionSales(osSampleData, [entry("2026-09-20", 50_000, 20)], now);
  const yesterday = result.kpis.find((metric) => metric.key === "sales_yesterday");
  assert.equal(yesterday?.label, "売上（最新日）");
  assert.equal(yesterday?.sub, "9/20");
  assert.equal(yesterday?.value, "¥50,000");
});
