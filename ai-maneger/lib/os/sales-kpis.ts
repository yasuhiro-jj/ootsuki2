import {
  aggregateMonthBusinessDays,
  aggregateMonthToDate,
  calculateAverageSpend,
} from "@/lib/ootsuki";
import { num, pct, yen } from "@/lib/os/format";
import type { OsDashboardData } from "@/types/os";
import type { KpiSnapshotEntry } from "@/types/ootsuki";

/** 既存画面と同じ月間の損益分岐。設定値であり、日次売上からは計算しない。 */
export const MONTHLY_BREAK_EVEN = 4_060_000;

function jstCalendarDate(now: Date) {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = iso.split("-").map(Number);
  return { iso, year, month, day };
}

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function addUtcDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = utcDate(year, month, day);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shortDate(iso: string) {
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function inclusiveDays(start: string, end: string) {
  const span = Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`);
  return Math.round(span / 86_400_000) + 1;
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

/**
 * Notion の日次売上があるときだけ、KPI・売上パネル・損益の算出値を実績に差し替える。
 * 日次が無い、または取得できないときはサンプルのまま返す。
 */
export function applyNotionSales(
  data: OsDashboardData,
  entries: KpiSnapshotEntry[],
  now = new Date(),
): OsDashboardData {
  const daily = entries.filter((entry) => entry.date);
  if (daily.length === 0) return data;

  const today = jstCalendarDate(now);
  const todayUtc = utcDate(today.year, today.month, today.day);
  const yesterdayIso = addUtcDays(today.iso, -1);
  const latest = [...daily].sort((left, right) => (right.date || "").localeCompare(left.date || ""))[0];
  const yesterday = daily.find((entry) => entry.date === yesterdayIso) ?? daily
    .filter((entry) => (entry.date || "") <= yesterdayIso)
    .sort((left, right) => (right.date || "").localeCompare(left.date || ""))[0];
  const shownDay = yesterday ?? latest;
  const shownDate = shownDay.date || yesterdayIso;
  const isYesterday = shownDate === yesterdayIso;

  const month = aggregateMonthToDate(daily, todayUtc);
  const lastYearDate = utcDate(today.year - 1, today.month, today.day);
  const lastYearMonth = aggregateMonthBusinessDays(daily, lastYearDate, month.totalDays);
  const previousFromRows = daily
    .filter((entry) => entry.date && entry.date >= month.monthStart && entry.date <= month.monthEnd)
    .reduce((sum, entry) => sum + (entry.previousSales ?? 0), 0);
  const comparisonSales = previousFromRows > 0 ? previousFromRows : lastYearMonth.sales;
  const salesYoY = comparisonSales > 0 ? ((month.sales - comparisonSales) / comparisonSales) * 100 : undefined;

  const elapsed = inclusiveDays(month.monthStart, month.monthEnd || today.iso);
  const monthLength = daysInMonth(today.year, today.month);
  const forecast = elapsed > 0 ? (month.sales / elapsed) * monthLength : 0;
  const remaining = MONTHLY_BREAK_EVEN - month.sales;
  const achievement = (month.sales / MONTHLY_BREAK_EVEN) * 100;
  const monthLabel = `${today.month}月`;
  const daySpend = calculateAverageSpend(shownDay.sales, shownDay.customers);
  const monthSpend = calculateAverageSpend(month.sales, month.customers);

  const next: OsDashboardData = {
    ...data,
    businessDate: today.iso,
    generatedAt: now.toISOString(),
    kpis: data.kpis.map((metric) => ({ ...metric })),
    panels: data.panels.map((panel) => ({ ...panel, metrics: panel.metrics.map((metric) => ({ ...metric })) })),
    tasks: data.tasks.map((task) => ({ ...task, evidence: task.evidence.map((item) => ({ ...item })) })),
  };

  replaceMetric(next, "sales_yesterday", {
    label: isYesterday ? "売上（昨日）" : "売上（最新日）",
    value: yen(shownDay.sales),
    sub: shortDate(shownDate),
    origin: "actual",
    delta: undefined,
    deltaLabel: undefined,
  });
  replaceMetric(next, "sales_month", {
    label: `売上（${monthLabel}累計）`,
    value: yen(month.sales),
    sub: `${shortDate(month.monthStart)}〜${shortDate(month.monthEnd || today.iso)}`,
    origin: "actual",
  });
  if (salesYoY !== undefined) {
    replaceMetric(next, "sales_yoy", {
      label: `前年比（${monthLabel}）`,
      value: pct(salesYoY),
      delta: salesYoY,
      deltaLabel: "前年同期",
      goodWhen: "up",
      origin: "derived",
      sub: undefined,
    });
  }
  replaceMetric(next, "customers", {
    label: "客数",
    value: `${num(shownDay.customers)}人`,
    sub: `${monthLabel}累計 ${num(month.customers)}人`,
    origin: "actual",
  });
  replaceMetric(next, "avg_spend", {
    label: "客単価",
    value: yen(daySpend),
    sub: `${monthLabel}平均 ${yen(monthSpend)}（算出）`,
    origin: "derived",
  });

  replacePanelMetric(next, "sales_pos", "y", {
    label: isYesterday ? "昨日の売上" : "最新日の売上",
    value: yen(shownDay.sales),
    sub: shortDate(shownDate),
    origin: "actual",
  });
  replacePanelMetric(next, "sales_pos", "c", {
    label: "客数 / 客単価",
    value: `${num(shownDay.customers)}人 / ${yen(daySpend)}`,
    origin: "actual",
    sub: undefined,
  });
  replacePanelMetric(next, "sales_pos", "m", {
    label: `${monthLabel}累計`,
    value: yen(month.sales),
    sub: `${num(month.customers)}人`,
    origin: "actual",
  });

  replacePanelMetric(next, "finance", "rate", {
    label: `${monthLabel}の分岐達成率`,
    value: `${achievement.toFixed(1)}%`,
    sub: remaining > 0 ? `残り ${yen(remaining)}` : `超過 ${yen(Math.abs(remaining))}`,
    origin: "derived",
  });
  replacePanelMetric(next, "finance", "fc", {
    label: "月末着地（日割り試算）",
    value: yen(forecast),
    origin: "derived",
  });

  next.tasks = next.tasks.map((task) => {
    if (task.id !== "t1") return task;
    const gapText = remaining > 0 ? `残り約${yen(remaining)}` : `約${yen(Math.abs(remaining))}超過`;
    return {
      ...task,
      title: `${monthLabel}は損益分岐まで${gapText}。集客を強化`,
      whyNow: `${monthLabel}累計は損益分岐（月約¥406万）の${achievement.toFixed(1)}%。日割りの試算では月末着地が${yen(forecast)}。`,
      origin: "derived",
      evidence: [
        { metric: `${monthLabel}累計売上`, current: yen(month.sales), origin: "actual", source: "Notion 日次売上DB" },
        { metric: "損益分岐売上（月）", current: yen(MONTHLY_BREAK_EVEN), origin: "actual" },
        { metric: "月末着地（日割り試算）", current: yen(forecast), origin: "derived" },
      ],
    };
  });

  return next;
}
