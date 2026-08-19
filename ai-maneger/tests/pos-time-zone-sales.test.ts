import assert from "node:assert/strict";
import test from "node:test";
import { parsePosTimeZoneMetricCsv, summarizePosTimeZoneMetric } from "../lib/pos-time-zone-sales";

test("parsePosTimeZoneMetricCsv reads time-slot columns and daily/monthly rows", () => {
  const csv = [
    "店舗コード,店舗,営業日,11時,12時,13時,合計",
    "001,おおつき,2026/08/01(土),1000,2000,3000,6000",
    "001,おおつき,2026/08/02(日),500,1500,2500,4500",
    "001,おおつき,【合計】,1500,3500,5500,10500",
  ].join("\n");

  const rows = parsePosTimeZoneMetricCsv(csv);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].businessDate, "2026-08-01");
  assert.equal(rows[0].hourlyValues["11:00"], 1000);
  assert.equal(rows[2].rowType, "monthly-total");
  assert.equal(rows[2].total, 10500);
});

test("summarizePosTimeZoneMetric prefers monthly-total row for hourly peaks", () => {
  const csv = [
    "店舗コード,店舗,営業日,11時,12時,13時,合計",
    "001,おおつき,2026/08/01(土),1000,2000,3000,6000",
    "001,おおつき,2026/08/02(日),500,1500,2500,4500",
    "001,おおつき,【合計】,1500,3500,5500,10500",
  ].join("\n");

  const rows = parsePosTimeZoneMetricCsv(csv);
  const summary = summarizePosTimeZoneMetric(rows, "売上");

  assert.equal(summary.total, 10500);
  assert.equal(summary.dailyCount, 2);
  assert.deepEqual(summary.peakHours[0], { hour: "13:00", value: 5500 });
});

test("parsePosTimeZoneMetricCsv supports time-range columns", () => {
  const csv = [
    "店舗コード,店舗,営業日,11時〜14時,17時〜21時,合計",
    "001,おおつき,2026/08/01(土),1200,3400,4600",
    "001,おおつき,【合計】,1200,3400,4600",
  ].join("\n");

  const rows = parsePosTimeZoneMetricCsv(csv);
  assert.equal(rows[0].hourlyValues["11-14"], 1200);
  assert.equal(rows[0].hourlyValues["17-21"], 3400);
});

