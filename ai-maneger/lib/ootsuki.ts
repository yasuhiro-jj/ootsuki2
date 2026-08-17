import type {
  DashboardMetricAlert,
  KpiSnapshotEntry,
  MonthlyAggregate,
  ProfitActionAlert,
  WeeklyAggregate,
} from "@/types/ootsuki";

const EMPTY_WEEK: WeeklyAggregate = {
  weekKey: "",
  weekStart: "",
  weekEnd: "",
  sales: 0,
  customers: 0,
  averageSpend: 0,
  grossMarginRate: 0,
  grossProfit: 0,
  lineRegistrations: 0,
  lineVisits: 0,
  notes: [],
  actions: [],
  totalDays: 0,
};

const EMPTY_MONTH: MonthlyAggregate = {
  monthKey: "",
  monthStart: "",
  monthEnd: "",
  sales: 0,
  customers: 0,
  averageSpend: 0,
  grossMarginRate: 0,
  grossProfit: 0,
  lineRegistrations: 0,
  lineVisits: 0,
  totalDays: 0,
};

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function parseDate(dateText?: string) {
  if (!dateText) return null;
  const date = new Date(`${dateText}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildWeekRange(reference: Date) {
  const date = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  const day = date.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() + diffToMonday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    weekStart: dateOnly(start),
    weekEnd: dateOnly(end),
  };
}

function buildMonthRange(reference: Date) {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return {
    monthStart: dateOnly(start),
    monthEnd: dateOnly(end),
  };
}

function percentDelta(current: number, previous: number) {
  if (!Number.isFinite(previous) || previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

export function calculateAverageSpend(sales: number, customers: number) {
  if (!Number.isFinite(sales) || !Number.isFinite(customers) || customers <= 0) return 0;
  return sales / customers;
}

export function formatYen(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

export function formatCount(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString("ja-JP")}人`;
}

export function formatPercentValue(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
}

export function formatPercentDelta(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "データなし";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

export function normalizeProductCodeKey(value: string) {
  return value.replace(/[^\dA-Za-z]/g, "").trim().toLowerCase();
}

export function normalizeProductMatchKey(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[()（）【】\[\]「」『』・\/]/g, "")
    .trim()
    .toLowerCase();
}

export function isWeeklySummaryEntry(entry: KpiSnapshotEntry) {
  return !entry.date && entry.title.includes("週次");
}

export function aggregateWeek(entries: KpiSnapshotEntry[], referenceDate: Date) {
  const { weekStart, weekEnd } = buildWeekRange(referenceDate);
  const weekEntries = entries.filter(
    (entry) => entry.date && entry.weekStart === weekStart && entry.weekEnd === weekEnd,
  );

  if (weekEntries.length === 0) {
    return {
      ...EMPTY_WEEK,
      weekKey: `${weekStart}_${weekEnd}`,
      weekStart,
      weekEnd,
    };
  }

  const sales = weekEntries.reduce((sum, entry) => sum + entry.sales, 0);
  const customers = weekEntries.reduce((sum, entry) => sum + entry.customers, 0);
  const grossProfit = weekEntries.reduce((sum, entry) => sum + entry.grossProfit, 0);
  const lineRegistrations = weekEntries.reduce((sum, entry) => sum + entry.lineRegistrations, 0);
  const lineVisits = weekEntries.reduce((sum, entry) => sum + entry.lineVisits, 0);

  return {
    weekKey: `${weekStart}_${weekEnd}`,
    weekStart,
    weekEnd,
    sales,
    customers,
    averageSpend: calculateAverageSpend(sales, customers),
    grossMarginRate: sales > 0 ? (grossProfit / sales) * 100 : 0,
    grossProfit,
    lineRegistrations,
    lineVisits,
    notes: weekEntries.map((entry) => entry.notes).filter(Boolean),
    actions: [],
    totalDays: weekEntries.length,
  };
}

export function aggregateMonthToDate(entries: KpiSnapshotEntry[], referenceDate: Date): MonthlyAggregate {
  const { monthStart, monthEnd } = buildMonthRange(referenceDate);
  const cutoff = dateOnly(referenceDate);
  const monthToDateEnd = cutoff < monthEnd ? cutoff : monthEnd;
  return aggregateMonthEntries(
    entries.filter((entry) => entry.date && entry.date >= monthStart && entry.date <= monthToDateEnd),
    monthStart,
    monthToDateEnd,
  );
}

export function aggregateMonthBusinessDays(
  entries: KpiSnapshotEntry[],
  referenceDate: Date,
  businessDays: number,
): MonthlyAggregate {
  const { monthStart, monthEnd } = buildMonthRange(referenceDate);
  const days = Math.max(0, Math.floor(businessDays));
  const monthEntries = entries
    .filter((entry) => entry.date && entry.date >= monthStart && entry.date <= monthEnd)
    .sort((left, right) => (left.date || "").localeCompare(right.date || ""))
    .slice(0, days);
  const lastIncludedDate = monthEntries.at(-1)?.date || monthStart;
  return aggregateMonthEntries(monthEntries, monthStart, lastIncludedDate);
}

function aggregateMonthEntries(
  monthEntries: KpiSnapshotEntry[],
  monthStart: string,
  monthEnd: string,
): MonthlyAggregate {
  if (monthEntries.length === 0) {
    return {
      ...EMPTY_MONTH,
      monthKey: `${monthStart}_${monthEnd}`,
      monthStart,
      monthEnd,
    };
  }

  const sales = monthEntries.reduce((sum, entry) => sum + entry.sales, 0);
  const customers = monthEntries.reduce((sum, entry) => sum + entry.customers, 0);
  const grossProfit = monthEntries.reduce((sum, entry) => sum + entry.grossProfit, 0);
  const lineRegistrations = monthEntries.reduce((sum, entry) => sum + entry.lineRegistrations, 0);
  const lineVisits = monthEntries.reduce((sum, entry) => sum + entry.lineVisits, 0);

  return {
    monthKey: `${monthStart}_${monthEnd}`,
    monthStart,
    monthEnd,
    sales,
    customers,
    averageSpend: calculateAverageSpend(sales, customers),
    grossMarginRate: sales > 0 ? (grossProfit / sales) * 100 : 0,
    grossProfit,
    lineRegistrations,
    lineVisits,
    totalDays: monthEntries.length,
  };
}

export function attachMonthOverMonth(
  current: MonthlyAggregate,
  previous?: MonthlyAggregate | null,
): MonthlyAggregate {
  if (!previous) return current;
  return {
    ...current,
    salesMoM: percentDelta(current.sales, previous.sales),
    customersMoM: percentDelta(current.customers, previous.customers),
    averageSpendMoM: percentDelta(current.averageSpend, previous.averageSpend),
    grossMarginRateMoM: percentDelta(current.grossMarginRate, previous.grossMarginRate),
    lineRegistrationsMoM: percentDelta(current.lineRegistrations, previous.lineRegistrations),
    lineVisitsMoM: percentDelta(current.lineVisits, previous.lineVisits),
  };
}

export function attachMonthYearOverYear(
  current: MonthlyAggregate,
  lastYear?: MonthlyAggregate | null,
): MonthlyAggregate {
  if (!lastYear) return current;
  return {
    ...current,
    salesYoY: percentDelta(current.sales, lastYear.sales),
    customersYoY: percentDelta(current.customers, lastYear.customers),
    averageSpendYoY: percentDelta(current.averageSpend, lastYear.averageSpend),
  };
}

export function attachWeekOverWeek(
  current: WeeklyAggregate,
  previous?: WeeklyAggregate | null,
): WeeklyAggregate {
  if (!previous) return current;
  return {
    ...current,
    salesWoW: percentDelta(current.sales, previous.sales),
    customersWoW: percentDelta(current.customers, previous.customers),
    averageSpendWoW: percentDelta(current.averageSpend, previous.averageSpend),
    grossMarginRateWoW: percentDelta(current.grossMarginRate, previous.grossMarginRate),
    lineRegistrationsWoW: percentDelta(current.lineRegistrations, previous.lineRegistrations),
    lineVisitsWoW: percentDelta(current.lineVisits, previous.lineVisits),
  };
}

export function attachYearOverYear(
  current: WeeklyAggregate,
  lastYear?: WeeklyAggregate | null,
): WeeklyAggregate {
  if (!lastYear) return current;
  return {
    ...current,
    salesYoY: percentDelta(current.sales, lastYear.sales),
    customersYoY: percentDelta(current.customers, lastYear.customers),
    averageSpendYoY: percentDelta(current.averageSpend, lastYear.averageSpend),
  };
}

type PeriodMetricSummary = Pick<
  WeeklyAggregate | MonthlyAggregate,
  "sales" | "customers" | "grossMarginRate"
>;

export function buildMetricAlerts(
  summary: PeriodMetricSummary,
  periodLabel = "今週",
): DashboardMetricAlert[] {
  return [
    {
      label: `${periodLabel}売上`,
      status: summary.sales > 0 ? "ok" : "missing",
      detail: summary.sales > 0 ? `${formatYen(summary.sales)} を記録済みです。` : `${periodLabel}売上がまだ入っていません。`,
    },
    {
      label: `${periodLabel}客数`,
      status: summary.customers > 0 ? "ok" : "missing",
      detail: summary.customers > 0 ? `${formatCount(summary.customers)} を記録済みです。` : "客数がまだ入っていません。",
    },
    {
      label: "粗利率",
      status: summary.grossMarginRate > 0 ? "ok" : "missing",
      detail:
        summary.grossMarginRate > 0
          ? `${formatPercentValue(summary.grossMarginRate)} を記録済みです。`
          : "粗利率がまだ入っていません。",
    },
  ];
}

type ProfitActionSummary = Pick<
  WeeklyAggregate | MonthlyAggregate,
  "sales" | "customers" | "averageSpend" | "grossMarginRate" | "totalDays"
> &
  Partial<Pick<WeeklyAggregate, "customersWoW" | "averageSpendWoW" | "grossMarginRateWoW">> &
  Partial<Pick<MonthlyAggregate, "customersMoM" | "averageSpendMoM" | "grossMarginRateMoM">>;

export function buildProfitActionAlerts(summary: ProfitActionSummary): ProfitActionAlert[] {
  const alerts: ProfitActionAlert[] = [];
  const isMonthly = typeof summary.grossMarginRateMoM === "number" ||
    typeof summary.averageSpendMoM === "number" ||
    typeof summary.customersMoM === "number";
  const comparisonLabel = isMonthly ? "前月比" : "前週比";
  const grossMarginRateDelta = summary.grossMarginRateMoM ?? summary.grossMarginRateWoW;
  const averageSpendDelta = summary.averageSpendMoM ?? summary.averageSpendWoW;
  const customersDelta = summary.customersMoM ?? summary.customersWoW;

  if (summary.sales <= 0 || summary.totalDays <= 0) {
    alerts.push({
      title: "データ不足",
      status: "watch",
      reason: "今週の日次入力が不足しているため、利益施策の判定精度が低い状態です。",
      actions: [
        "先に今週の売上・客数・粗利率を入力する",
        "未入力日がある場合は最優先で埋める",
      ],
    });
    return alerts;
  }

  if (typeof grossMarginRateDelta === "number" && grossMarginRateDelta <= -1.5) {
    alerts.push({
      title: "粗利率が悪化",
      status: "urgent",
      reason: `粗利率が${comparisonLabel} ${formatPercentDelta(grossMarginRateDelta)} です。値引き/原価上振れの確認が必要です。`,
      actions: [
        "値引き・返品が多い商品を上位3つ確認する",
        "原価率が高い商品の販促比率を今週だけ下げる",
        "粗利が残るセット/トッピング訴求に切り替える",
      ],
    });
  }

  if (typeof averageSpendDelta === "number" && averageSpendDelta <= -4) {
    alerts.push({
      title: "客単価が低下",
      status: "urgent",
      reason: `客単価が${comparisonLabel} ${formatPercentDelta(averageSpendDelta)} です。追加注文導線の弱化が疑われます。`,
      actions: [
        "会計前の追加提案トークを1フレーズ固定する",
        "高粗利のサイド/ドリンクをセット表示で先頭に出す",
        "単価上位商品の欠品・在庫切れを確認する",
      ],
    });
  }

  if (typeof customersDelta === "number" && customersDelta <= -6) {
    alerts.push({
      title: "客数が減少",
      status: "watch",
      reason: `客数が${comparisonLabel} ${formatPercentDelta(customersDelta)} です。来店動機の再提示が必要です。`,
      actions: [
        "LINE配信で来店理由を1つに絞って打ち出す",
        "曜日別で落ち込み日を特定し、限定施策を置く",
      ],
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      title: "利益指標は安定",
      status: "good",
      reason: "粗利率・客単価・客数とも大きな悪化は見られません。",
      actions: [
        "高粗利商品の販売比率を維持する",
        "今週の良かった施策を判断メモに残す",
      ],
    });
  }

  return alerts;
}

export function resolveWeekRange(referenceDate: string) {
  const parsed = parseDate(referenceDate) ?? new Date();
  return buildWeekRange(parsed);
}
