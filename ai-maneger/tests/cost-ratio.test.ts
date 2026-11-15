import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateMonthlySales,
  aggregateMonthlyPurchases,
  buildMonthlyCostRatios,
  calculateCostRatio,
  calculateGrossMarginRatio,
  convertToTaxIncluded,
  formatCostRatioStatus,
  isCostPurchase,
} from "../lib/cost-ratio";
import type { KpiSnapshotEntry, PurchaseEntry } from "../types/ootsuki";

function makeSalesEntry(date: string, sales: number): KpiSnapshotEntry {
  return {
    id: date,
    title: date,
    date,
    weekStart: "",
    weekEnd: "",
    sales,
    customers: 0,
    averageSpend: 0,
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
  };
}

function makePurchaseEntry(
  date: string,
  amountInclTax: number,
  accountCategory: string,
  status?: string,
): PurchaseEntry {
  return {
    id: date,
    date,
    supplier: "テスト仕入先",
    amountInclTax,
    taxCategory: "10%",
    accountCategory,
    itemName: "テスト品目",
    status,
  };
}

test("convertToTaxIncluded converts tax-excluded sales to tax-included", () => {
  assert.equal(convertToTaxIncluded(100000), 110000);
  assert.equal(convertToTaxIncluded(0), 0);
  assert.equal(Math.round(convertToTaxIncluded(123456)), 135802);
});

test("isCostPurchase returns true for cost categories (仕入高, 食材費, 飲料費)", () => {
  assert.equal(isCostPurchase(makePurchaseEntry("2026-11-01", 10000, "仕入高")), true);
  assert.equal(isCostPurchase(makePurchaseEntry("2026-11-01", 10000, "食材費")), true);
  assert.equal(isCostPurchase(makePurchaseEntry("2026-11-01", 10000, "飲料費")), true);
  assert.equal(isCostPurchase(makePurchaseEntry("2026-11-01", 10000, "消耗品費")), false);
  assert.equal(isCostPurchase(makePurchaseEntry("2026-11-01", 10000, "水道光熱費")), false);
});

test("calculateCostRatio calculates cost ratio correctly", () => {
  assert.equal(calculateCostRatio(110000, 44000).toFixed(2), "40.00");
  assert.equal(calculateCostRatio(110000, 42900).toFixed(2), "39.00");
  assert.equal(calculateCostRatio(0, 10000), 0);
});

test("calculateGrossMarginRatio calculates gross margin from cost ratio", () => {
  assert.equal(calculateGrossMarginRatio(40.0), 60.0);
  assert.equal(calculateGrossMarginRatio(39.0), 61.0);
  assert.equal(calculateGrossMarginRatio(38.0), 62.0);
});

test("aggregateMonthlySales sums sales by month", () => {
  const entries = [
    makeSalesEntry("2026-11-01", 50000),
    makeSalesEntry("2026-11-02", 60000),
    makeSalesEntry("2026-11-15", 70000),
    makeSalesEntry("2026-12-01", 80000),
  ];

  const result = aggregateMonthlySales(entries);

  assert.equal(result.get("2026-11"), 180000);
  assert.equal(result.get("2026-12"), 80000);
});

test("aggregateMonthlyPurchases sums only cost categories (仕入高, 食材費, 飲料費) by month", () => {
  const entries = [
    makePurchaseEntry("2026-11-01", 10000, "仕入高"),
    makePurchaseEntry("2026-11-05", 15000, "食材費"),
    makePurchaseEntry("2026-11-08", 8000, "飲料費"),
    makePurchaseEntry("2026-11-10", 5000, "消耗品費"),
    makePurchaseEntry("2026-12-01", 20000, "仕入高"),
  ];

  const result = aggregateMonthlyPurchases(entries);

  assert.equal(result.get("2026-11"), 33000);
  assert.equal(result.get("2026-12"), 20000);
});

