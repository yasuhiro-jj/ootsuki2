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

  const gapText = remaining > 0 ? `残り約${yen(remaining)}` : `約${yen(Math.abs(remaining))}超過`;
  next.tasks = next.tasks.map((task) => {
    if (task.id !== "t1") return task;
    return {
      ...task,
      title: `${monthLabel}は損益分岐まで${gapText}。集客の下書きを確認`,
      whyNow: `${monthLabel}累計は損益分岐（月約¥406万）の${achievement.toFixed(1)}%。日割りの試算では月末着地が${yen(forecast)}。`,
      proposal: "週末の来店理由を、LINE配信文とGoogle投稿の下書きにする。送信と投稿は人が行う。",
      expectedEffect: remaining > 0 ? "着地が分岐を下回る見込み" : "着地が分岐を上回る見込み",
      origin: "derived",
      evidence: [
        { metric: `${monthLabel}累計売上`, current: yen(month.sales), origin: "actual" as const, source: "USEN管理画面（Grok Bot）→ Notion日次" },
        { metric: "損益分岐売上（月）", current: yen(MONTHLY_BREAK_EVEN), origin: "actual" as const },
        { metric: "月末着地（日割り試算）", current: yen(forecast), origin: "derived" as const },
      ],
    };
  });

  next.panels = next.panels.map((panel) => {
    if (panel.key !== "finance") return panel;
    return {
      ...panel,
      findings: panel.findings.map((finding) =>
        finding.id === "f2"
          ? {
              ...finding,
              title: remaining > 0 ? `${monthLabel}は損益分岐に届かない見込み` : `${monthLabel}は損益分岐を超える見込み`,
              origin: "derived" as const,
              evidence: [],
            }
          : finding,
      ),
    };
  });

  const margin = weightedMargin(daily.filter((entry) => entry.date && entry.date >= month.monthStart && entry.date <= (month.monthEnd || today.iso)));
  const previousMargin = weightedMargin(
    daily.filter((entry) => {
      const previousEnd = addUtcDays(month.monthStart, -1);
      const previousStart = `${previousEnd.slice(0, 7)}-01`;
      return Boolean(entry.date && entry.date >= previousStart && entry.date <= previousEnd);
    }),
  );
  if (margin !== null) {
    replaceMetric(next, "cost_rate", {
      label: "粗利率",
      value: `${margin.toFixed(1)}%`,
      delta: previousMargin !== null ? margin - previousMargin : undefined,
      deltaLabel: previousMargin !== null ? "前月差pt" : undefined,
      goodWhen: "up",
      origin: "derived",
      sub: "日次の粗利から算出",
    });
  }

  const monthDays = daily.filter((entry) => entry.date && entry.date >= month.monthStart && entry.date <= (month.monthEnd || today.iso));
  const lineRegistrations = monthDays.reduce((sum, entry) => sum + entry.lineRegistrations, 0);
  const lineVisits = monthDays.reduce((sum, entry) => sum + entry.lineVisits, 0);
  if (lineRegistrations > 0) {
    replacePanelMetric(next, "line", "fr", {
      label: "今月の登録",
      value: `${num(lineRegistrations)}人`,
      origin: "actual",
      sub: "Notion日次",
    });
  }
  if (lineVisits > 0) {
    replacePanelMetric(next, "line", "lv", {
      label: "LINE経由来店（今月）",
      value: `${num(lineVisits)}人`,
      origin: "actual",
      sub: undefined,
    });
  }

  const drop = sameWeekdayCustomerDrop(daily, shownDate);
  if (drop) {
    next.panels = next.panels.map((panel) => {
      if (panel.key !== "sales_pos") return panel;
      const finding = {
        id: "sales-dow",
        agentKey: "sales" as const,
        detectorKey: "sales_drop_dow",
        kind: "problem" as const,
        title: `同じ曜日の客数が平均より ${drop.change.toFixed(0)}%`,
        severity: 3 as const,
        evidence: [],
        detectedAt: now.toISOString(),
        status: "open" as const,
        origin: "derived" as const,
      };
      const rest = panel.findings.filter((item) => item.id !== "f1" && item.id !== "sales-dow");
      return { ...panel, findings: [finding, ...rest] };
    });
  }

  return next;
}

function weightedMargin(entries: KpiSnapshotEntry[]) {
  let sales = 0;
  let profit = 0;
  for (const entry of entries) {
    if (entry.sales <= 0) continue;
    const entryProfit = entry.grossProfit > 0 ? entry.grossProfit : entry.sales * (entry.grossMarginRate / 100);
    if (entryProfit <= 0) continue;
    sales += entry.sales;
    profit += entryProfit;
  }
  if (sales <= 0 || profit <= 0) return null;
  return (profit / sales) * 100;
}

function sameWeekdayCustomerDrop(entries: KpiSnapshotEntry[], shownDate: string) {
  const current = entries.find((entry) => entry.date === shownDate);
  if (!current || current.customers <= 0) return null;
  const weekday = new Date(`${shownDate}T00:00:00.000Z`).getUTCDay();
  const peers = entries.filter((entry) => {
    if (!entry.date || entry.date >= shownDate) return false;
    return new Date(`${entry.date}T00:00:00.000Z`).getUTCDay() === weekday;
  });
  if (peers.length < 2) return null;
  const average = peers.reduce((sum, entry) => sum + entry.customers, 0) / peers.length;
  if (average <= 0) return null;
  const change = ((current.customers - average) / average) * 100;
  if (change > -10) return null;
  return { change, average, customers: current.customers };
}
