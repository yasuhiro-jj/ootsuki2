import { parseCsv, parseNumberText } from "@/lib/usen-time-zone-sales";

export type PosTimeZoneRowType = "daily" | "monthly-total" | "other";

export type PosTimeZoneRow = {
  storeCode: string;
  storeName: string;
  businessDateLabel: string;
  businessDate?: string; // YYYY-MM-DD
  rowType: PosTimeZoneRowType;
  hourlyValues: Record<string, number>; // { "11:00": 123 }
  total: number;
};

export type PosTimeZoneMetricSummary = {
  metricLabel: string;
  total: number;
  dailyCount: number;
  hours: string[];
  hourlyTotals: Array<{ hour: string; value: number }>;
  peakHours: Array<{ hour: string; value: number }>;

  // daily分析用（表示に必要な最小限）
  dailyAnalysisRows: Array<{
    label: string;
    date?: string;
    weekday: string;
    total: number;
    peakHour: string;
    peakValue: number;
  }>;
  weekdayAnalysisRows: Array<{
    weekday: string;
    days: number;
    total: number;
    average: number;
    peakHour: string;
    peakValue: number;
  }>;

  // 追加の集計（曜日別の時間帯客単価など）で使うため、元の daily 行も保持
  rows: PosTimeZoneRow[];
};

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function normalizeHeader(value: string) {
  return stripBom(value).trim().replace(/^"+|"+$/g, "").replace(/\s+/g, "");
}

