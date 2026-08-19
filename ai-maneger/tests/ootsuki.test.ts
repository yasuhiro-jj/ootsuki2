import assert from "node:assert/strict";
import test from "node:test";
import {
  canRetryCsvSave,
  nextCsvSaveChunkSize,
  remainingRowsAfterBatch,
  uniqueWeekStarts,
} from "../lib/csv-save";
import {
  aggregateMonth,
  aggregateMonthBusinessDays,
  aggregateMonthToDate,
  attachMonthOverMonth,
  buildProfitActionAlerts,
  chunkArray,
} from "../lib/ootsuki";
import type { KpiSnapshotEntry } from "../types/ootsuki";

function makeEntry(overrides: Partial<KpiSnapshotEntry> & { date: string }): KpiSnapshotEntry {
  return {
    id: overrides.date,
    title: overrides.date,
    weekStart: "",
    weekEnd: "",
    sales: 0,
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
    createdAt: `${overrides.date}T00:00:00.000Z`,
    ...overrides,
  };
}

test("chunkArray splits CSV save payloads into gateway-safe batches", () => {
  const rows = Array.from({ length: 12 }, (_, index) => index + 1);
  assert.deepEqual(chunkArray(rows, 5), [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12]]);
});

test("remainingRowsAfterBatch keeps unsaved and deferred dates for retry", () => {
  const requested = [{ date: "2026-08-01" }, { date: "2026-08-02" }, { date: "2026-08-03" }];
  const remaining = remainingRowsAfterBatch(requested, [
    { date: "2026-08-01", ok: true },
    { date: "2026-08-02", ok: false, deferred: true, message: "time_budget" },
  ]);
  assert.deepEqual(
    remaining.map((row) => row.date),
    ["2026-08-02", "2026-08-03"],
  );
});

test("nextCsvSaveChunkSize drops to 1 after a gateway timeout", () => {
  assert.equal(nextCsvSaveChunkSize(3, true), 1);
  assert.equal(nextCsvSaveChunkSize(3, false), 3);
});

test("canRetryCsvSave stops after the configured attempt limit", () => {
  assert.equal(canRetryCsvSave(0), true);
  assert.equal(canRetryCsvSave(5), true);
  assert.equal(canRetryCsvSave(6), false);
});

test("aggregateMonth sums daily entries within the calendar month only", () => {
  const entries = [
    makeEntry({ date: "2026-07-31", sales: 9000, customers: 9 }),
    makeEntry({ date: "2026-08-01", sales: 10000, customers: 10 }),
    makeEntry({ date: "2026-08-15", sales: 20000, customers: 15 }),
    makeEntry({ date: "2026-09-01", sales: 5000, customers: 5 }),
  ];
  const result = aggregateMonth(entries, new Date("2026-08-16T00:00:00.000Z"));
  assert.equal(result.monthStart, "2026-08-01");
  assert.equal(result.monthEnd, "2026-08-31");
  assert.equal(result.sales, 30000);
  assert.equal(result.customers, 25);
  assert.equal(result.totalDays, 2);
  assert.equal(result.averageSpend, 1200);
});

test("aggregateMonth returns an empty aggregate when no entries fall in the month", () => {
  const result = aggregateMonth([], new Date("2026-08-16T00:00:00.000Z"));
  assert.equal(result.sales, 0);
  assert.equal(result.totalDays, 0);
  assert.equal(result.monthStart, "2026-08-01");
  assert.equal(result.monthEnd, "2026-08-31");
});

test("aggregateMonthToDate stops at the reference date", () => {
  const entries = [
    makeEntry({ date: "2026-08-01", sales: 10000, customers: 10 }),
    makeEntry({ date: "2026-08-16", sales: 20000, customers: 20 }),
    makeEntry({ date: "2026-08-31", sales: 30000, customers: 30 }),
  ];
  const result = aggregateMonthToDate(entries, new Date("2026-08-16T00:00:00.000Z"));
  assert.equal(result.monthStart, "2026-08-01");
  assert.equal(result.monthEnd, "2026-08-16");
  assert.equal(result.sales, 30000);
  assert.equal(result.customers, 30);
  assert.equal(result.totalDays, 2);
});

test("aggregateMonthBusinessDays compares the same number of operating days", () => {
  const entries = [
    makeEntry({ date: "2025-08-01", sales: 10000, customers: 10 }),
    makeEntry({ date: "2025-08-03", sales: 20000, customers: 20 }),
    makeEntry({ date: "2025-08-04", sales: 30000, customers: 30 }),
  ];
  const result = aggregateMonthBusinessDays(entries, new Date("2025-08-01T00:00:00.000Z"), 2);
  assert.equal(result.monthStart, "2025-08-01");
  assert.equal(result.monthEnd, "2025-08-03");
  assert.equal(result.sales, 30000);
  assert.equal(result.customers, 30);
  assert.equal(result.totalDays, 2);
});

test("buildProfitActionAlerts can evaluate month-over-month profit signals", () => {
  const current = aggregateMonthToDate(
    [
      makeEntry({ date: "2026-08-01", sales: 10000, customers: 10, grossProfit: 5000 }),
      makeEntry({ date: "2026-08-02", sales: 10000, customers: 10, grossProfit: 5000 }),
    ],
    new Date("2026-08-02T00:00:00.000Z"),
  );
  const previous = aggregateMonthBusinessDays(
    [
      makeEntry({ date: "2026-07-01", sales: 10000, customers: 10, grossProfit: 7000 }),
      makeEntry({ date: "2026-07-02", sales: 10000, customers: 10, grossProfit: 7000 }),
      makeEntry({ date: "2026-07-03", sales: 50000, customers: 50, grossProfit: 35000 }),
    ],
    new Date("2026-07-01T00:00:00.000Z"),
    current.totalDays,
  );

  const alerts = buildProfitActionAlerts(attachMonthOverMonth(current, previous));

  assert.equal(alerts[0].title, "粗利率が悪化");
  assert.match(alerts[0].reason, /前月比/);
  assert.match(alerts[0].reason, /-28\.6%/);
});

test("uniqueWeekStarts de-duplicates weekly summary refresh dates", () => {
  assert.deepEqual(
    uniqueWeekStarts(["2026-08-10", "2026-08-11", "2026-08-17"], (date) =>
      date <= "2026-08-16" ? "2026-08-10" : "2026-08-17",
    ),
    ["2026-08-10", "2026-08-17"],
  );
});