test("buildMonthlyCostRatios calculates monthly cost ratios with YoY comparison", () => {
  const salesEntries = [
    makeSalesEntry("2025-11-01", 100000),
    makeSalesEntry("2025-11-02", 100000),
    makeSalesEntry("2026-11-01", 100000),
    makeSalesEntry("2026-11-02", 100000),
  ];

  const purchaseEntries = [
    makePurchaseEntry("2025-11-01", 44000, "仕入高"),
    makePurchaseEntry("2026-11-01", 42900, "仕入高"),
  ];

  const result = buildMonthlyCostRatios(salesEntries, purchaseEntries);

  assert.equal(result.length, 2);

  const current = result.find((r) => r.monthKey === "2026-11");
  assert.ok(current);
  assert.equal(current.salesExclTax, 200000);
  assert.equal(current.salesInclTax, 220000);
  assert.equal(current.purchaseAmountInclTax, 42900);
  assert.equal(current.costRatio.toFixed(2), "19.50");
  assert.equal(current.grossMarginRatio.toFixed(2), "80.50");
  assert.equal(current.targetGrossMarginRatio, 62);
  assert.equal(current.vsTarget.toFixed(2), "18.50");

  const lastYear = result.find((r) => r.monthKey === "2025-11");
  assert.ok(lastYear);
  assert.equal(lastYear.costRatio.toFixed(2), "20.00");
  assert.equal(lastYear.grossMarginRatio.toFixed(2), "80.00");
});

test("buildMonthlyCostRatios marks unavailable when data is missing", () => {
  const salesEntries = [makeSalesEntry("2026-11-01", 100000)];

  const purchaseEntries: PurchaseEntry[] = [];

  const result = buildMonthlyCostRatios(salesEntries, purchaseEntries);

  assert.equal(result.length, 1);
  const ratio = result[0];
  assert.equal(ratio.dataStatus.salesAvailable, true);
  assert.equal(ratio.dataStatus.purchaseAvailable, false);
  assert.equal(ratio.costRatio, 0);
  assert.equal(ratio.grossMarginRatio, 100);
});

test("formatCostRatioStatus returns correct status based on target comparison", () => {
  const good = {
    monthKey: "2026-11",
    salesExclTax: 100000,
    salesInclTax: 110000,
    purchaseAmountInclTax: 41800,
    costRatio: 38.0,
    grossMarginRatio: 62.0,
    targetGrossMarginRatio: 62.0,
    vsTarget: 0,
    dataStatus: { salesAvailable: true, purchaseAvailable: true },
  };

  const watch = { ...good, grossMarginRatio: 60.5, vsTarget: -1.5 };
  const urgent = { ...good, grossMarginRatio: 59.0, vsTarget: -3.0 };
  const unavailable = { ...good, dataStatus: { salesAvailable: false, purchaseAvailable: true } };

  assert.equal(formatCostRatioStatus(good), "good");
  assert.equal(formatCostRatioStatus(watch), "watch");
  assert.equal(formatCostRatioStatus(urgent), "urgent");
  assert.equal(formatCostRatioStatus(unavailable), "unavailable");
});

test("aggregateMonthlyPurchases excludes non-cost categories", () => {
  const entries = [
    makePurchaseEntry("2026-11-01", 10000, "仕入高", "確認済み"),
    makePurchaseEntry("2026-11-05", 15000, "食材費", "確認済み"),
    makePurchaseEntry("2026-11-08", 8000, "飲料費", "確認済み"),
    makePurchaseEntry("2026-11-10", 5000, "消耗品費", "確認済み"),
    makePurchaseEntry("2026-11-15", 3000, "その他", "確認済み"),
  ];

  const result = aggregateMonthlyPurchases(entries);

  assert.equal(result.get("2026-11"), 33000);
});

test("buildMonthlyCostRatios handles mixed cost categories", () => {
  const salesEntries = [makeSalesEntry("2026-11-01", 100000), makeSalesEntry("2026-11-02", 100000)];

  const purchaseEntries = [
    makePurchaseEntry("2026-11-01", 10000, "仕入高", "確認済み"),
    makePurchaseEntry("2026-11-05", 15000, "食材費", "確認済み"),
    makePurchaseEntry("2026-11-08", 8000, "飲料費", "確認済み"),
    makePurchaseEntry("2026-11-10", 5000, "消耗品費", "確認済み"),
  ];

  const result = buildMonthlyCostRatios(salesEntries, purchaseEntries);

  assert.equal(result.length, 1);
  const ratio = result[0];
  assert.equal(ratio.purchaseAmountInclTax, 33000);
  assert.equal(ratio.costRatio.toFixed(2), "15.00");
  assert.equal(ratio.grossMarginRatio.toFixed(2), "85.00");
});
