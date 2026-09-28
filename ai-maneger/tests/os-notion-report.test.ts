import assert from "node:assert/strict";
import test from "node:test";
import { scrubUnconnectedSamples } from "../lib/os/live-mode";
import {
  applyNotionReportOverlays,
  describeSalesPeak,
  drinkRatioFromCategorySales,
  parsePeakText,
  parseYenAmount,
  selectDailySalesEntries,
  trialBalanceRates,
} from "../lib/os/notion-report";
import { applyNotionSales } from "../lib/os/sales-kpis";
import { osSampleData } from "../mock/os-sample";
import type { KpiSnapshotEntry } from "../types/ootsuki";

function entry(date: string, sales: number, customers: number, extra: Partial<KpiSnapshotEntry> = {}): KpiSnapshotEntry {
  return {
    id: date || extra.title || "row",
    title: extra.title || date,
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
    createdAt: "2026-09-28T00:00:00.000Z",
    ...extra,
  };
}

test("先付けの0円と週次集計は日次の累計に入れない", () => {
  const now = new Date("2026-09-29T15:00:00.000Z");
  const rows = [
    entry("2026-09-28", 90_950, 50),
    entry("2026-09-29", 0, 0, { source: "CSV取込: 2026-09-29" }),
    entry("2026-09-30", 0, 0, { source: "CSV取込: 2026-09-30" }),
    entry("2026-09-28", 90_950, 50, { title: "週次集計 2026-09-28" }),
    entry("", 90_950, 50, { title: "週次集計 2026-09-28" }),
  ];
  assert.equal(selectDailySalesEntries(rows).length, 1);

  const result = applyNotionSales(osSampleData, rows, now);
  const shown = result.kpis.find((metric) => metric.key === "sales_yesterday");
  const month = result.kpis.find((metric) => metric.key === "sales_month");
  const forecast = result.panels.find((panel) => panel.key === "finance")?.metrics.find((metric) => metric.key === "fc");
  assert.equal(shown?.label, "売上（最新日）");
  assert.equal(shown?.value, "¥90,950");
  assert.equal(shown?.sub, "9/28");
  assert.equal(month?.value, "¥90,950");
  assert.equal(month?.sub, "9/1〜9/28");
  assert.equal(forecast?.value, "¥97,446");
});

test("売上も客数も0の行しか無いときはサンプルのまま", () => {
  const rows = [entry("2026-09-29", 0, 0), entry("2026-09-30", 0, 0)];
  const result = applyNotionSales(osSampleData, rows, new Date("2026-09-29T15:00:00.000Z"));
  assert.equal(result, osSampleData);
});

test("円記号つきの売上金額とカテゴリ合計からドリンク比率を出す", () => {
  assert.equal(parseYenAmount("¥567,217"), 567_217);
  assert.equal(parseYenAmount("¥180"), 180);
  const ratio = drinkRatioFromCategorySales([
    { month: "2026-08", category: "ドリンク", salesAmount: parseYenAmount("¥567,217") },
    { month: "2026-08", category: "フード", salesAmount: 2_000_000 },
    { month: "2026-08", category: "ランチ", salesAmount: 1_136_575 },
    { month: "2026-08", category: "弁当", salesAmount: 747_203 },
    { month: "2026-08", category: "ドリンク", salesAmount: 9_999, excluded: true },
    { month: "2026-07", category: "ドリンク", salesAmount: 1 },
  ]);
  assert.equal(ratio?.periodLabel, "2026年8月");
  assert.equal(ratio?.allRate, 12.7);
  assert.equal(ratio?.inStoreRate, 15.3);
});

test("推移試算表の8月は原価率41.0%・FL70.5%で専従者給与を含めない", () => {
  const rates = trialBalanceRates(
    [
      { account: "売上高", amounts: { 7: 1_000_000, 8: 4_632_831, 9: 0 } },
      { account: "売上原価", amounts: { 7: 534_000, 8: 1_898_092 } },
      { account: "給与手当", amounts: { 7: 400_000, 8: 1_365_658 } },
      { account: "賞与手当", amounts: { 7: 200_000, 8: 500_000 } },
      { account: "法定福利費", amounts: { 7: 150_000, 8: 800_000 } },
      { account: "福利厚生費", amounts: { 7: 100_000, 8: 600_487 } },
      { account: "専従者給与", amounts: { 8: 200_000 } },
    ],
    2026,
  );
  assert.equal(rates?.periodLabel, "2026年8月");
  assert.equal(rates?.costRate, 41);
  assert.equal(rates?.flRatio, 70.5);
  assert.equal(rates?.previousCostRate, 53.4);
  assert.equal(rates?.previousFlRatio, 85);
});

