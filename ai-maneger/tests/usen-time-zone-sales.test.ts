import assert from "node:assert/strict";
import test from "node:test";
import {
  parseNumberText,
  parseUsenTimeZoneSalesCsv,
  summarizeUsenTimeZoneSales,
} from "../lib/usen-time-zone-sales";

test("parseNumberText reads yen-formatted values", () => {
  assert.equal(parseNumberText("¥7,860"), 7860);
  assert.equal(parseNumberText("￥16,290"), 16290);
});

test("parseUsenTimeZoneSalesCsv reads daily and monthly total rows", () => {
  const csv = [
    "店舗コード,店舗,営業日,集計対象,11時,12時,13時,合計",
    "001,おおつき,2026/08/01(土),注文金額,1000,2000,3000,6000",
    "001,おおつき,2026/08/02(日),注文金額,500,1500,2500,4500",
    "001,おおつき,【合計】,注文金額,1500,3500,5500,10500",
    "001,おおつき,【月曜 平均】,注文金額,100,200,300,600",
  ].join("\n");

  const rows = parseUsenTimeZoneSalesCsv(csv);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].businessDate, "2026-08-01");
  assert.equal(rows[0].hourlySales["11:00"], 1000);
  assert.equal(rows[2].rowType, "monthly-total");
  assert.equal(rows[3].rowType, "weekday-average");
});

test("parseUsenTimeZoneSalesCsv supports tab-delimited USEN exports", () => {
  const csv = [
    '"店舗コード"\t"店舗"\t"営業日"\t"集計対象"\t"11時"\t"12時"\t"合計"',
    '"001"\t"おおつき"\t"2026/08/01(土)"\t"注文金額"\t"￥7,860"\t"￥16,290"\t"￥24,150"',
  ].join("\n");

  const rows = parseUsenTimeZoneSalesCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].hourlySales["11:00"], 7860);
  assert.equal(rows[0].total, 24150);
});

test("summarizeUsenTimeZoneSales prefers the monthly total row for hourly peaks", () => {
  const rows = parseUsenTimeZoneSalesCsv(
    [
      "店舗コード,店舗,営業日,集計対象,11時,12時,13時,合計",
      "001,おおつき,2026/08/01(土),注文金額,1000,2000,3000,6000",
      "001,おおつき,2026/08/02(日),注文金額,500,1500,2500,4500",
      "001,おおつき,【合計】,注文金額,1500,3500,5500,10500",
    ].join("\n"),
  );

  const summary = summarizeUsenTimeZoneSales(rows);
  assert.equal(summary.total, 10500);
  assert.equal(summary.dailyCount, 2);
  assert.deepEqual(summary.peakHours[0], { hour: "13:00", value: 5500 });
});