function normalizeDateLabel(value: string): string | undefined {
  const match = value.normalize("NFKC").match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return undefined;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function classifyRow(value: string): PosTimeZoneRowType {
  // POS CSVは「【合計】」「合計」などの行が混ざることがある
  const hasTotal = /【\s*合計\s*】/.test(value) || /^合計/.test(value) || /合計/.test(value);
  const normalizedDate = normalizeDateLabel(value);
  if (normalizedDate) return "daily";
  if (hasTotal) return "monthly-total";
  return "other";
}

function findColumn(headers: string[], candidates: string[]) {
  return headers.findIndex((header) => candidates.includes(header));
}

function parseTimeSlotKey(header: string): { key: string; sortKey: number } | null {
  const compact = header.normalize("NFKC").trim().replace(/\s+/g, "");

  // 例: 11時〜14時、11時-14時
  const range = compact.match(/^(\d{1,2})時.*?[〜\-](\d{1,2})時/);
  if (range) {
    const start = range[1];
    const end = range[2];
    return { key: `${start.padStart(2, "0")}-${end.padStart(2, "0")}`, sortKey: Number(start) };
  }

  // 例: 11:00
  const colon = compact.match(/^(\d{1,2}):(\d{2})$/);
  if (colon) {
    const hh = colon[1].padStart(2, "0");
    const mm = colon[2];
    return { key: `${hh}:${mm}`, sortKey: Number(colon[1]) };
  }

  // 例: 11時
  const hourOnly = compact.match(/^(\d{1,2})時$/);
  if (hourOnly) {
    const hh = hourOnly[1].padStart(2, "0");
    return { key: `${hh}:00`, sortKey: Number(hourOnly[1]) };
  }

  // 例: 11時台
  const hourTida = compact.match(/^(\d{1,2})時台$/);
  if (hourTida) {
    const hh = hourTida[1].padStart(2, "0");
    return { key: `${hh}:00`, sortKey: Number(hourTida[1]) };
  }

  return null;
}

function getHourSortKey(hourKey: string): number {
  // "11:00" / "11-14" の sortKey 用
  const m = hourKey.match(/^(\d{1,2})/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[1]);
}

function getWeekday(dateText?: string) {
  if (!dateText) return "-";
  const date = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return WEEKDAY_LABELS[date.getUTCDay()];
}

export function parsePosTimeZoneMetricCsv(text: string): PosTimeZoneRow[] {
  const records = parseCsv(text);
  if (records.length < 2) return [];

  const headers = records[0].map(normalizeHeader);

  const storeCodeIndex = findColumn(headers, ["店舗コード", "店コード", "店舗CD", "店CD"]);
  const storeNameIndex = findColumn(headers, ["店舗", "店名", "店舗名"]);
  const dateIndex = findColumn(headers, ["営業日", "日付", "当年日付", "日付メモ", "来店日"]);
  const totalIndex = findColumn(headers, ["合計", "総計", "当日合計"]);

  const hourColumns = headers
    .map((header, index) => {
      const slot = parseTimeSlotKey(header);
      return slot ? { index, ...slot } : null;
    })
    .filter((entry): entry is { index: number; key: string; sortKey: number } => Boolean(entry))
    .sort((a, b) => a.sortKey - b.sortKey);

  if (dateIndex < 0 || hourColumns.length === 0) return [];

  return records.slice(1).map((record) => {
    const businessDateLabel = record[dateIndex] || "";
    const hourlyValues = Object.fromEntries(
      hourColumns.map(({ index, key }) => [key, parseNumberText(record[index])]),
    );

    const sumHourly = Object.values(hourlyValues).reduce((sum, value) => sum + value, 0);

    const rowTotal = totalIndex >= 0 ? parseNumberText(record[totalIndex]) : sumHourly;

    return {
      storeCode: storeCodeIndex >= 0 ? record[storeCodeIndex] || "" : "",
      storeName: storeNameIndex >= 0 ? record[storeNameIndex] || "" : "",
      businessDateLabel,
      businessDate: normalizeDateLabel(businessDateLabel),
      rowType: classifyRow(businessDateLabel),
      hourlyValues,
      total: rowTotal,
    };
  });
}

export function summarizePosTimeZoneMetric(rows: PosTimeZoneRow[], metricLabel: string): PosTimeZoneMetricSummary {
  const dailyRows = rows.filter((row) => row.rowType === "daily");
  const monthlyTotalRow = rows.find((row) => row.rowType === "monthly-total");
  const basisRows = monthlyTotalRow ? [monthlyTotalRow] : dailyRows;

  const hours = Array.from(new Set(basisRows.flatMap((row) => Object.keys(row.hourlyValues)))).sort((a, b) => {
    return getHourSortKey(a) - getHourSortKey(b);
  });

  const hourlyTotals = hours.map((hour) => ({
    hour,
    value: basisRows.reduce((sum, row) => sum + (row.hourlyValues[hour] || 0), 0),
  }));

  const total = monthlyTotalRow?.total ?? dailyRows.reduce((sum, row) => sum + row.total, 0);
  const dailyCount = dailyRows.length;

  const peakHours = [...hourlyTotals]
    .sort((left, right) => right.value - left.value)
    .slice(0, 3)
    .filter((row) => row.value > 0);

  const dailyAnalysisRows = dailyRows
    .map((row) => {
      const [peak] = Object.entries(row.hourlyValues).sort((left, right) => right[1] - left[1]);
      return {
        label: row.businessDateLabel,
        date: row.businessDate,
        weekday: getWeekday(row.businessDate),
        total: row.total,
        peakHour: peak?.[0] ?? "-",
        peakValue: peak?.[1] ?? 0,
      };
    })
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const weekdayAnalysisRows = WEEKDAY_LABELS.map((weekday) => {
    const rowsForWeekday = dailyRows.filter((row) => getWeekday(row.businessDate) === weekday);

    const totalForWeekday = rowsForWeekday.reduce((sum, row) => sum + row.total, 0);
    const averageForWeekday = rowsForWeekday.length > 0 ? totalForWeekday / rowsForWeekday.length : 0;

    const hourlyTotalsMap = new Map<string, number>();
    for (const row of rowsForWeekday) {
      for (const [hour, value] of Object.entries(row.hourlyValues)) {
        hourlyTotalsMap.set(hour, (hourlyTotalsMap.get(hour) || 0) + value);
      }
    }

    const [peak] = [...hourlyTotalsMap.entries()].sort((left, right) => right[1] - left[1]);
    return {
      weekday,
      days: rowsForWeekday.length,
      total: totalForWeekday,
      average: averageForWeekday,
      peakHour: peak?.[0] ?? "-",
      peakValue: peak?.[1] ?? 0,
    };
  }).filter((row) => row.days > 0);

  return {
    metricLabel,
    total,
    dailyCount,
    hours,
    hourlyTotals,
    peakHours,
    dailyAnalysisRows,
    weekdayAnalysisRows,
    rows,
  };
}

