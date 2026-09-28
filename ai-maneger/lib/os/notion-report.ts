import { isWeeklySummaryEntry } from "@/lib/ootsuki";
import type { OsDashboardData } from "@/types/os";
import type { KpiSnapshotEntry } from "@/types/ootsuki";

/** 時間帯別売上DBの1行。月の累計であり、1日の内訳ではない。 */
export type PeakBandEntry = {
  target: "売上" | "客数";
  source: string;
  peakText: string;
  hourlyTotals: { hour: string; value: number }[];
};

export type PeakMonth = {
  month: string;
  entries: PeakBandEntry[];
};

export type CategorySalesRow = {
  month: string;
  category: string;
  salesAmount: number;
  excluded?: boolean;
};

export type DrinkRatio = {
  month: string;
  periodLabel: string;
  allRate: number;
  inStoreRate: number | null;
};

export type TrialBalanceAccount = {
  account: string;
  /** 1=1月 … 12=12月。値が無い月はキーを置かない。 */
  amounts: Partial<Record<number, number>>;
};

export type TrialBalanceRates = {
  month: number;
  year?: number;
  periodLabel: string;
  costRate: number;
  flRatio: number;
  previousCostRate?: number;
  previousFlRatio?: number;
};

export type NotionReportOverlay = {
  peak?: PeakMonth | null;
  drink?: DrinkRatio | null;
  trial?: TrialBalanceRates | null;
};

const IN_STORE_CATEGORIES = new Set(["フード", "ランチ", "ドリンク"]);
const LABOR_BASE = ["給与手当", "法定福利費", "福利厚生費"] as const;

function oneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeLabel(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").trim();
}