test("ピークは月累計の売上上位で、客数の山も添える", () => {
  const parsed = parsePeakText("11時494,588・12時438,550・18時423,754");
  assert.equal(parsed[0]?.value, 494_588);
  const peak = describeSalesPeak({
    month: "2026-09",
    entries: [
      {
        target: "売上",
        source: "POS",
        peakText: "11時494,588・12時438,550・18時423,754",
        hourlyTotals: [],
      },
      {
        target: "客数",
        source: "USEN",
        peakText: "11時413・12時358・17時162",
        hourlyTotals: [],
      },
    ],
  });
  assert.equal(peak?.value, "11時・12時");
  assert.match(peak?.sub ?? "", /2026-09の月累計/);
  assert.match(peak?.sub ?? "", /客数の山は11時・12時/);
  assert.match(peak?.sub ?? "", /1日ごとの時間帯ではない/);
});

test("レポートの実数は未接続の掃除で残し、口コミなどは未接続のまま", () => {
  const drink = drinkRatioFromCategorySales([
    { month: "2026-08", category: "ドリンク", salesAmount: 567_217 },
    { month: "2026-08", category: "フード", salesAmount: 3_883_778 },
  ]);
  const trial = trialBalanceRates(
    [
      { account: "売上高", amounts: { 8: 4_632_831 } },
      { account: "売上原価", amounts: { 8: 1_898_092 } },
      { account: "給与手当", amounts: { 8: 1_365_658 } },
      { account: "賞与手当", amounts: { 8: 500_000 } },
      { account: "法定福利費", amounts: { 8: 800_000 } },
      { account: "福利厚生費", amounts: { 8: 600_487 } },
    ],
    2026,
  );
  const overlaid = applyNotionReportOverlays(osSampleData, {
    peak: {
      month: "2026-09",
      entries: [
        { target: "売上", source: "POS", peakText: "11時100・12時80", hourlyTotals: [] },
      ],
    },
    drink,
    trial,
  });
  const live = applyNotionSales(overlaid, [entry("2026-09-28", 90_950, 50)], new Date("2026-09-29T03:00:00.000Z"));
  const scrubbed = scrubUnconnectedSamples(live);
  assert.equal(scrubbed.kpis.find((metric) => metric.key === "drink_ratio")?.value, "12.7%");
  assert.equal(scrubbed.kpis.find((metric) => metric.key === "drink_ratio")?.sub, "2026年8月・全カテゴリ（店内12.7%）");
  assert.equal(scrubbed.kpis.find((metric) => metric.key === "cost_rate")?.label, "原価率");
  assert.equal(scrubbed.kpis.find((metric) => metric.key === "cost_rate")?.value, "41.0%");
  assert.equal(scrubbed.kpis.find((metric) => metric.key === "fl_ratio")?.value, "70.5%");
  assert.equal(scrubbed.panels.find((panel) => panel.key === "sales_pos")?.metrics.find((metric) => metric.key === "p")?.value, "11時・12時");
  assert.equal(scrubbed.panels.find((panel) => panel.key === "meo")?.metrics.find((metric) => metric.key === "r")?.value, "未接続");
  assert.equal(scrubbed.panels.find((panel) => panel.key === "instagram")?.metrics.find((metric) => metric.key === "fo")?.origin, "unavailable");
  assert.equal(scrubbed.panels.find((panel) => panel.key === "seo")?.metrics.find((metric) => metric.key === "cl")?.value, "未接続");
  assert.equal(scrubbed.panels.find((panel) => panel.key === "ga4")?.metrics.find((metric) => metric.key === "s")?.value, "未接続");
  assert.equal(scrubbed.panels.find((panel) => panel.key === "inquiry")?.metrics.find((metric) => metric.key === "n")?.value, "未接続");
  assert.equal(scrubbed.panels.find((panel) => panel.key === "line")?.metrics.find((metric) => metric.key === "fr")?.value, "未接続");
});

test("日次の粗利率があるときは推移試算表の原価率で上書きしない", () => {
  const withMargin = applyNotionSales(
    osSampleData,
    [entry("2026-09-27", 40_000, 20, { grossProfit: 20_000 })],
    new Date("2026-09-28T03:00:00.000Z"),
  );
  const trial = trialBalanceRates(
    [
      { account: "売上高", amounts: { 8: 100 } },
      { account: "売上原価", amounts: { 8: 41 } },
      { account: "給与手当", amounts: { 8: 70 } },
    ],
    2026,
  );
  const overlaid = applyNotionReportOverlays(withMargin, { trial });
  assert.equal(overlaid.kpis.find((metric) => metric.key === "cost_rate")?.label, "粗利率");
  assert.equal(overlaid.kpis.find((metric) => metric.key === "fl_ratio")?.origin, "derived");
});
