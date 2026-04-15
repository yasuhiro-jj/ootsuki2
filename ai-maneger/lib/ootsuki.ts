import type {
  DashboardMetricAlert,
  KpiSnapshotEntry,
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

export function buildMetricAlerts(summary: WeeklyAggregate): DashboardMetricAlert[] {
  return [
    {
      label: "今週売上",
      status: summary.sales > 0 ? "ok" : "missing",
      detail: summary.sales > 0 ? `${formatYen(summary.sales)} を記録済みです。` : "今週売上がまだ入っていません。",
    },
    {
      label: "今週客数",
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
    {
      label: "LINE関連",
      status: summary.lineRegistrations > 0 || summary.lineVisits > 0 ? "ok" : "missing",
      detail:
        summary.lineRegistrations > 0 || summary.lineVisits > 0
          ? `登録 ${formatCount(summary.lineRegistrations)} / 来店 ${formatCount(summary.lineVisits)}`
          : "LINE登録数・来店数がまだ入っていません。",
    },
  ];
}

export function resolveWeekRange(referenceDate: string) {
  const parsed = parseDate(referenceDate) ?? new Date();
  return buildWeekRange(parsed);
}