/** 「¥567,217」のような文字列を数値にする。数値はそのまま返す。 */
export function parseYenAmount(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const cleaned = value.normalize("NFKC").replace(/[¥￥,\s]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasActivity(entry: KpiSnapshotEntry) {
  return entry.sales > 0 || entry.customers > 0;
}

function isWeeklyRow(entry: KpiSnapshotEntry) {
  return isWeeklySummaryEntry(entry) || entry.title.includes("週次");
}

/**
 * 日次集計に使ってよい行だけ残す。
 * 週次スナップショット（タイトルに「週次」）は日次に足さない。
 * 売上が入っている最終日より後の、売上0・客数0の行は先付けなので外す。
 */
export function selectDailySalesEntries(entries: KpiSnapshotEntry[]) {
  const dated = entries.filter((entry) => entry.date && !isWeeklyRow(entry));
  const lastActualDate =
    dated
      .filter(hasActivity)
      .map((entry) => entry.date as string)
      .sort()
      .at(-1) ?? null;
  if (!lastActualDate) return [];
  return dated.filter((entry) => hasActivity(entry) || (entry.date as string) <= lastActualDate);
}

export function formatYearMonth(month: string) {
  const matched = month.match(/^(\d{4})-(\d{1,2})$/);
  if (!matched) return month;
  return `${matched[1]}年${Number(matched[2])}月`;
}

function hourNumber(hour: string) {
  const matched = hour.match(/(\d{1,2})/);
  return matched ? Number(matched[1]) : 99;
}

function hourLabel(hour: string) {
  const matched = hour.match(/(\d{1,2})/);
  return matched ? `${Number(matched[1])}時` : hour;
}

/** 「11時494,588・12時438,550」を時間と金額に分ける。 */
export function parsePeakText(text: string) {
  const rows: { hour: string; value: number }[] = [];
  const pattern = /(\d{1,2})時\s*([\d,]+)/g;
  for (const match of text.matchAll(pattern)) {
    const value = Number(match[2].replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    rows.push({ hour: `${Number(match[1])}時`, value });
  }
  return rows;
}

function hoursOf(entry: PeakBandEntry | undefined) {
  if (!entry) return [];
  if (entry.hourlyTotals.length > 0) {
    return entry.hourlyTotals.map((row) => ({ hour: hourLabel(row.hour), value: row.value }));
  }
  return parsePeakText(entry.peakText);
}

function preferSource(entries: PeakBandEntry[], source: string) {
  return entries.find((entry) => normalizeLabel(entry.source).toUpperCase() === source) ?? entries[0];
}

function topHours(rows: { hour: string; value: number }[], count = 2) {
  return [...rows]
    .filter((row) => row.value > 0)
    .sort((left, right) => right.value - left.value || hourNumber(left.hour) - hourNumber(right.hour))
    .slice(0, count)
    .map((row) => row.hour);
}

/** 最新月のピーク。売上は POS、客数は USEN を優先する。 */
export function describeSalesPeak(month: PeakMonth | null | undefined) {
  if (!month || month.entries.length === 0) return null;
  const sales = preferSource(
    month.entries.filter((entry) => entry.target === "売上"),
    "POS",
  );
  const customers = preferSource(
    month.entries.filter((entry) => entry.target === "客数"),
    "USEN",
  );
  const salesTop = topHours(hoursOf(sales));
  const customerTop = topHours(hoursOf(customers));
  const top = salesTop.length > 0 ? salesTop : customerTop;
  if (top.length === 0) return null;
  const basis = salesTop.length > 0 ? "売上" : "客数";
  const customerNote = customerTop.length > 0 ? `客数の山は${customerTop.join("・")}。` : "";
  return {
    value: top.join("・"),
    sub: `${month.month}の月累計（${basis}）。${customerNote}1日ごとの時間帯ではない`,
  };
}

/** カテゴリ1の売上金額からドリンク比率を出す。対象は渡された行の中でいちばん新しい月。 */
export function drinkRatioFromCategorySales(rows: CategorySalesRow[]): DrinkRatio | null {
  const usable = rows.filter((row) => !row.excluded && row.month);
  if (usable.length === 0) return null;
  const month = [...usable.map((row) => row.month)].sort().at(-1) as string;
  let drink = 0;
  let all = 0;
  let inStore = 0;
  for (const row of usable) {
    if (row.month !== month) continue;
    const amount = row.salesAmount;
    if (!Number.isFinite(amount)) continue;
    all += amount;
    const category = normalizeLabel(row.category);
    if (category === "ドリンク") drink += amount;
    if (IN_STORE_CATEGORIES.has(category)) inStore += amount;
  }
  if (all <= 0 || drink <= 0) return null;
  return {
    month,
    periodLabel: formatYearMonth(month),
    allRate: oneDecimal((drink / all) * 100),
    inStoreRate: inStore > 0 ? oneDecimal((drink / inStore) * 100) : null,
  };
}

function accountKey(account: string) {
  return normalizeLabel(account);
}

function amountAt(rows: TrialBalanceAccount[], month: number, names: readonly string[]) {
  const wanted = new Set(names);
  let total = 0;
  let found = false;
  for (const row of rows) {
    const key = accountKey(row.account);
    if (key.includes("専従者")) continue;
    if (!wanted.has(key)) continue;
    const value = row.amounts[month];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    total += value;
    found = true;
  }
  return found ? total : null;
}

function laborNames(rows: TrialBalanceAccount[]) {
  const present = new Set(rows.map((row) => accountKey(row.account)));
  const names: string[] = [...LABOR_BASE];
  if (present.has("賞与手当")) names.push("賞与手当");
  else if (present.has("賞与")) names.push("賞与");
  if (!present.has("法定福利費") && present.has("法定福利")) names.push("法定福利");
  if (!present.has("福利厚生費") && present.has("福利厚生")) names.push("福利厚生");
  return names;
}

function rate(part: number | null, sales: number | null) {
  if (part === null || sales === null || sales <= 0) return null;
  return oneDecimal((part / sales) * 100);
}

/**
 * 推移試算表の月次から原価率とFLを計算する。
 * 人件費は給与手当・賞与手当・法定福利費・福利厚生費。専従者給与は含めない。
 * 売上高が入っている最後の月を使う。
 */
export function trialBalanceRates(rows: TrialBalanceAccount[], year?: number): TrialBalanceRates | null {
  const labor = laborNames(rows);
  let latest: number | null = null;
  for (let month = 1; month <= 12; month += 1) {
    const sales = amountAt(rows, month, ["売上高"]);
    if (sales !== null && sales > 0) latest = month;
  }
  if (latest === null) return null;
  const sales = amountAt(rows, latest, ["売上高"]);
  const cost = rate(amountAt(rows, latest, ["売上原価"]), sales);
  const fl = rate(amountAt(rows, latest, labor), sales);
  if (cost === null || fl === null) return null;

  let previousCost: number | undefined;
  let previousFl: number | undefined;
  for (let month = latest - 1; month >= 1; month -= 1) {
    const previousSales = amountAt(rows, month, ["売上高"]);
    const previousCostRate = rate(amountAt(rows, month, ["売上原価"]), previousSales);
    const previousFlRate = rate(amountAt(rows, month, labor), previousSales);
    if (previousCostRate === null || previousFlRate === null) continue;
    previousCost = previousCostRate;
    previousFl = previousFlRate;
    break;
  }

  const periodLabel = year ? `${year}年${latest}月` : `${latest}月`;
  return {
    month: latest,
    year,
    periodLabel,
    costRate: cost,
    flRatio: fl,
    previousCostRate: previousCost,
    previousFlRatio: previousFl,
  };
}

function replaceMetric(data: OsDashboardData, key: string, patch: Partial<OsDashboardData["kpis"][number]>) {
  data.kpis = data.kpis.map((metric) => (metric.key === key ? { ...metric, ...patch } : metric));
}

function replacePanelMetric(
  data: OsDashboardData,
  panelKey: string,
  metricKey: string,
  patch: Partial<OsDashboardData["kpis"][number]>,
) {
  data.panels = data.panels.map((panel) =>
    panel.key === panelKey
      ? { ...panel, metrics: panel.metrics.map((metric) => (metric.key === metricKey ? { ...metric, ...patch } : metric)) }
      : panel,
  );
}

/** 時間帯・ドリンク比率・推移試算表が取れた項目だけ差し替える。取れない項目は触らない。 */
export function applyNotionReportOverlays(data: OsDashboardData, overlay: NotionReportOverlay): OsDashboardData {
  const peak = overlay.peak ? describeSalesPeak(overlay.peak) : null;
  const drink = overlay.drink ?? null;
  const trial = overlay.trial ?? null;
  if (!peak && !drink && !trial) return data;

  const next: OsDashboardData = {
    ...data,
    kpis: data.kpis.map((metric) => ({ ...metric })),
    panels: data.panels.map((panel) => ({
      ...panel,
      metrics: panel.metrics.map((metric) => ({ ...metric })),
      findings: panel.findings,
    })),
  };

  if (peak) {
    replacePanelMetric(next, "sales_pos", "p", {
      label: "ピーク時間帯",
      value: peak.value,
      sub: peak.sub,
      origin: "derived",
      delta: undefined,
      deltaLabel: undefined,
    });
  }

  if (drink) {
    const inStore = drink.inStoreRate !== null ? `（店内${drink.inStoreRate.toFixed(1)}%）` : "";
    replaceMetric(next, "drink_ratio", {
      label: "ドリンク比率",
      value: `${drink.allRate.toFixed(1)}%`,
      sub: `${drink.periodLabel}・全カテゴリ${inStore}`,
      origin: "derived",
      goodWhen: "up",
      delta: undefined,
      deltaLabel: undefined,
    });
  }

  if (trial) {
    const cost = next.kpis.find((metric) => metric.key === "cost_rate");
    if (cost && cost.origin !== "derived") {
      replaceMetric(next, "cost_rate", {
        label: "原価率",
        value: `${trial.costRate.toFixed(1)}%`,
        sub: `${trial.periodLabel}・推移試算表（税込）`,
        origin: "derived",
        goodWhen: "down",
        delta: trial.previousCostRate !== undefined ? oneDecimal(trial.costRate - trial.previousCostRate) : undefined,
        deltaLabel: trial.previousCostRate !== undefined ? "前月差pt" : undefined,
      });
    }
    replaceMetric(next, "fl_ratio", {
      label: "FL比率",
      value: `${trial.flRatio.toFixed(1)}%`,
      sub: `${trial.periodLabel}・推移試算表（専従者給与を除く）`,
      origin: "derived",
      goodWhen: "down",
      delta: trial.previousFlRatio !== undefined ? oneDecimal(trial.flRatio - trial.previousFlRatio) : undefined,
      deltaLabel: trial.previousFlRatio !== undefined ? "前月差pt" : undefined,
    });
    next.panels = next.panels.map((panel) =>
      panel.key === "finance"
        ? {
            ...panel,
            statusNote: `原価率とFLは推移試算表（${trial.periodLabel}・税込）。専従者給与は含まない`,
          }
        : panel,
    );
  }

  return next;
}
